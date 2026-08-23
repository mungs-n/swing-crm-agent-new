"""회사(데이터셋)마다 원본 데이터의 값 표기가 다를 수 있어 생기는 문제를 한 곳에서
해결하는 매핑 계층. 예: 성별을 "Male"/"Female"로 표기하는 회사, 구매 이벤트를
"checkout_complete"라고 부르는 회사 등 - main.py/chatbot.py/campaign_builder.py 등
핵심 로직은 전부 내부 표준값("M"/"F", "purchase"/"add_to_cart"/"product_view"/
"page_view" 등)만 본다고 가정하고 짜여 있다. 그래서 실제 회사 데이터를 연동할 때는
그 핵심 로직을 고치는 대신, 여기 dataset_source별 대응표만 추가하면 된다.

data.load()/load_users()가 Supabase에서 가져온 직후 딱 한 곳에서 적용하므로, 이
매핑을 통과한 뒤에는 모든 엔드포인트가 항상 표준값만 보게 된다."""

# dataset_source -> {컬럼명: {원본(회사) 값: 우리 표준값}}
VALUE_MAPS: dict[str, dict[str, dict[str, str]]] = {
    # 예시 - 실제 회사가 붙을 때 dataset_source에 맞춰 이런 식으로 추가한다:
    # "acme-corp": {
    #     "gender": {"Male": "M", "Female": "F"},
    #     "event_type": {"checkout_complete": "purchase", "add_cart": "add_to_cart", "view_item": "product_view"},
    # },
}


def apply_value_map(df, dataset_source: str, column: str):
    """df[column]의 각 값을 이 dataset_source의 매핑 규칙으로 바꿔서 돌려준다. 이
    dataset_source나 이 컬럼에 대한 규칙이 없으면(우리 표준값을 이미 쓰는 경우 포함)
    아무것도 안 하고 원본 그대로 돌려준다 - 매핑 안 걸린 값을 조용히 지우지 않는다."""
    if df.empty or column not in df.columns:
        return df
    mapping = VALUE_MAPS.get(dataset_source, {}).get(column)
    if not mapping:
        return df
    return df.assign(**{column: df[column].map(lambda v: mapping.get(v, v))})
