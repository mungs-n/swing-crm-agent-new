"""
회사가 자기 웹사이트/백엔드에서 실시간 이벤트·주문·고객 데이터를 이 시스템에 직접
흘려보낼 수 있게 하는 수집 API. auth.py에서 가입 시 발급하는 회사 자격 증명을
그대로 쓴다 - 이 API가 없으면 실제 회사 데이터를 넣을 방법이 Supabase에 직접
SQL/CSV로 넣어주는 것뿐이었다.

Streamlit 시절 별도 서버(swing-crm-agent/ingestion_server)로 배포됐던 핵심 로직을
그대로 포팅했다 - 트래킹 부하를 대시보드 API와 격리하려던 이유였는데, 지금 규모에선
그 이유가 아직 없어서 이 백엔드에 라우터 하나로 합쳤다 (필요해지면 나중에 다시
분리하면 된다).

인증은 두 키를 구분해서 쓴다(원본과 동일한 이유):
- api_key: 회사 웹사이트의 JS(tracking.js)에 그대로 노출되는 공개 키. 이벤트
  수집(/track)만 허용한다 - 노출돼도 가짜 페이지뷰 정도만 조작 가능하다.
- webhook_secret: 회사 서버 쪽에서만 쓰는 비공개 키. 주문/고객 데이터는 매출·개인정보라
  브라우저에 노출되는 api_key로 위조 가능하면 안 되므로 별도 키로 인증한다.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import data as data_module

router = APIRouter()

# 회사 수가 적고 키가 자주 안 바뀌므로, 매 요청마다 companies 테이블을 다시 조회하지
# 않도록 메모리에 캐시한다.
_api_key_cache: dict[str, str] = {}
_webhook_secret_cache: dict[str, str] = {}


def _resolve_by_api_key(api_key: str) -> str | None:
    if api_key in _api_key_cache:
        return _api_key_cache[api_key]
    res = data_module._get_client().table("companies").select("dataset_source").eq("api_key", api_key).limit(1).execute()
    if not res.data:
        return None
    dataset_source = res.data[0]["dataset_source"]
    _api_key_cache[api_key] = dataset_source
    return dataset_source


def _resolve_by_webhook_secret(webhook_secret: str) -> str | None:
    if webhook_secret in _webhook_secret_cache:
        return _webhook_secret_cache[webhook_secret]
    res = data_module._get_client().table("companies").select("dataset_source").eq("webhook_secret", webhook_secret).limit(1).execute()
    if not res.data:
        return None
    dataset_source = res.data[0]["dataset_source"]
    _webhook_secret_cache[webhook_secret] = dataset_source
    return dataset_source


class TrackEvent(BaseModel):
    api_key: str
    event_type: str
    user_id: str
    session_id: str
    product_id: str | None = None
    category: str | None = None
    price: float | None = None


class OrderIngest(BaseModel):
    webhook_secret: str
    order_id: str
    user_id: str
    total_amount: float
    order_date: str | None = None  # 없으면 수신 시각으로 채운다
    discount_amount: float = 0
    coupon_used: bool | None = None
    category: str | None = None


class UserIngest(BaseModel):
    webhook_secret: str
    user_id: str
    name: str | None = None
    gender: str | None = None
    age: int | None = None
    region: str | None = None
    acquisition_channel: str | None = None
    signup_date: str | None = None
    # 회사가 이미 자체 고객 세그먼트를 갖고 있으면 직접 넘겨도 된다. 안 넘기면
    # data.load_users()가 주문/이벤트로부터 자동으로 추정해 채운다(utils/persona.py).
    persona_type: str | None = None
    # 이 두 필드가 있어야 캠페인/A-B 테스트가 실제로 발송된다(ab_test._resolve_receivers,
    # push_sender/email_sender) - 없으면 대상자는 잡히지만 발송은 "연락처 없음"으로 스킵된다.
    email: str | None = None
    fcm_token: str | None = None


@router.post("/api/ingest/track")
def track(event: TrackEvent):
    dataset_source = _resolve_by_api_key(event.api_key)
    if dataset_source is None:
        raise HTTPException(status_code=401, detail="유효하지 않은 api_key예요.")

    row = {
        "dataset_source": dataset_source,
        "user_id": event.user_id,
        "session_id": event.session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event.event_type,
        "product_id": event.product_id,
        "category": event.category,
        # events.price는 정수 컬럼이라 소수점 있는 값을 그대로 보내면 저장이 실패한다.
        "price": int(event.price) if event.price is not None else None,
    }
    try:
        data_module._get_client().table("events").insert(row).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"이벤트 저장에 실패했어요: {e}")
    return {"ok": True}


@router.post("/api/ingest/orders")
def ingest_order(order: OrderIngest):
    dataset_source = _resolve_by_webhook_secret(order.webhook_secret)
    if dataset_source is None:
        raise HTTPException(status_code=401, detail="유효하지 않은 webhook_secret이에요.")

    client = data_module._get_client()
    # orders.user_id가 users(dataset_source, user_id)를 참조하므로, 처음 주문하는
    # 고객이면 최소 프로필을 먼저 만들어둔다 (이미 있으면 upsert라 덮어쓰지 않는다).
    try:
        client.table("users").upsert(
            {"dataset_source": dataset_source, "user_id": order.user_id},
            on_conflict="dataset_source,user_id",
        ).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"고객 정보 처리에 실패했어요: {e}")

    row = {
        "dataset_source": dataset_source,
        "order_id": order.order_id,
        "user_id": order.user_id,
        "order_date": order.order_date or datetime.now(timezone.utc).isoformat(),
        "total_amount": order.total_amount,
        "discount_amount": order.discount_amount,
        "coupon_used": order.coupon_used,
        "category": order.category,
    }
    try:
        client.table("orders").upsert(row, on_conflict="dataset_source,order_id").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"주문 저장에 실패했어요: {e}")
    return {"ok": True}


@router.post("/api/ingest/users")
def ingest_user(user: UserIngest):
    dataset_source = _resolve_by_webhook_secret(user.webhook_secret)
    if dataset_source is None:
        raise HTTPException(status_code=401, detail="유효하지 않은 webhook_secret이에요.")

    row = {"dataset_source": dataset_source, "user_id": user.user_id}
    for field in ("name", "gender", "age", "region", "acquisition_channel", "signup_date", "persona_type", "email", "fcm_token"):
        value = getattr(user, field)
        if value is not None:
            row[field] = value

    try:
        data_module._get_client().table("users").upsert(row, on_conflict="dataset_source,user_id").execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"고객 정보 저장에 실패했어요: {e}")
    return {"ok": True}
