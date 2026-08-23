"""
AI 챗봇 - Claude API 도구 호출(tool use) 기반. 모델이 숫자를 스스로 계산/추정하지
못하게, 모든 지표는 이 파일의 tool_* 함수가 계산해서 JSON으로 돌려주고 모델은 그
값만 근거로 답변한다. 기존 Streamlit 버전(ai_insights/chatbot.py)의 로직을 그대로
옮기되, 데이터 소스만 로컬 CSV -> Supabase(data.py)로 바꿨다.
"""

import os
import json
import uuid
import contextvars
from datetime import datetime, timezone

import anthropic
import pandas as pd
from fastapi import APIRouter, Depends
from pydantic import BaseModel

import data
from data import CHANNEL_KR, PERSONA_KR
from utils.rfm import calculate_rfm, assign_segment
import auth
import campaign_builder

router = APIRouter()

# propose_campaign이 세그먼트를 지칭할 때 쓰는 페르소나 라벨(PERSONA_KR과 동일) ->
# campaign_builder.py의 채널 라벨과 다른 별도의 채널 목록(원본 Streamlit 버전과 동일하게
# 유지 - "SMS"/"웹푸시" 표기가 campaign_builder.CHANNEL_META의 "문자(SMS/LMS)"/"웹 푸시"와
# 다르다. 실행 시에만 매핑한다).
CAMPAIGN_CHANNELS = ["카카오톡", "SMS", "이메일", "웹푸시"]
_CHANNEL_LABEL_TO_KEY = {"카카오톡": "kakao", "SMS": "sms", "이메일": "email", "웹푸시": "webpush"}

# 로그인한 회사의 dataset_source를 요청 처리 동안만 담아두는 컨텍스트 변수.
# tool_* 함수들은 Claude가 채우는 인자(start_date 등)만 받게 하고 싶어서(모델에게
# dataset_source를 스스로 넘기게 하면 다른 회사 데이터를 요청하도록 조작될 위험이
# 있다), 요청을 받은 chat() 핸들러가 세션에서 읽은 값을 여기 넣어두고 도구들이
# 이걸 읽어가는 방식을 쓴다.
_current_dataset_source: contextvars.ContextVar[str] = contextvars.ContextVar("dataset_source", default="athlepa")


# ---------------------------------------------------------
# 도구(tool) 함수들 - 전부 JSON 직렬화 가능한 dict를 반환한다
# ---------------------------------------------------------

def _period_slices(start_date: str, end_date: str):
    orders, events = data.load(_current_dataset_source.get())
    start, end = pd.Timestamp(start_date).date(), pd.Timestamp(end_date).date()
    period_orders = orders[(orders["order_date"].dt.date >= start) & (orders["order_date"].dt.date <= end)] if not orders.empty else orders
    period_events = events[(events["timestamp"].dt.date >= start) & (events["timestamp"].dt.date <= end)] if not events.empty else events
    return period_orders, period_events


def _compute_repeat_purchase_rate(orders: pd.DataFrame) -> float:
    if orders.empty:
        return 0.0
    counts = orders.groupby("user_id").size()
    return (counts >= 2).sum() / counts.shape[0] * 100 if counts.shape[0] else 0.0


def _annotate_rank_deviation(items: list, value_key: str) -> list:
    """순위형 목록에 '평균 대비 배율', '1위와의 격차(%)'를 미리 계산해서 붙인다 - 모델이
    스스로 눈에 띄는 포인트를 찾게 하는 대신, 코드가 미리 찾아서 넘겨준다."""
    if not items:
        return items
    values = [it[value_key] for it in items]
    avg = sum(values) / len(values)
    top = values[0]
    for it in items:
        it["평균_대비_배율"] = round(it[value_key] / avg, 2) if avg else None
        it["1위와의_격차_퍼센트"] = round((top - it[value_key]) / top * 100, 1) if top else 0.0
    return items


_PERSONA_KR_TO_KEY = {v: k for k, v in PERSONA_KR.items()}


def _age_bucket(age) -> str:
    decade = int(age) // 10 * 10
    return "60대 이상" if decade >= 60 else f"{decade}대"


def _users_matching_dimension(dimension: str, value: str) -> set:
    """성별/연령대/페르소나/세그먼트 중 하나의 축에서, 특정 항목 값에 해당하는
    user_id 집합을 돌려준다. get_segment_deep_dive가 '이 항목만' 걸러내는 데 쓴다."""
    users = data.load_users(_current_dataset_source.get())
    if dimension == "성별":
        code = {"여성": "F", "남성": "M"}.get(value, value)
        return set(users.loc[users["gender"] == code, "user_id"]) if "gender" in users.columns else set()
    if dimension == "연령대":
        if "age" not in users.columns:
            return set()
        buckets = users["age"].apply(_age_bucket)
        return set(users.loc[buckets == value, "user_id"])
    if dimension == "페르소나":
        if "persona_type" not in users.columns:
            return set()
        key = _PERSONA_KR_TO_KEY.get(value, value)
        return set(users.loc[users["persona_type"] == key, "user_id"])
    if dimension == "세그먼트":
        orders_all, _ = data.load(_current_dataset_source.get())
        if orders_all.empty:
            return set()
        rfm = assign_segment(calculate_rfm(orders_all.copy()))
        return set(rfm.loc[rfm["segment"] == value, "user_id"])
    return set()


