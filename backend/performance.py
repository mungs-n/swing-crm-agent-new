"""
캠페인 관리 / 퍼포먼스 대시보드. campaign_history/campaign_sends도 다른 테이블과
마찬가지로 dataset_source로 회사별로 분리한다 - 예전엔 "ATHLEPA 전용"으로 설계돼
로그인한 회사와 무관하게 항상 같은 값을 돌려줬는데, 실제 회사가 로그인해서
자기 것이 아닌 ATHLEPA 데이터를 보게 되는 문제가 있어 고쳤다. 기존 athlepa 데이터는
dataset_source='athlepa'로 백필했다."""

import re
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends

import auth
import data as data_module

router = APIRouter()

_CLICK_TRACKABLE = {
    "email": True, "kakao": True, "webpush": True, "webpopup": False, "sms": False,
}

CHANNEL_LABEL_KR = {"email": "이메일", "kakao": "카카오 알림톡", "sms": "문자", "webpush": "웹 푸시", "webpopup": "웹 팝업"}


def _normalize_channel(raw):
    """campaign_sends.channel 값이 두 갈래로 섞여 들어온다 - 최근 발송은 내부 키
    ("email"/"kakao" 등)로 저장되는데, 예전 캠페인 만들기 탭이 만든 행들은 화면에
    보이는 한글 라벨("이메일", "이메일 ✉️" 등)을 그대로 저장해뒀다. 이 두 표현이
    안 섞이면 groupby("channel")가 "이메일"과 "email"을 다른 채널로 세서, 채널별
    성과 목록에 같은 채널이 여러 줄로 쪼개져 보인다 (원본 Streamlit 버전
    ab_test/data.py의 _normalize_channel과 동일한 이유/로직)."""
    if pd.isna(raw):
        return raw
    s = str(raw)
    if s in CHANNEL_LABEL_KR:
        return s
    if "카카오" in s:
        return "kakao"
    if "문자" in s or "sms" in s.lower():
        return "sms"
    if "웹 푸시" in s or "웹푸시" in s or "push" in s.lower():
        return "webpush"
    if "웹 팝업" in s or "웹팝업" in s or "popup" in s.lower():
        return "webpopup"
    if "이메일" in s or "email" in s.lower():
        return "email"
    return s

_CREATIVE_NAME_POOL = {
    "email": ["첫 구매 웰컴 시리즈", "이달의 신상 안내", "휴면 고객 재활성화 뉴스레터", "VIP 감사 캠페인", "생일 축하 쿠폰", "베스트셀러 위클리 픽"],
    "kakao": ["오늘의 특가 알림", "친구 초대 이벤트", "재입고 알림톡", "포인트 소멸 안내", "카카오 단독 쿠폰"],
    "sms": ["장바구니 리마인드 문자", "결제 임박 알림", "쿠폰 만료 안내", "재구매 유도 메시지"],
    "webpush": ["장바구니 이탈 리마인드", "찜한 상품 할인 알림", "실시간 특가 푸시", "재입고 푸시 알림"],
    "webpopup": ["시즌오프 웹 팝업", "첫 방문 웰컴 팝업", "장바구니 이탈 방지 팝업", "한정 수량 알림 팝업"],
}


def _load_campaign_history(dataset_source: str) -> pd.DataFrame:
    def loader():
        rows = data_module._get_client().table("campaign_history").select("*").eq("dataset_source", dataset_source).execute().data
        if not rows:
            return pd.DataFrame(columns=["campaign_id", "sent_at", "segment", "target_count", "message_summary", "status", "approval_mode"])
        df = pd.DataFrame(rows)
        df["sent_at"] = pd.to_datetime(df["sent_at"], errors="coerce", format="ISO8601")
        return df

    return data_module._cached(f"campaign_history:{dataset_source}", loader)


