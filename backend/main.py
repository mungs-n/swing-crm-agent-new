"""
ATHLEPA CRM 백엔드 (Streamlit 대신 React 프론트엔드에 데이터를 내려주는 API).
같은 Supabase 프로젝트를 그대로 재사용한다 - 데이터/스키마는 기존 Streamlit 앱과 동일.
"""

from datetime import timedelta

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from utils.rfm import calculate_rfm, assign_segment
import data
from data import CHANNEL_KR, PERSONA_KR, AGE_LABELS, pct_delta
import auth
import chatbot
import performance
import ab_test
import campaign_builder
import ingest
import raw_data

load_dotenv()

app = FastAPI(title="ATHLEPA CRM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chatbot.router)
app.include_router(performance.router)
app.include_router(ab_test.router)
app.include_router(campaign_builder.router)
app.include_router(ingest.router)
app.include_router(raw_data.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/kpi")
def get_kpi(start_date: str | None = None, end_date: str | None = None, session: dict = Depends(auth.get_session)):
    dataset_source = session["dataset_source"]
    orders, events = data.load(dataset_source)
    if orders.empty:
        return {"gmv": 0, "gmv_delta": 0, "aov": 0, "aov_delta": 0, "conversion": 0, "conversion_delta": 0,
                "dau": 0, "dau_delta": 0, "wau": 0, "wau_delta": 0, "mau": 0, "mau_delta": 0, "data_range": None}

    if start_date and end_date:
        # 상단 날짜 필터로 기간을 직접 골랐을 때: 그 기간을 '현재'로, 바로 직전
        # 같은 길이의 기간을 '이전'으로 비교한다 (원본 Streamlit 버전의 render_date_filter와 동일한 방식).
        start_ts = pd.Timestamp(start_date)
        end_ts = pd.Timestamp(end_date) + timedelta(days=1) - timedelta(seconds=1)
        span_days = (end_ts.normalize() - start_ts.normalize()).days + 1
        prev_end = start_ts - timedelta(seconds=1)
        prev_start = prev_end - timedelta(days=span_days - 1)
        max_date = end_ts

        cur_orders = orders[(orders["order_date"] >= start_ts) & (orders["order_date"] <= end_ts)]
        prev_orders = orders[(orders["order_date"] >= prev_start) & (orders["order_date"] <= prev_end)]
        cur_events = events[(events["timestamp"] >= start_ts) & (events["timestamp"] <= end_ts)] if not events.empty else events
        prev_events = events[(events["timestamp"] >= prev_start) & (events["timestamp"] <= prev_end)] if not events.empty else events
    else:
        max_date = orders["order_date"].max()
        span_days = (orders["order_date"].max() - orders["order_date"].min()).days + 1
        half = span_days // 2
        mid = max_date - timedelta(days=half)

        cur_orders = orders[orders["order_date"] > mid]
        prev_orders = orders[orders["order_date"] <= mid]
        cur_events = events[events["timestamp"] > mid] if not events.empty else events
        prev_events = events[events["timestamp"] <= mid] if not events.empty else events

    gmv_this, gmv_last = cur_orders["total_amount"].sum(), prev_orders["total_amount"].sum()
    aov_this = cur_orders["total_amount"].mean() if len(cur_orders) else 0
    aov_last = prev_orders["total_amount"].mean() if len(prev_orders) else 0

    if not events.empty:
        sessions_this = cur_events["session_id"].nunique()
        sessions_last = prev_events["session_id"].nunique()
        buy_this = cur_events.loc[cur_events["event_type"] == "purchase", "session_id"].nunique()
        buy_last = prev_events.loc[prev_events["event_type"] == "purchase", "session_id"].nunique()
        conv_this = (buy_this / sessions_this * 100) if sessions_this else 0
        conv_last = (buy_last / sessions_last * 100) if sessions_last else 0
    else:
        conv_this = conv_last = 0

    def active(days_back, offset=0):
        if events.empty:
            return 0
        end = (max_date - timedelta(days=offset)).normalize()
        start = end - timedelta(days=days_back - 1)
        window = events[(events["timestamp"] >= start) & (events["timestamp"] <= end + timedelta(days=1))]
        return window["user_id"].nunique()

    dau, dau_prev = active(1), active(1, offset=1)
    wau, wau_prev = active(7), active(7, offset=7)
    mau, mau_prev = active(30), active(30, offset=30)

    return {
        "gmv": float(gmv_this), "gmv_delta": pct_delta(gmv_this, gmv_last),
        "aov": float(aov_this), "aov_delta": pct_delta(aov_this, aov_last),
        "conversion": float(conv_this), "conversion_delta": conv_this - conv_last,
        "dau": int(dau), "dau_delta": pct_delta(dau, dau_prev),
        "wau": int(wau), "wau_delta": pct_delta(wau, wau_prev),
        "mau": int(mau), "mau_delta": pct_delta(mau, mau_prev),
        "data_range": {"min": orders["order_date"].min().date().isoformat(), "max": orders["order_date"].max().date().isoformat()},
    }


def _filter_by_date(df, col, start_date, end_date):
    if df.empty or not start_date or not end_date:
        return df
    start_ts = pd.Timestamp(start_date)
    end_ts = pd.Timestamp(end_date) + timedelta(days=1) - timedelta(seconds=1)
    return df[(df[col] >= start_ts) & (df[col] <= end_ts)]


@app.get("/api/gmv-trend")
def get_gmv_trend(start_date: str | None = None, end_date: str | None = None, session: dict = Depends(auth.get_session)):
    dataset_source = session["dataset_source"]
    orders, _ = data.load(dataset_source)
    orders = _filter_by_date(orders, "order_date", start_date, end_date)
    if orders.empty:
        return []
    monthly = orders.set_index("order_date").resample("MS")["total_amount"].sum()
    return [{"month": d.strftime("%Y-%m"), "gmv": float(v)} for d, v in monthly.items()]


@app.get("/api/revenue-breakdown")
def get_revenue_breakdown(start_date: str | None = None, end_date: str | None = None, session: dict = Depends(auth.get_session)):
    dataset_source = session["dataset_source"]
    orders, _ = data.load(dataset_source)
    orders = _filter_by_date(orders, "order_date", start_date, end_date)
    users = data.load_users(dataset_source)
    if orders.empty:
        return {"segment": [], "channel": [], "category": []}

    rfm = assign_segment(calculate_rfm(orders.copy()))
    segment = (
        rfm.groupby("segment", observed=True)["Monetary"].sum()
        .reindex(["VIP", "충성 고객", "이탈 위험", "휴면"]).fillna(0)
    )

    category = orders.groupby("category")["total_amount"].sum().sort_values(ascending=False)

    channel = pd.Series(dtype=float)
    if not users.empty and "acquisition_channel" in users.columns:
        merged = orders.merge(users[["user_id", "acquisition_channel"]], on="user_id")
        channel = merged.groupby("acquisition_channel")["total_amount"].sum()
        channel.index = channel.index.map(lambda k: CHANNEL_KR.get(k, k))

    return {
        "segment": [{"name": k, "value": float(v)} for k, v in segment.items()],
        "channel": [{"name": k, "value": float(v)} for k, v in channel.sort_values(ascending=False).items()],
        "category": [{"name": k, "value": float(v)} for k, v in category.items()],
    }


@app.get("/api/rfm-scatter")
def get_rfm_scatter(start_date: str | None = None, end_date: str | None = None, session: dict = Depends(auth.get_session)):
    dataset_source = session["dataset_source"]
    orders, _ = data.load(dataset_source)
    orders = _filter_by_date(orders, "order_date", start_date, end_date)
    if orders.empty:
        return []
    rfm = assign_segment(calculate_rfm(orders.copy()))
    return [
        {
            "user_id": str(row.user_id), "frequency": int(row.Frequency),
            "monetary": float(row.Monetary), "recency": int(row.Recency), "segment": str(row.segment),
        }
        for row in rfm.itertuples()
    ]


@app.get("/api/funnel")
def get_funnel(start_date: str | None = None, end_date: str | None = None, session: dict = Depends(auth.get_session)):
    dataset_source = session["dataset_source"]
    _, events = data.load(dataset_source)
    events = _filter_by_date(events, "timestamp", start_date, end_date)
    stages = [("page_view", "방문"), ("product_view", "상품조회"), ("add_to_cart", "장바구니"), ("purchase", "구매")]
    if events.empty:
        return [{"label": label, "value": 0} for _, label in stages]
    return [
        {"label": label, "value": int(events.loc[events["event_type"] == key, "session_id"].nunique())}
        for key, label in stages
    ]


@app.get("/api/repeat-funnel")
def get_repeat_funnel(session: dict = Depends(auth.get_session)):
    dataset_source = session["dataset_source"]
    """회원가입 -> 첫 구매 -> 재구매 퍼널 (전체 기간 기준, 기간 필터 없음)."""
    orders, _ = data.load(dataset_source)
    users = data.load_users(dataset_source)
    if users.empty:
        return [{"label": "회원가입", "value": 0}, {"label": "첫 구매", "value": 0}, {"label": "재구매", "value": 0}]

    all_ids = set(users["user_id"])
    order_counts = orders.groupby("user_id")["order_id"].count() if not orders.empty else pd.Series(dtype=int)
    first_purchase_ids = set(order_counts.index)
    repeat_ids = set(order_counts[order_counts >= 2].index)

    return [
        {"label": "회원가입", "value": len(all_ids)},
        {"label": "첫 구매", "value": len(first_purchase_ids)},
        {"label": "재구매", "value": len(repeat_ids)},
    ]


@app.get("/api/cohort")
def get_cohort(start_date: str | None = None, end_date: str | None = None, session: dict = Depends(auth.get_session)):
    dataset_source = session["dataset_source"]
    """가입월별 재구매 유지율 히트맵 데이터."""
    orders, _ = data.load(dataset_source)
    users = data.load_users(dataset_source)
    if users.empty or orders.empty or "signup_date" not in users.columns:
        return {"months": [], "cohorts": []}

    if start_date and end_date:
        range_start, range_end = pd.Timestamp(start_date), pd.Timestamp(end_date)
    else:
        range_start, range_end = orders["order_date"].min(), orders["order_date"].max()

    signup_month = users.set_index("user_id")["signup_date"].dt.to_period("M")
    order_month = orders["order_date"].dt.to_period("M")
    merged = orders.assign(
        cohort_month=orders["user_id"].map(signup_month), order_month=order_month
    ).dropna(subset=["cohort_month"])
    if merged.empty:
        return {"months": [], "cohorts": []}

    merged["cohort_month"] = merged["cohort_month"].astype("period[M]")
    # 코호트(어느 가입월을 보여줄지)는 실제 주문 데이터가 있는 기간(또는 날짜
    # 필터로 고른 기간)에 가입한 고객으로만 한정한다 (원본 Streamlit 버전과 동일한
    # 방식). 이 필터가 없으면 주문 데이터가 시작되기 한참 전에 가입한 고객까지
    # 코호트 행으로 나오는데, 그 고객의 재구매는 전부 표에서 안 보이는 먼
    # 개월차(가입~2026년 사이 간격만큼) 칸에 숨어버려서 텅 빈 행만 늘어난다.
    merged = merged[
        (merged["cohort_month"] >= range_start.to_period("M")) & (merged["cohort_month"] <= range_end.to_period("M"))
    ]
    if merged.empty:
        return {"months": [], "cohorts": []}

    merged["month_index"] = (
        (merged["order_month"].dt.year - merged["cohort_month"].dt.year) * 12
        + (merged["order_month"].dt.month - merged["cohort_month"].dt.month)
    )
    merged = merged[merged["month_index"] >= 0]

    cohort_sizes = signup_month.value_counts()
    pivot = (
        merged.groupby(["cohort_month", "month_index"])["user_id"].nunique()
        .reset_index().pivot(index="cohort_month", columns="month_index", values="user_id").sort_index()
    )
    # cohort_sizes는 필터 없이 전체 가입월 기준이라 인덱스가 더 넓다 - divide()가 기본으로
    # 두 인덱스를 합집합(outer)으로 맞추면서, 위에서 걸러낸 코호트월들이 전부 NaN 행으로
    # 되살아나 버린다. pivot의 인덱스로 미리 맞춰서 그 재등장을 막는다.
    retention = pivot.divide(cohort_sizes.reindex(pivot.index), axis=0) * 100

    max_month = int(retention.columns.max()) if len(retention.columns) else 0
    cohorts = []
    for idx, row in retention.iterrows():
        cohorts.append({
            "cohort": str(idx),
            "values": [None if pd.isna(row.get(m)) else round(float(row.get(m)), 1) for m in range(max_month + 1)],
        })
    return {"months": [f"{m}개월차" for m in range(max_month + 1)], "cohorts": cohorts}


@app.get("/api/customer-profile")
def get_customer_profile(start_date: str | None = None, end_date: str | None = None, session: dict = Depends(auth.get_session)):
    dataset_source = session["dataset_source"]
    users = data.load_users(dataset_source)
    _, events = data.load(dataset_source)
    events = _filter_by_date(events, "timestamp", start_date, end_date)
    if users.empty:
        return {"active_count": 0, "gender": {"male": 0, "female": 0}, "age": [], "persona": []}

    active_count = int(events["user_id"].nunique()) if not events.empty else 0

    # 기간이 지정됐으면, 성별/연령대/페르소나 분포도 "그 기간에 활동한 고객"으로 한정한다
    # (안 그러면 위 활동 고객 수는 기간별로 바뀌는데 아래 분포는 항상 전체 고객 기준이라 안 맞아 보인다).
    if start_date and end_date and not events.empty:
        active_ids = set(events["user_id"].unique())
        users = users[users["user_id"].isin(active_ids)]

    gender_counts = users["gender"].value_counts() if "gender" in users.columns else pd.Series(dtype=int)
    gender = {"male": int(gender_counts.get("M", 0)), "female": int(gender_counts.get("F", 0))}

    age = []
    if "age" in users.columns:
        age_group = pd.cut(users["age"], bins=[9, 19, 29, 39, 49, 59, 120], labels=AGE_LABELS)
        counts = age_group.value_counts().reindex(AGE_LABELS).fillna(0)
        age = [{"name": k, "value": int(v)} for k, v in counts.items()]

    persona = []
    if "persona_type" in users.columns:
        counts = users["persona_type"].value_counts()
        persona = [{"name": PERSONA_KR.get(k, k), "value": int(v)} for k, v in counts.sort_values(ascending=False).items()]

    return {"active_count": active_count, "gender": gender, "age": age, "persona": persona}