def tool_get_segment_deep_dive(dimension: str, value: str, start_date: str, end_date: str) -> dict:
    """특정 축(성별/연령대/페르소나/세그먼트)의 항목 하나를 골라, 그 고객군이 다른
    축(카테고리/채널/연령대)에서는 어떻게 분포하는지와 나머지 고객 대비 구매 행동이
    어떻게 다른지를 반환한다. '이 항목이 몇 %인지'는 이미 차트에 보이니, 차트
    하나만 봐서는 알 수 없는 교차 정보를 주는 게 이 도구의 목적이다."""
    target_ids = _users_matching_dimension(dimension, value)
    if not target_ids:
        return {"오류": f"{dimension} '{value}'에 해당하는 고객을 찾을 수 없습니다."}

    period_orders, _ = _period_slices(start_date, end_date)
    users = data.load_users(_current_dataset_source.get())

    target_orders = period_orders[period_orders["user_id"].isin(target_ids)]
    other_orders = period_orders[~period_orders["user_id"].isin(target_ids)]

    def top_breakdown(df, col, n=5):
        if df.empty or col not in df.columns:
            return []
        g = df.groupby(col)["total_amount"].sum().sort_values(ascending=False).head(n)
        items = [{"항목": str(k), "매출": int(v)} for k, v in g.items()]
        return _annotate_rank_deviation(items, "매출")

    category_breakdown = top_breakdown(target_orders, "category")

    channel_breakdown = []
    if "acquisition_channel" in users.columns and not target_orders.empty:
        merged = target_orders.merge(users[["user_id", "acquisition_channel"]], on="user_id")
        if not merged.empty:
            g = merged.groupby("acquisition_channel")["total_amount"].sum().sort_values(ascending=False)
            items = [{"항목": CHANNEL_KR.get(k, k), "매출": int(v)} for k, v in g.items()]
            channel_breakdown = _annotate_rank_deviation(items, "매출")

    age_breakdown = []
    if dimension != "연령대" and "age" in users.columns:
        target_users = users[users["user_id"].isin(target_ids)]
        buckets = target_users["age"].apply(_age_bucket).value_counts()
        order = ["10대", "20대", "30대", "40대", "50대", "60대 이상"]
        age_breakdown = [{"연령대": k, "고객수": int(buckets.get(k, 0))} for k in order if buckets.get(k, 0) > 0]
        age_breakdown.sort(key=lambda r: r["고객수"], reverse=True)

    target_revenue = float(target_orders["total_amount"].sum())
    other_revenue = float(other_orders["total_amount"].sum())
    target_aov = target_revenue / len(target_orders) if len(target_orders) else 0
    other_aov = other_revenue / len(other_orders) if len(other_orders) else 0

    return {
        "기간": f"{start_date} ~ {end_date}",
        "조건": f"{dimension} = {value}",
        "대상_고객수": len(target_ids),
        "대상_주문수": len(target_orders),
        "대상_AOV": int(target_aov),
        "나머지_고객_AOV": int(other_aov),
        "AOV_격차_퍼센트": round((target_aov - other_aov) / other_aov * 100, 1) if other_aov else None,
        "이_그룹의_카테고리별_매출_TOP5": category_breakdown,
        "이_그룹의_유입채널별_매출_TOP5": channel_breakdown,
        "이_그룹의_연령대_분포": age_breakdown,
    }


def tool_get_kpi_summary(start_date: str, end_date: str) -> dict:
    period_orders, period_events = _period_slices(start_date, end_date)
    gmv = period_orders["total_amount"].sum()
    order_count = len(period_orders)
    aov = gmv / order_count if order_count > 0 else 0

    purchase_users = period_events[period_events["event_type"] == "purchase"]["user_id"].nunique() if not period_events.empty else 0
    all_visitors = period_events["user_id"].nunique() if not period_events.empty else 0
    conversion_rate = (purchase_users / all_visitors * 100) if all_visitors > 0 else 0

    cart_users = period_events[period_events["event_type"] == "add_to_cart"]["user_id"].nunique() if not period_events.empty else 0
    cart_abandon_rate = (1 - purchase_users / cart_users) * 100 if cart_users > 0 else 0

    return {
        "기간": f"{start_date} ~ {end_date}",
        "GMV": int(gmv), "AOV": int(aov), "주문_건수": order_count,
        "활성_고객_수": int(all_visitors),
        "구매_전환율_퍼센트": round(conversion_rate, 1),
        "장바구니_이탈률_퍼센트": round(cart_abandon_rate, 1),
        "재구매율_퍼센트": round(_compute_repeat_purchase_rate(period_orders), 1),
    }


def tool_get_category_breakdown(start_date: str, end_date: str) -> dict:
    period_orders, _ = _period_slices(start_date, end_date)
    if period_orders.empty:
        return {"기간": f"{start_date} ~ {end_date}", "카테고리별_매출": []}
    breakdown = period_orders.groupby("category")["total_amount"].sum().sort_values(ascending=False)
    items = [{"카테고리": k, "매출": int(v)} for k, v in breakdown.items()]
    return {"기간": f"{start_date} ~ {end_date}", "카테고리별_매출": _annotate_rank_deviation(items, "매출")}


def tool_get_channel_breakdown(start_date: str, end_date: str) -> dict:
    period_orders, _ = _period_slices(start_date, end_date)
    users = data.load_users(_current_dataset_source.get())
    if period_orders.empty or users.empty:
        return {"기간": f"{start_date} ~ {end_date}", "채널별_매출": []}
    merged = period_orders.merge(users[["user_id", "acquisition_channel"]], on="user_id")
    breakdown = merged.groupby("acquisition_channel")["total_amount"].sum().sort_values(ascending=False)
    items = [{"채널": CHANNEL_KR.get(k, k), "매출": int(v)} for k, v in breakdown.items()]
    return {"기간": f"{start_date} ~ {end_date}", "채널별_매출": _annotate_rank_deviation(items, "매출")}


def tool_get_segment_breakdown(start_date: str, end_date: str) -> dict:
    period_orders, _ = _period_slices(start_date, end_date)
    if period_orders.empty:
        return {"기간": f"{start_date} ~ {end_date}", "세그먼트별_매출": []}
    rfm = assign_segment(calculate_rfm(period_orders.copy()))
    breakdown = rfm.groupby("segment", observed=True)["Monetary"].sum().sort_values(ascending=False)
    items = [{"세그먼트": str(k), "매출": int(v)} for k, v in breakdown.items()]
    return {"기간": f"{start_date} ~ {end_date}", "세그먼트별_매출": _annotate_rank_deviation(items, "매출")}


def tool_get_persona_counts() -> dict:
    users = data.load_users(_current_dataset_source.get())
    if users.empty or "persona_type" not in users.columns:
        return {"전체_고객_수": 0, "페르소나별_고객_수": []}
    counts = users["persona_type"].value_counts()
    items = [{"페르소나": PERSONA_KR.get(k, k), "고객수": int(v)} for k, v in counts.items()]
    return {"전체_고객_수": len(users), "페르소나별_고객_수": _annotate_rank_deviation(items, "고객수")}