def _load_campaign_sends(dataset_source: str) -> pd.DataFrame:
    """campaign_sends는 보통 몇 페이지 안 되는 작은 테이블이라(실측 ~3300행, 4페이지),
    orders/events(수만~10만+행, 100페이지 이상)처럼 스레드풀 병렬 조회를 붙이면 오히려
    스레드 디스패치/커넥션 수립 비용이 왕복 절약분보다 커서 더 느려진다(실측: 병렬
    15.2s > 순차 10.7s). 그래서 여기는 순차로 페이지를 넘기되, 매 반복마다 새
    Supabase 클라이언트를 만들던 예전 비효율만 스레드-로컬 클라이언트 재사용으로 고쳤다."""
    def loader():
        client = data_module._get_client()
        rows = []
        start = 0
        while True:
            page = (
                client.table("campaign_sends").select("*").eq("dataset_source", dataset_source)
                .order("id").range(start, start + data_module.PAGE_SIZE - 1).execute().data
            )
            rows.extend(page)
            if len(page) < data_module.PAGE_SIZE:
                break
            start += data_module.PAGE_SIZE
        if not rows:
            return pd.DataFrame(columns=["send_id", "campaign_id", "user_id", "segment", "channel", "sent_at", "delivered", "opened_at", "clicked_at", "converted_order_id", "conversion_type", "revenue"])

        df = pd.DataFrame(rows)
        df["sent_at"] = pd.to_datetime(df["sent_at"], errors="coerce", format="ISO8601")
        df["channel"] = df["channel"].map(_normalize_channel)
        return df

    return data_module._cached(f"campaign_sends:{dataset_source}", loader)


def record_campaign_sends(dataset_source: str, campaign_id: str, segment: str, channel: str, user_ids: list[str], campaign_name: str) -> None:
    """실제로 이메일/웹 푸시를 보낸 결과를 campaign_history(캠페인 1건) + campaign_sends
    (수신자별 1행씩)에 기록해서 성과 대시보드에 실제 발송 실적이 쌓이게 한다.
    오픈/클릭/전환은 아직 실시간 트래킹 인프라가 없어 항상 비워두고, "보냈다"는
    사실만 정직하게 남긴다 - A/B 테스트 그룹 발송(ab_test.py)에서 호출한다."""
    if not user_ids:
        return
    client = data_module._get_client()
    now = datetime.now(timezone.utc).isoformat()
    client.table("campaign_history").insert({
        "campaign_id": campaign_id, "dataset_source": dataset_source, "sent_at": now,
        "segment": segment, "target_count": len(user_ids),
        "message_summary": f"제목: {campaign_name}", "status": f"실제 발송 완료 ({len(user_ids)}명)",
    }).execute()
    rows = [{
        "send_id": f"{campaign_id}-{uid}", "campaign_id": campaign_id, "user_id": uid,
        "dataset_source": dataset_source, "segment": segment, "channel": channel,
        "sent_at": now, "delivered": True,
    } for uid in user_ids]
    client.table("campaign_sends").insert(rows).execute()


def _cvr(users: int, conversions: int) -> float:
    return (conversions / users * 100) if users else 0.0


def _extract_campaign_name(message_summary, fallback: str) -> str:
    if isinstance(message_summary, str) and message_summary.strip():
        m = re.search(r"제목:\s*(.+)", message_summary)
        if m and m.group(1).strip():
            return m.group(1).strip()[:30]
    return fallback


def _creative_names(campaign_ids_by_channel: dict) -> dict:
    result = {}
    for channel, ids in campaign_ids_by_channel.items():
        pool = _CREATIVE_NAME_POOL.get(channel)
        for i, cid in enumerate(sorted(ids)):
            result[cid] = pool[i % len(pool)] if pool else f"{channel} 캠페인"
    return result


@router.get("/api/campaigns")
def get_campaigns(session: dict = Depends(auth.get_session)):
    """캠페인 관리 목록 (전체 기간). 실제 Supabase campaign_history + 이 실험
    앱에서 만든 로컬(시뮬레이션) 캠페인(campaign_builder.py)을 합쳐서 보여준다."""
    import campaign_builder

    out = []
    history = _load_campaign_history(session["dataset_source"])
    if not history.empty:
        for _, r in history.iterrows():
            out.append({
                "campaign_id": r["campaign_id"],
                "name": _extract_campaign_name(r.get("message_summary"), f"{r.get('segment', '')} 캠페인"),
                "segment": r.get("segment", ""),
                "target_count": int(r.get("target_count") or 0),
                "status": str(r.get("status", "")),
                "sent_at": r["sent_at"].isoformat() if pd.notna(r["sent_at"]) else None,
                "message_summary": r.get("message_summary", ""),
            })

    for c in campaign_builder._load_store(session["dataset_source"]):
        out.append({
            "campaign_id": c["campaign_id"],
            "name": _extract_campaign_name(c.get("message_summary"), f"{c.get('segment', '')} 캠페인"),
            "segment": c.get("segment", ""),
            "target_count": int(c.get("target_count") or 0),
            "status": c.get("status", ""),
            "sent_at": c.get("sent_at"),
            "message_summary": c.get("message_summary", ""),
        })

    out.sort(key=lambda r: r["sent_at"] or "", reverse=True)
    return out


