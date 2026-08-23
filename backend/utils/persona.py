"""페르소나(persona_type) 자동 추정. 실제 회사 데이터에는 이 라벨이 애초에 없을
거라 - main.py/chatbot.py/campaign_builder.py는 전부 persona_type이 users 테이블에
이미 라벨링돼서 들어와 있다고만 가정하고 짜여 있다 - RFM(utils/rfm.py)과 같은
방식으로 주문/이벤트/가입일 데이터에서 규칙 기반으로 역산한다.

진짜 비지도 클러스터링(K-means 등) 대신 규칙 기반을 택한 이유: 결과를 그대로
설명할 수 있고("가입 14일 이내라 신규 탐색자"), scikit-learn 같은 새 의존성이나
학습 데이터 없이 어떤 규모의 데이터셋에도 바로 동작한다. RFM과 마찬가지로 절대
날짜/금액이 아니라 이 데이터셋 안에서의 상대적 순위(중앙값 비교)로 판단해서,
통화 단위나 데이터 규모가 달라져도 그대로 동작한다."""

import pandas as pd

# campaign_builder.TARGET_OPTIONS/data.PERSONA_KR와 반드시 같은 6개 키를 써야 한다.
NEW_EXPLORER, DORMANT, CHURN_RISK = "new_explorer", "dormant", "churn_risk"
DISCOUNT_HUNTER, IMPULSIVE_BUYER, BRAND_LOYALIST = "discount_hunter", "impulsive_buyer", "brand_loyalist"

DORMANT_DAYS = 90  # "90일 이상 미방문"
CHURN_RISK_DAYS = 45  # "45일 이상 미구매"
NEW_EXPLORER_DAYS = 14  # "가입 14일 이내"
DISCOUNT_HUNTER_COUPON_RATE = 0.5  # "쿠폰/할인 위주로 구매"


def derive_personas(users: pd.DataFrame, orders: pd.DataFrame, events: pd.DataFrame) -> pd.Series:
    """user_id -> persona_type(문자열) Series를 돌려준다. 판단할 근거(주문/이벤트/
    가입일)가 하나도 없는 유저는 결과에서 제외된다(호출부가 원래 값을 그대로 둔다)."""
    if users.empty or "user_id" not in users.columns:
        return pd.Series(dtype=object)

    as_of_candidates = []
    if not orders.empty and "order_date" in orders.columns:
        as_of_candidates.append(pd.to_datetime(orders["order_date"]).max())
    if not events.empty and "timestamp" in events.columns:
        as_of_candidates.append(pd.to_datetime(events["timestamp"]).max())
    if not as_of_candidates:
        return pd.Series(dtype=object)
    as_of = max(as_of_candidates)

    stats = users[["user_id"]].drop_duplicates().set_index("user_id")

    if not orders.empty:
        agg = orders.groupby("user_id").agg(
            order_count=("order_id", "count"),
            avg_order_value=("total_amount", "mean"),
            last_order_date=("order_date", "max"),
            **({"coupon_rate": ("coupon_used", "mean")} if "coupon_used" in orders.columns else {}),
        )
        stats = stats.join(agg)

    if not events.empty:
        stats = stats.join(events.groupby("user_id")["timestamp"].max().rename("last_event_date"))

    if "signup_date" in users.columns:
        stats = stats.join(users.set_index("user_id")["signup_date"])

    for col, ref_col in [("days_since_order", "last_order_date"), ("days_since_event", "last_event_date"), ("days_since_signup", "signup_date")]:
        stats[col] = (as_of - stats[ref_col]).dt.days if ref_col in stats.columns else pd.NA

    freq_median = stats["order_count"].median() if "order_count" in stats.columns else None
    aov_median = stats["avg_order_value"].median() if "avg_order_value" in stats.columns else None
    has_coupon_rate = "coupon_rate" in stats.columns

    def classify(row) -> str | None:
        if pd.notna(row["days_since_signup"]) and row["days_since_signup"] <= NEW_EXPLORER_DAYS:
            return NEW_EXPLORER
        if pd.notna(row["days_since_event"]) and row["days_since_event"] >= DORMANT_DAYS:
            return DORMANT
        if pd.notna(row["days_since_order"]) and row["days_since_order"] >= CHURN_RISK_DAYS:
            return CHURN_RISK
        if pd.isna(row.get("order_count")) or not row.get("order_count"):
            return None  # 주문 이력이 없으면 할인/충동/충성 여부를 판단할 근거가 없다
        if has_coupon_rate and pd.notna(row["coupon_rate"]) and row["coupon_rate"] >= DISCOUNT_HUNTER_COUPON_RATE:
            return DISCOUNT_HUNTER
        if freq_median is not None and aov_median is not None and row["order_count"] >= freq_median and row["avg_order_value"] < aov_median:
            return IMPULSIVE_BUYER
        return BRAND_LOYALIST

    return stats.apply(classify, axis=1).dropna()