def tool_get_cohort_retention(start_date: str, end_date: str) -> dict:
    orders, _ = data.load(_current_dataset_source.get())
    users = data.load_users(_current_dataset_source.get())
    if orders.empty or users.empty or "signup_date" not in users.columns:
        return {"기간": f"{start_date} ~ {end_date}", "안내": "데이터가 없습니다."}

    start, end = pd.Timestamp(start_date).to_period("M"), pd.Timestamp(end_date).to_period("M")
    signup_month = users.set_index("user_id")["signup_date"].dt.to_period("M")
    cohort_month = signup_month[(signup_month >= start) & (signup_month <= end)]
    if cohort_month.empty:
        return {"기간": f"{start_date} ~ {end_date}", "안내": "해당 기간에 가입한 코호트가 없습니다."}

    order_month = orders["order_date"].dt.to_period("M")
    merged = orders.assign(cohort_month=orders["user_id"].map(cohort_month), order_month=order_month).dropna(subset=["cohort_month"])
    if merged.empty:
        return {"기간": f"{start_date} ~ {end_date}", "안내": "해당 기간 코호트의 구매 이력이 없습니다."}

    merged["cohort_month"] = merged["cohort_month"].astype("period[M]")
    merged["months_since"] = (
        (merged["order_month"].dt.year - merged["cohort_month"].dt.year) * 12
        + (merged["order_month"].dt.month - merged["cohort_month"].dt.month)
    )
    merged = merged[merged["months_since"] >= 0]
    cohort_sizes = cohort_month.value_counts()
    pivot = merged.groupby(["cohort_month", "months_since"])["user_id"].nunique().reset_index().pivot(
        index="cohort_month", columns="months_since", values="user_id"
    )
    retention = pivot.divide(cohort_sizes, axis=0) * 100

    rows = [
        {"가입월": str(cohort), "개월차별_재구매율": {f"{m}개월차": (None if pd.isna(v) else round(float(v), 1)) for m, v in row.items()}}
        for cohort, row in retention.iterrows()
    ]
    return {"기간": f"{start_date} ~ {end_date}", "코호트_리텐션": rows}


def tool_get_purchase_funnel(start_date: str, end_date: str) -> dict:
    _, period_events = _period_slices(start_date, end_date)
    steps = [("방문", "page_view"), ("상품조회", "product_view"), ("장바구니", "add_to_cart"), ("구매", "purchase")]
    funnel, prev_count = [], None
    for label, event_type in steps:
        count = int((period_events["event_type"] == event_type).sum()) if not period_events.empty else 0
        rate = round(count / prev_count * 100, 1) if prev_count else 100.0
        funnel.append({"단계": label, "이벤트_건수": count, "이전_단계_대비_전환율_퍼센트": rate})
        prev_count = count
    return {"기간": f"{start_date} ~ {end_date}", "구매_퍼널": funnel}


def tool_get_demographics(start_date: str, end_date: str) -> dict:
    _, period_events = _period_slices(start_date, end_date)
    users = data.load_users(_current_dataset_source.get())
    if period_events.empty or users.empty:
        return {"기간": f"{start_date} ~ {end_date}", "성별_분포": [], "연령대_분포": []}

    active_ids = period_events["user_id"].unique()
    active_users = users[users["user_id"].isin(active_ids)].copy()
    if active_users.empty:
        return {"기간": f"{start_date} ~ {end_date}", "성별_분포": [], "연령대_분포": []}

    gender_label = {"M": "남성", "F": "여성"}
    gender_counts = active_users["gender"].value_counts()
    gender_result = [{"성별": gender_label.get(k, k), "고객수": int(v)} for k, v in gender_counts.items()]

    def age_bucket(age):
        decade = int(age) // 10 * 10
        return "60대 이상" if decade >= 60 else f"{decade}대"

    active_users["연령대"] = active_users["age"].apply(age_bucket)
    age_counts = active_users["연령대"].value_counts()
    order = ["10대", "20대", "30대", "40대", "50대", "60대 이상"]
    age_result = [{"연령대": k, "고객수": int(age_counts.get(k, 0))} for k in order if k in age_counts.index]
    age_result.sort(key=lambda r: r["고객수"], reverse=True)

    return {
        "기간": f"{start_date} ~ {end_date}",
        "성별_분포": _annotate_rank_deviation(gender_result, "고객수"),
        "연령대_분포": _annotate_rank_deviation(age_result, "고객수"),
    }


def tool_get_kpi_comparison(current_start: str, current_end: str, compare_start: str, compare_end: str) -> dict:
    current = tool_get_kpi_summary(current_start, current_end)
    compare = tool_get_kpi_summary(compare_start, compare_end)

    def _delta(cur_val, prev_val):
        return None if not prev_val else round((cur_val - prev_val) / prev_val * 100, 1)

    keys = ["GMV", "AOV", "주문_건수", "활성_고객_수", "구매_전환율_퍼센트", "재구매율_퍼센트"]
    delta = {k: _delta(current.get(k, 0), compare.get(k, 0)) for k in keys}
    return {"현재_기간": current, "비교_기간": compare, "증감률_퍼센트(현재_기준_%p_아닌_증감률)": delta}


def tool_get_gmv_trend(start_date: str, end_date: str) -> dict:
    period_orders, _ = _period_slices(start_date, end_date)
    if period_orders.empty:
        return {"기간": f"{start_date} ~ {end_date}", "월별_추이": []}

    # "이례적으로 튀었다"를 판단하려면 평소 변동폭이 필요한데, 조회 기간이 짧으면
    # 그 안에서만 계산한 변동폭은 표본이 너무 적어 기준이 안 된다. 그래서 항상 전체
    # 데이터 기간의 월별 증감률로 "평소 변동폭"(표준편차)을 구해두고, 그 기준으로
    # 조회 기간 안의 달들이 이례적인지만 표시한다.
    orders_all, _ = data.load(_current_dataset_source.get())
    monthly_all = orders_all.copy()
    monthly_all["월"] = monthly_all["order_date"].dt.to_period("M").astype(str)
    pct_all = monthly_all.groupby("월")["total_amount"].sum().sort_index().pct_change().dropna() * 100
    std_change = float(pct_all.std()) if len(pct_all) >= 2 else None

    monthly = period_orders.copy()
    monthly["월"] = monthly["order_date"].dt.to_period("M").astype(str)
    grouped = monthly.groupby("월").agg(GMV=("total_amount", "sum"), 주문_수=("order_id", "count")).reset_index()
    rows, prev_gmv = [], None
    for _, row in grouped.iterrows():
        gmv = int(row["GMV"])
        delta = round((gmv - prev_gmv) / prev_gmv * 100, 1) if prev_gmv else None
        is_anomaly = bool(std_change and delta is not None and abs(delta) >= 1.5 * std_change)
        rows.append({
            "월": row["월"], "GMV": gmv, "주문_수": int(row["주문_수"]),
            "전월_대비_증감률_퍼센트": delta,
            "평소_변동폭보다_이례적으로_크게_변함": is_anomaly,
        })
        prev_gmv = gmv
    return {
        "기간": f"{start_date} ~ {end_date}",
        "평소_월간_변동폭_퍼센트(표준편차)": round(std_change, 1) if std_change else None,
        "월별_추이": rows,
    }


