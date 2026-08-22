"""
대시보드 각 탭의 '원본 데이터 보기' 팝오버용 API. dashboard/charts.py의
_data_view_button()과 같은 역할 - 탭에서 쓰인 원본 행 데이터를 그대로 보여주되,
고객 실명(name)은 마스킹한다. 페이로드 크기를 생각해서 최근 500건으로 자른다
(원본 Streamlit 버전은 스크롤 가능한 표라 자르지 않지만, JSON API + React 표는
전체를 다 보내면 무거워서 이 앱만의 합리적인 상한을 뒀다)."""

import pandas as pd
from fastapi import APIRouter, Depends

import auth
import data as data_module
from utils.rfm import calculate_rfm, assign_segment
from data import CHANNEL_KR, PERSONA_KR

router = APIRouter()

_ROW_LIMIT = 500


def _mask_name(value):
    if not isinstance(value, str) or not value:
        return value
    if len(value) == 1:
        return "*"
    if len(value) == 2:
        return value[0] + "*"
    return value[0] + "*" * (len(value) - 2) + value[-1]


def _rows(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    df = df.head(_ROW_LIMIT).copy()
    if "name" in df.columns:
        df["name"] = df["name"].map(_mask_name)
    for col in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].astype(str)
    return df.where(pd.notna(df), None).to_dict(orient="records")


@router.get("/api/raw/overview")
def raw_overview(session: dict = Depends(auth.get_session)):
    ds = session["dataset_source"]
    orders, events = data_module.load(ds)
    users = data_module.load_users(ds)
    if users.empty or orders.empty:
        return {"활동 고객 데이터": [], "주문 데이터": []}

    active_ids = events["user_id"].unique() if not events.empty else []
    users_active = users[users["user_id"].isin(active_ids)]
    profile_cols = [c for c in ["user_id", "name", "gender", "age"] if c in users_active.columns]
    profile_df = users_active[profile_cols].copy()
    if "persona_type" in users_active.columns:
        profile_df["페르소나"] = users_active["persona_type"].map(PERSONA_KR).values

    order_cols = [c for c in ["order_id", "order_date", "user_id", "category", "total_amount"] if c in orders.columns]
    orders_view = orders[order_cols].sort_values("order_date", ascending=False)

    return {"활동 고객 데이터": _rows(profile_df), "주문 데이터": _rows(orders_view)}


@router.get("/api/raw/revenue")
def raw_revenue(session: dict = Depends(auth.get_session)):
    ds = session["dataset_source"]
    orders, _ = data_module.load(ds)
    users = data_module.load_users(ds)
    if orders.empty or users.empty:
        return []

    rfm = assign_segment(calculate_rfm(orders.copy()))
    merged = orders.merge(users[["user_id", "acquisition_channel"]], on="user_id").merge(rfm[["user_id", "segment"]], on="user_id")
    merged["유입채널"] = merged["acquisition_channel"].map(CHANNEL_KR)
    view = merged[["order_id", "order_date", "user_id", "category", "total_amount", "유입채널", "segment"]].sort_values("order_date", ascending=False)
    return _rows(view)


@router.get("/api/raw/behavior")
def raw_behavior(session: dict = Depends(auth.get_session)):
    ds = session["dataset_source"]
    _, events = data_module.load(ds)
    users = data_module.load_users(ds)
    if events.empty or users.empty:
        return {"이벤트 데이터": [], "가입 고객 데이터": []}

    behavior_view = events[["user_id", "session_id", "event_type", "timestamp"]].sort_values("timestamp", ascending=False)
    signup_cols = [c for c in ["user_id", "name", "gender", "age", "signup_date"] if c in users.columns]
    signup_view = users[signup_cols]

    return {"이벤트 데이터": _rows(behavior_view), "가입 고객 데이터": _rows(signup_view)}


@router.get("/api/raw/detail")
def raw_detail(session: dict = Depends(auth.get_session)):
    ds = session["dataset_source"]
    orders, _ = data_module.load(ds)
    users = data_module.load_users(ds)
    if orders.empty:
        return {"RFM (고객별 지표)": [], "재구매 유지율 데이터": []}

    rfm = assign_segment(calculate_rfm(orders.copy()))
    rfm_view = rfm[["user_id", "Recency", "Frequency", "Monetary", "segment"]]

    cohort_view = pd.DataFrame()
    if not users.empty and "signup_date" in users.columns:
        signup_month = users.set_index("user_id")["signup_date"].dt.to_period("M")
        order_month = orders["order_date"].dt.to_period("M")
        merged = orders.assign(cohort_month=orders["user_id"].map(signup_month), order_month=order_month).dropna(subset=["cohort_month"])
        if not merged.empty:
            merged["cohort_month"] = merged["cohort_month"].astype("period[M]")
            merged["가입후개월차"] = (
                (merged["order_month"].dt.year - merged["cohort_month"].dt.year) * 12
                + (merged["order_month"].dt.month - merged["cohort_month"].dt.month)
            )
            merged = merged[merged["가입후개월차"] >= 0]
            cohort_view = merged.assign(
                가입월=merged["cohort_month"].astype(str), 구매월=merged["order_month"].astype(str),
            )[["order_id", "user_id", "가입월", "구매월", "가입후개월차", "category", "total_amount"]].sort_values("구매월", ascending=False)

    return {"RFM (고객별 지표)": _rows(rfm_view), "재구매 유지율 데이터": _rows(cohort_view)}