def _kpi_snapshot(df: pd.DataFrame) -> dict:
    """delivered의 부분집합(전체 기간 또는 반쪽 기간)에서 발송/클릭률/전환율/매출을
    한 세트로 계산한다. 현재/이전 기간에 각각 호출해서 증감을 낸다."""
    s = len(df)
    trk = df[df["channel"].map(_CLICK_TRACKABLE).fillna(False)]
    c = trk["clicked_at"].notna().sum()
    ctr_ = (c / len(trk) * 100) if len(trk) else 0.0
    conv = df["converted_order_id"].notna().sum()
    cvr_ = _cvr(s, conv)
    rev = float(df["revenue"].fillna(0).sum())
    return {"sent": s, "ctr": ctr_, "cvr": cvr_, "revenue": rev}


def _pct_delta(cur, prev):
    return (cur - prev) / prev * 100 if prev else 0.0


@router.get("/api/performance")
def get_performance(start_date: str | None = None, end_date: str | None = None, session: dict = Depends(auth.get_session)):
    """퍼포먼스 대시보드: KPI 요약(+ 이전 기간 대비 증감) + 일자별 추이 + 채널별 성과 + 캠페인별 상세."""
    sends = _load_campaign_sends(session["dataset_source"])
    history = _load_campaign_history(session["dataset_source"])
    if sends.empty:
        return {
            "kpi": {"sent": 0, "sent_delta": 0, "ctr": 0, "ctr_delta": 0, "cvr": 0, "cvr_delta": 0,
                    "revenue": 0, "revenue_delta": 0, "auto_share": 0, "auto_share_delta": 0,
                    "cvr_uplift_pp": None, "incremental_revenue": 0},
            "date_range": None, "data_range": None, "trend": [], "channels": [], "channel_keys": [], "weekly_channel": [], "campaigns": [],
        }

    delivered_all = sends[sends["delivered"] == True]  # noqa: E712
    orders, _ = data_module.load(session["dataset_source"])

    # 필터가 없을 때 보여줄 "전체 발송 이력 범위" (날짜 필터의 선택 가능 범위 안내용, 필터 여부와 무관하게 항상 전체 기준)
    data_range = None
    if not delivered_all.empty:
        data_range = {"min": delivered_all["sent_at"].min().date().isoformat(), "max": delivered_all["sent_at"].max().date().isoformat()}

    start_ts = end_ts = prev_start = prev_end = None
    if start_date and end_date:
        # 상단 날짜 필터로 기간을 직접 골랐을 때: 그 기간을 '현재'로, 바로 직전
        # 같은 길이의 기간을 '이전'으로 비교한다 (탭1 대시보드 get_kpi와 동일한 방식).
        start_ts = pd.Timestamp(start_date)
        end_ts = pd.Timestamp(end_date) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
        span = end_ts - start_ts
        prev_end = start_ts - pd.Timedelta(seconds=1)
        prev_start = prev_end - span
        delivered = delivered_all[(delivered_all["sent_at"] >= start_ts) & (delivered_all["sent_at"] <= end_ts)]
    else:
        delivered = delivered_all

    # --- KPI 요약(선택된 기간 전체, 필터 없으면 전체 기간) ---
    kpi_now = _kpi_snapshot(delivered)
    sent, ctr, cvr_total, revenue = kpi_now["sent"], kpi_now["ctr"], kpi_now["cvr"], kpi_now["revenue"]

    if start_ts is not None and not orders.empty:
        orders_in_range = orders[(orders["order_date"] >= start_ts) & (orders["order_date"] <= end_ts)]
    else:
        orders_in_range = orders
    total_revenue = float(orders_in_range["total_amount"].sum()) if not orders_in_range.empty else 0
    auto_share = (revenue / total_revenue * 100) if total_revenue else 0.0

    date_range = {"start": delivered["sent_at"].min().date().isoformat(), "end": delivered["sent_at"].max().date().isoformat()} if not delivered.empty else None

    if not delivered.empty:
        if start_ts is not None:
            cur_half = delivered
            prev_half = delivered_all[(delivered_all["sent_at"] >= prev_start) & (delivered_all["sent_at"] <= prev_end)]
        else:
            max_date, min_date = delivered["sent_at"].max(), delivered["sent_at"].min()
            half_days = max(1, ((max_date - min_date).days + 1) // 2)
            mid = max_date - pd.Timedelta(days=half_days)
            cur_half = delivered[delivered["sent_at"] > mid]
            prev_half = delivered[delivered["sent_at"] <= mid]
        kpi_prev = _kpi_snapshot(prev_half)
        kpi_cur = _kpi_snapshot(cur_half)

        if not orders.empty:
            if start_ts is not None:
                cur_total_rev = total_revenue
                prev_total_rev = float(orders[(orders["order_date"] >= prev_start) & (orders["order_date"] <= prev_end)]["total_amount"].sum())
            else:
                cur_total_rev = float(orders[orders["order_date"] > mid]["total_amount"].sum())
                prev_total_rev = float(orders[orders["order_date"] <= mid]["total_amount"].sum())
        else:
            cur_total_rev = prev_total_rev = 0
        auto_share_cur = (kpi_cur["revenue"] / cur_total_rev * 100) if cur_total_rev else 0.0
        auto_share_prev = (kpi_prev["revenue"] / prev_total_rev * 100) if prev_total_rev else 0.0

        sent_delta = _pct_delta(kpi_cur["sent"], kpi_prev["sent"])
        ctr_delta = kpi_cur["ctr"] - kpi_prev["ctr"]
        cvr_delta = kpi_cur["cvr"] - kpi_prev["cvr"]
        revenue_delta = _pct_delta(kpi_cur["revenue"], kpi_prev["revenue"])
        auto_share_delta = auto_share_cur - auto_share_prev
    else:
        sent_delta = ctr_delta = cvr_delta = revenue_delta = auto_share_delta = 0.0

    # --- 일자별 추이 ---
    trend = []
    if not delivered.empty:
        d = delivered.copy()
        d["date"] = d["sent_at"].dt.date
        grouped = d.groupby("date").agg(
            sent=("send_id", "count"),
            clicks=("clicked_at", lambda s: s.notna().sum()),
            conversions=("converted_order_id", lambda s: s.notna().sum()),
            revenue=("revenue", lambda s: s.fillna(0).sum()),
        ).reset_index()
        trend = [
            {"date": str(r["date"]), "sent": int(r["sent"]), "clicks": int(r["clicks"]),
             "conversions": int(r["conversions"]), "revenue": float(r["revenue"])}
            for _, r in grouped.iterrows()
        ]

    # --- 채널별 성과 ---
    channels = []
    channel_keys = []
    if not delivered.empty:
        grouped = delivered.groupby("channel").agg(
            sent=("send_id", "count"),
            conversions=("converted_order_id", lambda s: s.notna().sum()),
            revenue=("revenue", lambda s: s.fillna(0).sum()),
        ).reset_index().sort_values("sent", ascending=False)
        channel_keys = grouped["channel"].tolist()
        max_sent = grouped["sent"].max()
        channels = [
            {
                "channel": r["channel"], "label": CHANNEL_LABEL_KR.get(r["channel"], r["channel"]),
                "sent": int(r["sent"]), "cvr": _cvr(r["sent"], r["conversions"]), "revenue": float(r["revenue"]),
                "share": round(r["sent"] / max_sent * 100, 1) if max_sent else 0,
            }
            for _, r in grouped.iterrows()
        ]

    # --- 채널별 주간 발송 현황 (최근 8주) ---
    weekly_channel = []
    if not delivered.empty:
        d = delivered.copy()
        d["week_start"] = d["sent_at"].dt.to_period("W-MON").apply(lambda p: p.start_time)
        pivot = d.groupby(["week_start", "channel"]).size().unstack(fill_value=0)
        pivot = pivot.sort_index().tail(8)
        for week_start, row in pivot.iterrows():
            weekly_channel.append({"week": week_start.strftime("%m/%d"), **{ch: int(v) for ch, v in row.items()}})

    # --- 캠페인별 상세 (전후 비교 기반 uplift - AB 테스트 데이터가 없으면 항상 이 방식) ---
    campaigns = []
    uplift_weighted_sum, uplift_weight_total = 0.0, 0
    incremental_revenue_total = 0.0
    if not delivered.empty and not history.empty:
        channel_by_campaign = delivered.groupby("campaign_id")["channel"].agg(lambda s: s.mode().iloc[0])
        by_channel = {}
        for cid, ch in channel_by_campaign.items():
            by_channel.setdefault(ch, []).append(cid)
        creative_names = _creative_names(by_channel)

        for campaign_id, g in delivered.groupby("campaign_id"):
            hist_row = history[history["campaign_id"] == campaign_id]
            if hist_row.empty:
                continue
            hist_row = hist_row.iloc[0]
            channel = g["channel"].mode().iloc[0]
            trackable_ch = _CLICK_TRACKABLE.get(channel, False)
            c_sent = len(g)
            c_clicks = g["clicked_at"].notna().sum()
            c_ctr = (c_clicks / c_sent * 100) if c_sent and trackable_ch else None
            c_conv = g["converted_order_id"].notna().sum()
            c_cvr = _cvr(c_sent, c_conv)
            c_revenue = float(g["revenue"].fillna(0).sum())

            segment = hist_row["segment"]
            others = delivered[(delivered["segment"] == segment) & (delivered["campaign_id"] != campaign_id)]
            baseline_cvr = _cvr(len(others), others["converted_order_id"].notna().sum()) if len(others) else None
            uplift = ((c_cvr - baseline_cvr) / baseline_cvr * 100) if baseline_cvr else None

            # 세그먼트 내 다른 캠페인 평균(baseline) 대비 이 캠페인의 %p 증분과, 그
            # 증분만큼 더 나온 것으로 추정되는 매출(같은 캠페인의 건당 매출을 그대로
            # 적용) - "자동화를 안 했으면"의 대략적인 반사실적 추정치다.
            if baseline_cvr is not None:
                uplift_weighted_sum += c_sent * (c_cvr - baseline_cvr)
                uplift_weight_total += c_sent
                baseline_expected_conv = c_sent * baseline_cvr / 100
                if c_conv > 0:
                    incremental_revenue_total += (c_conv - baseline_expected_conv) * (c_revenue / c_conv)

            campaigns.append({
                "campaign_id": campaign_id,
                "name": _extract_campaign_name(hist_row["message_summary"], creative_names.get(campaign_id, f"{channel} 캠페인")),
                "channel": channel, "channel_label": CHANNEL_LABEL_KR.get(channel, channel),
                "sent": int(c_sent), "ctr": c_ctr, "cvr": round(c_cvr, 1),
                "revenue": c_revenue, "cvr_uplift": round(uplift, 1) if uplift is not None else None,
            })
        campaigns.sort(key=lambda r: r["revenue"], reverse=True)

    cvr_uplift_pp = round(uplift_weighted_sum / uplift_weight_total, 1) if uplift_weight_total else None

    return {
        "kpi": {
            "sent": sent, "sent_delta": round(sent_delta, 1),
            "ctr": round(ctr, 1), "ctr_delta": round(ctr_delta, 1),
            "cvr": round(cvr_total, 1), "cvr_delta": round(cvr_delta, 1),
            "revenue": revenue, "revenue_delta": round(revenue_delta, 1),
            "auto_share": round(auto_share, 1), "auto_share_delta": round(auto_share_delta, 1),
            "cvr_uplift_pp": cvr_uplift_pp, "incremental_revenue": round(incremental_revenue_total),
        },
        "date_range": date_range, "data_range": data_range, "trend": trend, "channels": channels, "channel_keys": channel_keys,
        "weekly_channel": weekly_channel, "campaigns": campaigns[:20],
    }