def tool_get_rfm_summary(start_date: str, end_date: str) -> dict:
    period_orders, _ = _period_slices(start_date, end_date)
    if period_orders.empty:
        return {"기간": f"{start_date} ~ {end_date}", "세그먼트별_RFM": []}
    rfm = assign_segment(calculate_rfm(period_orders.copy()))
    grouped = rfm.groupby("segment", observed=True).agg(
        고객수=("user_id", "count"), 평균_최근성_일=("Recency", "mean"),
        평균_구매빈도=("Frequency", "mean"), 평균_구매금액=("Monetary", "mean"),
    ).reset_index()
    items = [
        {"세그먼트": str(row["segment"]), "고객수": int(row["고객수"]),
         "평균_최근성_일": round(float(row["평균_최근성_일"]), 1),
         "평균_구매빈도": round(float(row["평균_구매빈도"]), 1),
         "평균_구매금액": int(row["평균_구매금액"])}
        for _, row in grouped.iterrows()
    ]
    items.sort(key=lambda r: r["평균_구매금액"], reverse=True)
    return {"기간": f"{start_date} ~ {end_date}", "세그먼트별_RFM": _annotate_rank_deviation(items, "평균_구매금액")}


def _recommend_segment(start_date, end_date, users: pd.DataFrame, orders: pd.DataFrame, events: pd.DataFrame) -> dict:
    """고정된 매직넘버 기준(예: '이탈률 45% 넘으면 위험') 대신, 이 회사의 직전
    동일 길이 기간 대비 얼마나 악화됐는지로 점수를 매겨서 가장 시급한 세그먼트를
    고른다. 회사마다 '평소' 수준이 다르므로, 절대 기준보다 자기 자신의 히스토리와
    비교하는 게 더 정확하다는 판단."""
    period_orders, period_events = _period_slices(start_date, end_date)

    start_ts, end_ts = pd.Timestamp(start_date), pd.Timestamp(end_date)
    span = end_ts - start_ts
    prev_end = start_ts - pd.Timedelta(days=1)
    prev_start = prev_end - span
    prev_orders = orders[(orders["order_date"] >= prev_start) & (orders["order_date"] <= prev_end)] if not orders.empty else orders
    prev_events = events[(events["timestamp"] >= prev_start) & (events["timestamp"] <= prev_end)] if not events.empty else events

    # "전체 기간"을 그대로 조회하면(기본값) 데이터셋보다 더 이전의 진짜 "직전 기간"이
    # 존재하지 않아 prev가 통째로 비어버린다 - 그러면 모든 후보의 악화율이 0으로
    # 뭉개져서 판단이 사실상 무의미해진다. 그럴 땐 조회 기간 자체를 반으로 갈라
    # 앞/뒤로 비교한다(main.py의 get_kpi가 "전체 기간" 기본값일 때 쓰는 것과 동일한 방식).
    if prev_orders.empty and prev_events.empty:
        mid = start_ts + span / 2
        prev_orders = orders[(orders["order_date"] >= start_ts) & (orders["order_date"] < mid)] if not orders.empty else orders
        prev_events = events[(events["timestamp"] >= start_ts) & (events["timestamp"] < mid)] if not events.empty else events
        period_orders = orders[(orders["order_date"] >= mid) & (orders["order_date"] <= end_ts)] if not orders.empty else orders
        period_events = events[(events["timestamp"] >= mid) & (events["timestamp"] <= end_ts)] if not events.empty else events

    def _rates(o: pd.DataFrame, e: pd.DataFrame) -> dict:
        new_users = users[(end_ts - users["signup_date"]).dt.days.between(0, 30)]
        new_ids = set(new_users["user_id"])
        new_purchasers = o[o["user_id"].isin(new_ids)]["user_id"].nunique() if not o.empty else 0
        new_rate = (new_purchasers / len(new_users)) if len(new_users) > 0 else None

        cart_users = e[e["event_type"] == "add_to_cart"]["user_id"].nunique() if not e.empty else 0
        purchase_users = e[e["event_type"] == "purchase"]["user_id"].nunique() if not e.empty else 0
        cart_abandon = (1 - purchase_users / cart_users) if cart_users > 0 else None

        coupon = o["coupon_used"].mean() if ("coupon_used" in o.columns and len(o)) else None
        repeat = _compute_repeat_purchase_rate(o) / 100 if len(o) else None
        return {"신규_구매전환율": new_rate, "장바구니_이탈률": cart_abandon, "쿠폰_사용률": coupon, "재구매율": repeat}

    cur, prev = _rates(period_orders, period_events), _rates(prev_orders, prev_events)

    def worsening(key: str, higher_is_bad: bool) -> float:
        c, p = cur[key], prev[key]
        if c is None or p is None or p == 0:
            return 0.0
        change = (c - p) / p
        return change if higher_is_bad else -change

    candidates = [
        ("신규 탐색자", worsening("신규_구매전환율", higher_is_bad=False)),
        ("이탈 위험 고객", worsening("장바구니_이탈률", higher_is_bad=True)),
        ("할인 헌터", worsening("쿠폰_사용률", higher_is_bad=True)),
        ("브랜드 충성 고객", worsening("재구매율", higher_is_bad=False)),
    ]

    # 휴면/이탈위험 고객 수는 페르소나 분류상 기간과 무관하게 고정이라 "직전 기간 대비
    # 악화"로는 비교가 안 된다 - 대신 "페르소나 평균 그룹 크기 대비 얼마나 큰 그룹인지"로 비교한다.
    persona_counts = users["persona_type"].value_counts() if "persona_type" in users.columns else pd.Series(dtype=int)
    persona_avg = persona_counts.mean() if len(persona_counts) else 0
    dormant_vs_avg = (persona_counts.get("dormant", 0) / persona_avg - 1) if persona_avg else 0.0
    at_risk_vs_avg = (persona_counts.get("churn_risk", 0) / persona_avg - 1) if persona_avg else 0.0
    candidates += [("휴면 고객", dormant_vs_avg), ("이탈 위험 고객", at_risk_vs_avg)]

    best_segment, best_score = max(candidates, key=lambda pair: pair[1])
    return {
        "segment": best_segment,
        "판단_근거": {
            "직전_동일기간_대비_변화율_퍼센트(배수_아님)": {
                k: (round(worsening(k, True) * 100, 1) if k != "재구매율" else round(-worsening(k, False) * 100, 1))
                for k in ["신규_구매전환율", "장바구니_이탈률", "쿠폰_사용률", "재구매율"]
            },
            "휴면_고객_수_평균_페르소나_그룹_대비_배율": round(dormant_vs_avg + 1, 2),
            "이탈위험_고객_수_평균_페르소나_그룹_대비_배율": round(at_risk_vs_avg + 1, 2),
        },
    }


def tool_get_top_priority_issue(start_date: str, end_date: str) -> dict:
    users = data.load_users(_current_dataset_source.get())
    orders, events = data.load(_current_dataset_source.get())
    recommendation = _recommend_segment(start_date, end_date, users, orders, events)
    return {
        "기간": f"{start_date} ~ {end_date}",
        "가장_시급한_세그먼트": recommendation["segment"],
        "판단_근거(직전_동일기간_대비_또는_평균_페르소나_대비)": recommendation["판단_근거"],
        "참고_핵심지표": tool_get_kpi_summary(start_date, end_date),
        "참고_페르소나_분포": tool_get_persona_counts()["페르소나별_고객_수"],
    }


def tool_propose_campaign(segment: str, channel: str, message: str) -> dict:
    """캠페인 제안 카드를 만든다. 대상 인원수는 모델이 지어내지 않고 항상
    get_persona_counts와 같은 실제 데이터에서 가져온다 - message(캠페인 문구)만 모델이
    직접 작성한 창작 콘텐츠이고, 숫자(대상 인원)는 이 함수가 코드로 채운다."""
    counts = tool_get_persona_counts()["페르소나별_고객_수"]
    audience = next((c["고객수"] for c in counts if c["페르소나"] == segment), None)
    return {
        "세그먼트": segment,
        "대상_인원": audience,
        "채널": channel if channel in CAMPAIGN_CHANNELS else CAMPAIGN_CHANNELS[0],
        "메시지": message,
        "안내": (
            "이 인원수는 실제 페르소나 분류 기준이며, 실행 전 화면에서 문구를 수정할 수 있습니다."
            if audience is not None
            else "일치하는 페르소나를 찾지 못해 대상 인원을 확인할 수 없습니다 - 정확한 페르소나 이름으로 다시 요청해주세요."
        ),
    }


def _execute_campaign_proposal(segment: str, channel_label: str, message: str, audience: int | None) -> str:
    """캠페인 제안 '실행' - 실제 발송이 아니라 campaign_builder.py의 캠페인
    저장소(=자동화 탭 '캠페인 관리' 목록이 읽는 곳, Supabase campaign_test_log 테이블)에
    기록을 남기는 것까지만 의미한다. campaign_builder.py의 CampaignWizard가 쓰는 것과
    같은 저장소를 그대로 재사용해서, 챗봇에서 실행한 캠페인도 캠페인 관리 목록에
    똑같이 나타나게 한다."""
    channel_key = _CHANNEL_LABEL_TO_KEY.get(channel_label, "kakao")
    channel_meta_label = campaign_builder.CHANNEL_META.get(channel_key, {}).get("label", channel_label)
    count = audience or 0
    campaign = {
        "campaign_id": uuid.uuid4().hex[:8],
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "segment": segment,
        "channel": channel_key,
        "target_count": count,
        "message_summary": f"제목: (AI 챗봇 제안)\n\n본문: {message}",
        "status": f"AI 챗봇 제안 ({channel_meta_label} - {count}명 대상)",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    campaign_builder._insert_campaign(campaign)
    return campaign["campaign_id"]


TOOL_FUNCTIONS = {
    "get_segment_deep_dive": tool_get_segment_deep_dive,
    "get_kpi_summary": tool_get_kpi_summary,
    "get_category_breakdown": tool_get_category_breakdown,
    "get_channel_breakdown": tool_get_channel_breakdown,
    "get_segment_breakdown": tool_get_segment_breakdown,
    "get_persona_counts": tool_get_persona_counts,
    "get_cohort_retention": tool_get_cohort_retention,
    "get_purchase_funnel": tool_get_purchase_funnel,
    "get_demographics": tool_get_demographics,
    "get_kpi_comparison": tool_get_kpi_comparison,
    "get_gmv_trend": tool_get_gmv_trend,
    "get_rfm_summary": tool_get_rfm_summary,
    "get_top_priority_issue": tool_get_top_priority_issue,
    "propose_campaign": tool_propose_campaign,
}

TOOL_LABELS = {
    "get_segment_deep_dive": {"label": "고객군 교차 분석", "chart_key": None},
    "get_kpi_summary": {"label": "핵심 지표(GMV·AOV·전환율 등) 조회", "chart_key": "gmv"},
    "get_kpi_comparison": {"label": "기간별 지표 비교", "chart_key": "gmv"},
    "get_category_breakdown": {"label": "카테고리별 매출 조회", "chart_key": "category"},
    "get_channel_breakdown": {"label": "유입 채널별 매출 조회", "chart_key": "channel"},
    "get_segment_breakdown": {"label": "RFM 세그먼트별 매출 조회", "chart_key": "segment"},
    "get_persona_counts": {"label": "페르소나별 고객 수 조회", "chart_key": "persona"},
    "get_cohort_retention": {"label": "코호트 리텐션 조회", "chart_key": "cohort"},
    "get_purchase_funnel": {"label": "구매 퍼널 조회", "chart_key": "funnel"},
    "get_demographics": {"label": "성별·연령대 분포 조회", "chart_key": "demographics"},
    "get_top_priority_issue": {"label": "시급한 세그먼트 진단", "chart_key": None},
    "get_gmv_trend": {"label": "GMV·주문 수 추이 조회", "chart_key": "gmv_trend"},
    "get_rfm_summary": {"label": "RFM 세그먼트별 요약 조회", "chart_key": "rfm"},
    "propose_campaign": {"label": "캠페인 제안 생성", "chart_key": "persona"},
}

# 답변에 쓰인 차트(chart_key)에 따라 자연스럽게 이어질 만한 후속 질문 후보. 방금
# 물어본 것과 겹치는 칩은 /api/chat 핸들러에서 걸러낸다.
QUICK_REPLIES = {
    "gmv": ["카테고리별로는 어때?", "채널별로는 어때?"],
    "gmv_trend": ["어느 달이 제일 좋았어?", "이번 달 추세는 어때?"],
    "category": ["채널별 매출은 어때?", "세그먼트별로는 어때?"],
    "channel": ["카테고리별 매출은 어때?", "가장 효율 좋은 채널은 어디야?"],
    "segment": ["페르소나별 고객 수는 어때?", "휴면 고객 비중은 얼마나 돼?"],
    "persona": ["이탈 위험 고객엔 어떤 액션이 좋을까?", "휴면 고객은 몇 명이야?"],
    "cohort": ["재구매율은 얼마나 돼?", "전환율을 어떻게 올리면 좋을까?"],
    "funnel": ["장바구니 이탈률은 얼마야?", "전환율을 어떻게 올리면 좋을까?"],
    "rfm": ["세그먼트별 매출은 어때?", "충성 고객은 몇 명이야?"],
    "demographics": ["연령대별로 매출 차이가 있어?", "주 구매 채널은 어디야?"],
}

CHATBOT_TOOLS = [
    {
        "name": "get_segment_deep_dive",
        "description": "특정 축(성별/연령대/페르소나/세그먼트)의 항목 하나(예: 성별=여성, 페르소나=할인 헌터)를 골라서, 그 고객군이 카테고리별/채널별로 어디에 몰려있는지, 연령대 분포는 어떤지, 나머지 고객 대비 AOV가 얼마나 다른지를 반환합니다. 특정 항목 하나를 콕 집어 더 깊게 물어보는 질문(예: '여성 고객은 뭘 많이 사?', '할인 헌터는 어떤 채널로 들어와?')이나, 차트 항목을 클릭해서 온 질문([차트이름 중 항목] 형태로 시작하는 메시지)에 사용하세요. 이미 화면에 보이는 값(그 항목의 비중 %)을 반복하는 용도가 아니라, 화면에 없는 교차 정보를 줄 때만 쓰는 도구입니다.",
        "input_schema": {"type": "object", "properties": {
            "dimension": {"type": "string", "description": "고객을 나누는 기준 축. 다음 중 하나: 성별, 연령대, 페르소나, 세그먼트"},
            "value": {"type": "string", "description": "그 축에서 조회할 구체적 값. 성별=남성/여성, 연령대=10대~60대 이상, 페르소나=신규 탐색자/충동 구매자/할인 헌터/브랜드 충성 고객/이탈 위험 고객/휴면 고객, 세그먼트=VIP/충성 고객/이탈 위험/휴면"},
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["dimension", "value", "start_date", "end_date"]},
    },
    {
        "name": "get_kpi_summary",
        "description": "특정 기간의 GMV, AOV, 주문 건수, 활성 고객 수, 구매 전환율, 장바구니 이탈률, 재구매율을 정확히 계산해서 반환합니다. 매출/전환율/주문/DAU/WAU/MAU 관련 질문에 사용하세요 (예: '오늘 활성 고객'은 기간을 하루로, '이번 주'는 7일로 주면 됩니다).",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_category_breakdown",
        "description": "특정 기간의 카테고리별 매출 순위를 반환합니다.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_channel_breakdown",
        "description": "특정 기간의 유입 채널(SNS/검색광고/직접유입/이메일/추천)별 매출 순위를 반환합니다.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_segment_breakdown",
        "description": "특정 기간의 RFM 세그먼트(VIP/충성 고객/이탈 위험/휴면)별 매출을 반환합니다. 최근 구매 행동 기준의 상대적 등급입니다.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_persona_counts",
        "description": "전체 고객을 페르소나(신규 탐색자/충동 구매자/할인 헌터/브랜드 충성 고객/이탈 위험 고객/휴면 고객)로 분류한 고객 수를 반환합니다. 기간과 무관하게 고정된 값입니다.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_cohort_retention",
        "description": "가입월 코호트별로 이후 몇 개월차에 재구매했는지 리텐션(%)을 반환합니다. '재구매 유지율', '코호트' 관련 질문에 사용하세요.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_purchase_funnel",
        "description": "특정 기간의 구매 퍼널(방문 → 상품조회 → 장바구니 → 구매) 단계별 이벤트 수와 단계 간 전환율을 반환합니다. '퍼널', '어디서 이탈이 많이 생겨' 같은 질문에 사용하세요.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_demographics",
        "description": "특정 기간에 활동한 고객의 성별·연령대 분포를 반환합니다. '고객 성별 비율', '연령대 분포' 같은 질문에 사용하세요.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_kpi_comparison",
        "description": "두 기간의 핵심 지표(GMV/AOV/주문건수/전환율/재구매율)를 비교하고 증감률까지 계산해서 반환합니다. '저번주보다', '지난달 대비' 같은 비교 질문에는 get_kpi_summary를 두 번 부르지 말고 반드시 이 도구를 쓰세요.",
        "input_schema": {"type": "object", "properties": {
            "current_start": {"type": "string", "description": "비교 기준(현재) 기간 시작일 (YYYY-MM-DD)"},
            "current_end": {"type": "string", "description": "비교 기준(현재) 기간 종료일 (YYYY-MM-DD)"},
            "compare_start": {"type": "string", "description": "비교 대상(과거) 기간 시작일 (YYYY-MM-DD)"},
            "compare_end": {"type": "string", "description": "비교 대상(과거) 기간 종료일 (YYYY-MM-DD)"},
        }, "required": ["current_start", "current_end", "compare_start", "compare_end"]},
    },
    {
        "name": "get_gmv_trend",
        "description": "특정 기간을 월별로 나눠 GMV와 주문 수 추이를 반환합니다. 각 달에 '평소_변동폭보다_이례적으로_크게_변함' 플래그가 같이 오는데, 이건 전체 데이터 기간의 월간 증감률 표준편차를 기준으로 계산한 겁니다 - true인 달이 있으면 그냥 숫자만 읽지 말고 '평소보다 이례적으로 변했다'는 점을 반드시 짚어주세요. 'GMV 추이', '주문 수 추이', '이번 달 특이한 점' 같은 질문에 사용하세요.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_rfm_summary",
        "description": "특정 기간의 RFM(최근성/구매빈도/구매금액) 세그먼트별 평균값과 고객 수를 반환합니다. 'RFM 분포', '충성 고객은 얼마나 자주 사' 같은 질문에 사용하세요.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "get_top_priority_issue",
        "description": "지금 가장 시급하게 대응해야 할 고객 세그먼트를 추천합니다. 고정된 절대 기준이 아니라 이 회사의 직전 동일 길이 기간 대비 악화율(또는 페르소나 평균 그룹 크기 대비 배율)로 판단하므로, 답변에는 반드시 '판단_근거'에 있는 구체적 변화율/배율을 인용하세요. 변화율 필드는 이름 그대로 '퍼센트'이지 '배수'가 아닙니다 - 예를 들어 값이 2.3이면 '2.3배 급등'이 아니라 '2.3% 증가'입니다. 배율이라고 적힌 필드(휴면/이탈위험 고객 수 관련)만 실제 배수입니다. '가장 시급한 문제', '지금 뭐가 문제야' 같은 질문에 사용하세요.",
        "input_schema": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "조회 시작일 (YYYY-MM-DD)"},
            "end_date": {"type": "string", "description": "조회 종료일 (YYYY-MM-DD)"},
        }, "required": ["start_date", "end_date"]},
    },
    {
        "name": "propose_campaign",
        "description": "캠페인 제안 카드를 만듭니다. '~한테 캠페인 만들어줘', '~세그먼트한테 메시지 보내줘' 같은 요청에 사용하세요. 화면에 제안 카드(수정 가능한 문구 + 실행 버튼)가 표시되고, 실제 기록은 사용자가 버튼을 눌러야(또는 완전 자동 모드면 곧바로) 남습니다.",
        "input_schema": {"type": "object", "properties": {
            "segment": {"type": "string", "description": "대상 페르소나. 반드시 다음 중 하나 그대로: 신규 탐색자, 충동 구매자, 할인 헌터, 브랜드 충성 고객, 이탈 위험 고객, 휴면 고객"},
            "channel": {"type": "string", "description": "발송 채널. 다음 중 하나: 카카오톡, SMS, 이메일, 웹푸시. 사용자가 명시하지 않으면 카카오톡을 기본값으로 쓰세요."},
            "message": {"type": "string", "description": "그 세그먼트 특성에 맞게 직접 작성한 짧고 매력적인 캠페인 메시지 문구 (이 도구는 문구를 대신 써주지 않습니다 - 모델이 직접 작성해서 넣어야 합니다)"},
        }, "required": ["segment", "channel", "message"]},
    },
]


def _describe_tool_call(name: str, tool_input: dict) -> str:
    info = TOOL_LABELS.get(name, {"label": name})
    label = info["label"]
    if "dimension" in tool_input and "value" in tool_input:
        label = f"{label} ({tool_input['dimension']}: {tool_input['value']})"
    if "current_start" in tool_input:
        period = f"{tool_input.get('current_start', '')}~{tool_input.get('current_end', '')} vs {tool_input.get('compare_start', '')}~{tool_input.get('compare_end', '')}"
    elif "start_date" in tool_input:
        period = f"{tool_input.get('start_date', '')} ~ {tool_input.get('end_date', '')}"
    else:
        period = ""
    return label + (f" ({period})" if period else "")


def _dataset_date_range() -> tuple[str, str]:
    orders, _ = data.load(_current_dataset_source.get())
    if orders.empty:
        return "2026-01-01", "2026-06-28"
    return orders["order_date"].min().strftime("%Y-%m-%d"), orders["order_date"].max().strftime("%Y-%m-%d")


def _build_system_prompt(company: str) -> str:
    min_date, max_date = _dataset_date_range()
    return f"""당신은 {company} CRM 대시보드에 내장된 데이터 조회 챗봇입니다.

우리가 가진 데이터는 {min_date} ~ {max_date} 기간의 시뮬레이션 데이터입니다.
사용자가 "이번 주", "지난달", "최근" 같은 상대적 표현을 쓰면, 오늘 날짜가 아니라 이
데이터의 마지막 날짜({max_date})를 기준으로 계산하세요.

질문은 아래 종류로 나뉩니다. 반드시 이 방식을 지키세요:

1. 사실 조회형 (매출, 전환율, 세그먼트, 리텐션 등 단순 수치 확인 질문)
   → 반드시 제공된 도구(tool)를 호출해서 실제 계산된 값을 받아온 뒤, 그 값만 근거로
   간결하게 답하세요. 도구를 쓰지 않고 스스로 숫자를 추정하거나 계산하지 마세요.
   "저번주보다", "지난달 대비" 처럼 두 기간을 비교하는 질문이면 get_kpi_summary를
   두 번 부르지 말고 반드시 get_kpi_comparison을 사용해서 증감률까지 받아오세요.
   순위/분포 목록을 반환하는 도구를 썼다면, 반환된 항목을 전체 다 읽어주지 마세요 -
   그 목록은 이미 화면 차트에 그대로 나와 있습니다. 대신 1위와 2위의 격차, 눈에 띄게
   쏠린 부분, 또는 그로부터 나오는 시사점 위주로 2~3문장 안에 답하세요.

   사용자 메시지가 "[차트이름 중 항목]"처럼 대괄호로 시작하면, 차트에서 특정 항목을
   클릭해서 넘어온 질문입니다. 그 항목이 성별/연령대/페르소나/세그먼트 같은 고객
   속성이면 get_segment_deep_dive를 호출하세요 - 그 항목의 비중(%)은 이미 화면에
   보이니 절대 반복하지 말고, 그 도구가 주는 화면에 없는 교차 정보(카테고리·채널
   쏠림, 나머지 고객 대비 AOV 차이 등) 위주로 답하세요. 이때도 소제목(###)이나
   구분선(---) 없이, 아래 "규칙"의 2~4문장·간결함 원칙을 그대로 지키세요 - 정보가
   여러 개라고 리포트처럼 늘어놓지 말고, 그 중 가장 눈에 띄는 1~2개만 골라 압축해서
   말하세요.

2. 진단/분석형 (예: "왜 그래?", "무슨 문제야?")
   → 반드시 아래 3단계 구조를 그대로 사용해서 답하세요 (각 단계를 굵게 표시된 소제목으로 구분):
   **결과:** 무엇이 어떻게 됐는지 핵심 수치로 1문장.
   **원인:** 도구가 반환한 값에 근거해서 1~2문장. 도구 결과로 확인되지 않는 원인은 추측이라는 걸 밝히세요.
   **추천 액션:** 다음에 뭘 하면 좋을지 1문장. 검증된 사실이 아니라 제안이라는 점을 드러내세요.

3. 전략/의견형 (예: "전환율을 어떻게 올려야 할까?")
   → 답변 맨 앞에 반드시 "💡 **AI 의견** (검증된 사실이 아닌 참고용 제안입니다)"라는
   문구를 그대로 넣고 시작하세요. 가능하면 관련 도구를 먼저 호출해서 실제 지표를 근거로 제시하세요.

4. 무관한 질문 (매장/CRM 데이터와 전혀 관계없는 질문)
   → 도구를 호출하지 말고, "죄송해요, 이 챗봇은 {company} 매장 데이터 관련 질문만 답할 수 있어요."라고 안내하세요.

5. 캠페인 제안형 (예: "이탈 위험 고객한테 캠페인 만들어줘", "휴면 고객 리텐션 메시지 짜줘")
   → propose_campaign 도구를 호출하세요. segment는 반드시 실제 페르소나 라벨(신규
   탐색자/충동 구매자/할인 헌터/브랜드 충성 고객/이탈 위험 고객/휴면 고객) 중 하나
   그대로 쓰고, message는 그 세그먼트 특성에 맞는 문구를 직접 작성하세요(문구 자체는
   도구가 대신 써주지 않습니다). 도구가 반환한 대상 인원 수는 실제 데이터 기준이니 그대로
   인용하고 스스로 다른 숫자를 지어내지 마세요. 도구 호출 후 답변 본문은 "아래 제안을
   확인하고 필요하면 문구를 수정한 다음 실행해 주세요." 처럼 짧게만 덧붙이세요 - 화면에
   수정 가능한 카드와 실행 버튼이 자동으로 함께 표시되니 메시지 내용을 본문에 다시
   옮겨 적지 마세요.

규칙:
- 답변은 한국어 존댓말(합니다체)로, 2~4문장 정도로 간결하게 작성하세요.
- 소제목(### 등)이나 구분선(---)을 쓰지 말고, 자연스럽게 이어지는 문단으로만 답하세요 - 정보가 여러 갈래라도 보고서처럼 나열하지 말고 가장 중요한 것 위주로 압축하세요.
- 핵심 수치는 **마크다운 볼드체**로 강조하세요.
- 도구 호출 결과에 없는 정보는 추측하지 마세요.
- 숫자를 말할 때는 반드시 비교 기준과 함께 말하세요. 도구가 반환한 값에 이미
  "평균_대비_배율", "1위와의_격차_퍼센트" 같은 비교 값이 들어있으면 그대로 인용하세요.
- 뻔하고 두루뭉술한 문구("다양한 전략을 고려하세요", "지속적인 모니터링이 필요합니다")는
  절대 쓰지 말고, 구체적인 숫자·세그먼트·기간을 넣어서 말하세요.
- 사용자가 물어본 지표만 답하세요. 도구는 여러 지표를 한 번에 반환하지만, 요청하지
  않은 지표는 먼저 나서서 언급하지 마세요.
- 새 질문에 기간이 명시돼 있지 않으면 전체 기간({min_date} ~ {max_date})을 기본값으로 쓰세요.

톤 예시 (분량을 늘리라는 뜻이 아니라 - 같은 길이에서 어떻게 다르게 말할지 참고용):
- 나쁜 예: "여성이 61%로 남성보다 많습니다. 여성 고객을 고려한 마케팅이 필요합니다." (화면에 이미 보이는 숫자를 반복하고, "고려하세요"는 아무 행동도 지시하지 않는 필러입니다.)
- 좋은 예: "여성은 '보기'는 많이 보는데, 정작 구매 전환은 30대 남성이 더 높아요 - 트래픽보다 전환 최적화가 더 급한 포인트일 수 있어요." (화면엔 없는 교차 정보 + 구체적 시사점.)
"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    execution_mode: str = "suggest"  # "suggest" | "auto" - propose_campaign 실행 방식


class ToolCallOut(BaseModel):
    name: str
    label: str
    description: str


class SourceOut(BaseModel):
    label: str
    chart_key: str | None


class CampaignProposalOut(BaseModel):
    segment: str
    audience: int | None
    channel: str
    message: str
    note: str
    executed: bool = False
    campaign_id: str | None = None
    execute_error: str | None = None


class ChatResponse(BaseModel):
    text: str
    tool_calls: list[ToolCallOut]
    sources: list[SourceOut]
    thinking: list[str]
    quick_replies: list[str]
    campaign_proposal: CampaignProposalOut | None = None


class ExecuteCampaignRequest(BaseModel):
    segment: str
    channel: str
    message: str
    audience: int | None = None


def run_chatbot_turn(messages: list, company: str) -> tuple[str, list]:
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    working_messages = [{"role": m["role"], "content": m["content"]} for m in messages]
    tool_calls = []

    for _ in range(4):  # 도구를 여러 번 호출하는 경우를 대비한 안전장치(무한루프 방지)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1200,
            system=_build_system_prompt(company),
            tools=CHATBOT_TOOLS,
            messages=working_messages,
        )

        if response.stop_reason != "tool_use":
            text = "".join(block.text for block in response.content if block.type == "text").strip()
            return text, tool_calls

        working_messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            func = TOOL_FUNCTIONS.get(block.name)
            try:
                result = func(**block.input) if func else {"오류": f"알 수 없는 도구: {block.name}"}
            except Exception as e:
                result = {"오류": str(e)}
            tool_calls.append({"name": block.name, "input": block.input, "result": result})
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result, ensure_ascii=False),
            })
        working_messages.append({"role": "user", "content": tool_results})

    return "죄송해요, 답변을 만드는 데 문제가 생겼어요. 다시 시도해주세요.", tool_calls


@router.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest, session: dict = Depends(auth.get_session)):
    token = _current_dataset_source.set(session["dataset_source"])
    try:
        messages = [{"role": m.role, "content": m.content} for m in req.messages]
        text, tool_calls = run_chatbot_turn(messages, session["company_name"])
    finally:
        _current_dataset_source.reset(token)

    thinking = [_describe_tool_call(tc["name"], tc["input"]) for tc in tool_calls]

    sources, seen = [], set()
    for tc in tool_calls:
        chart_key = TOOL_LABELS.get(tc["name"], {}).get("chart_key")
        dedupe_key = (tc["name"], chart_key)
        if dedupe_key not in seen:
            seen.add(dedupe_key)
            sources.append(SourceOut(label=_describe_tool_call(tc["name"], tc["input"]), chart_key=chart_key))

    already_asked = {m.content for m in req.messages if m.role == "user"}
    seen_q, quick_replies = set(), []
    for s in sources:
        for q in QUICK_REPLIES.get(s.chart_key, []):
            if q not in seen_q and q not in already_asked:
                seen_q.add(q)
                quick_replies.append(q)
    quick_replies = quick_replies[:3]

    campaign_proposal = None
    for tc in tool_calls:
        if tc["name"] == "propose_campaign" and tc.get("result"):
            r = tc["result"]
            campaign_proposal = CampaignProposalOut(
                segment=r["세그먼트"], audience=r.get("대상_인원"), channel=r["채널"],
                message=r["메시지"], note=r["안내"],
            )

    if campaign_proposal and req.execution_mode == "auto":
        try:
            campaign_id = _execute_campaign_proposal(
                campaign_proposal.segment, campaign_proposal.channel,
                campaign_proposal.message, campaign_proposal.audience,
            )
            campaign_proposal.executed = True
            campaign_proposal.campaign_id = campaign_id
        except Exception as e:
            campaign_proposal.execute_error = str(e)

    return ChatResponse(
        text=text,
        tool_calls=[
            ToolCallOut(name=tc["name"], label=TOOL_LABELS.get(tc["name"], {}).get("label", tc["name"]),
                        description=_describe_tool_call(tc["name"], tc["input"]))
            for tc in tool_calls
        ],
        sources=sources, thinking=thinking, quick_replies=quick_replies,
        campaign_proposal=campaign_proposal,
    )


@router.post("/api/chat/execute-campaign", response_model=CampaignProposalOut)
def execute_campaign(req: ExecuteCampaignRequest, session: dict = Depends(auth.get_session)):
    """'제안만' 모드에서 사용자가 제안 카드의 '실행' 버튼을 눌렀을 때 호출된다."""
    try:
        campaign_id = _execute_campaign_proposal(req.segment, req.channel, req.message, req.audience)
        return CampaignProposalOut(
            segment=req.segment, audience=req.audience, channel=req.channel, message=req.message,
            note="", executed=True, campaign_id=campaign_id,
        )
    except Exception as e:
        return CampaignProposalOut(
            segment=req.segment, audience=req.audience, channel=req.channel, message=req.message,
            note="", executed=False, execute_error=str(e),
        )
