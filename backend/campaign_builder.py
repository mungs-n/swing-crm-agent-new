"""
캠페인 생성 (타겟 선택 -> AI 카피 생성 -> 발송). Streamlit 버전(automation/campaign_builder.py)의
핵심 흐름을 그대로 옮기되, 두 가지는 의도적으로 다르게 갔다.

1) 카카오톡/문자/웹 푸시 발송 연동(SendGrid/Firebase)이 이 백엔드에는 아예 없다
   (.env에 관련 키가 없음 - ANTHROPIC_API_KEY/SUPABASE만 있음). 그래서 '발송'은
   실제로 어디에도 메시지를 보내지 않고, 채널 히스토리 기반 시뮬레이션으로 그친다.
2) 생성된 캠페인은 실제 운영 중인 Supabase campaign_history 테이블에 쓰지 않고
   로컬 JSON 파일에 따로 저장한다 - Streamlit 버전과 같은 Supabase 프로젝트를
   그대로 재사용하는 중이라, 여기서 만든 실험/시뮬레이션 캠페인이 실제 팀 대시보드에
   섞여 들어가면 안 되기 때문이다(ab_test.py도 같은 이유로 파일 저장을 쓴다).
   그래서 캠페인 관리 목록(GET /api/campaigns)은 실제 campaign_history + 이 파일을
   합쳐서 보여준다.
"""

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import data as data_module
import email_sender
import push_sender
from utils.rfm import calculate_rfm, assign_segment

router = APIRouter()

_STORE_PATH = Path(__file__).parent / "data_store" / "campaigns.json"

TARGET_OPTIONS = {
    "신규 탐색자": {"kind": "persona", "key": "new_explorer", "desc": ["가입 14일 이내", "첫 구매 유도 필요", "신규회원 전용 웰컴 혜택", "베스트셀러 추천"]},
    "충동 구매자": {"kind": "persona", "key": "impulsive_buyer", "desc": ["고빈도 소액", "신상품·기획전 반응 높음", "시각적 매력", "매진 임박", "긴박감"]},
    "할인 구매자": {"kind": "persona", "key": "discount_hunter", "desc": ["세일 시즌에만 반응", "할인 쿠폰/적립금 효과적", "할인율 명확히 강조", "쿠폰 만료 임박 강조"]},
    "브랜드 충성 고객": {"kind": "persona", "key": "brand_loyalist", "desc": ["중빈도 재구매", "VIP 혜택 선호", "브랜드 신뢰도 높음", "신제품 사전 공개"]},
    "이탈 위험 고객": {"kind": "persona", "key": "churn_risk", "desc": ["45일 이상 미구매", "재활성화 필요", "장바구니 상품 리마인드", "파격 리텐션 쿠폰"]},
    "휴면 고객": {"kind": "persona", "key": "dormant", "desc": ["90일 이상 미방문", "윈백 캠페인 대상", "다시 돌아오면 제공되는 혜택"]},
    "RFM: VIP": {"kind": "rfm", "key": "VIP", "desc": ["최근성·구매빈도·구매액 상위 25%", "감사 인사와 특별 대우", "VIP 전용 이벤트·신제품 우선 공개"]},
    "RFM: 충성 고객": {"kind": "rfm", "key": "충성 고객", "desc": ["RFM 상위 2등급, 꾸준한 구매자", "리워드·적립 강조", "신제품 소식 우선 전달"]},
    "RFM: 이탈 위험": {"kind": "rfm", "key": "이탈 위험", "desc": ["RFM 하위 2등급, 최근 구매가 뜸해짐", "재구매 유도 쿠폰", "놓친 신상품 리마인드"]},
    "RFM: 휴면": {"kind": "rfm", "key": "휴면", "desc": ["RFM 종합 최하위 25%", "장기 미구매·저빈도·저액", "파격 할인으로 재유입 유도"]},
    "장바구니 이탈 고객": {"kind": "cart_abandon", "key": None, "desc": ["상품을 장바구니에 담았지만 구매하지 않음", "구매 완결 유도", "한정 할인·무료배송으로 전환 유도"]},
}

CHANNEL_META = {
    "kakao": {"label": "카카오톡", "guide": "카카오톡 메시지 형식으로 친근하고 가독성 있게 작성. 줄바꿈을 적극 활용."},
    "sms": {"label": "문자(SMS/LMS)", "guide": "99바이트 이내의 짧고 명확한 문장. 핵심 혜택을 직관적으로."},
    "webpush": {"label": "웹 푸시", "guide": "제목은 15자 이내로 호기심 유도, 본문은 30자 이내 단문."},
    "email": {"label": "이메일", "guide": "클릭을 부르는 제목과 2~3문장 본문. 구체적 혜택과 Call to Action 포함."},
}


def _load_store() -> list[dict]:
    if not _STORE_PATH.exists():
        return []
    with open(_STORE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save_store(campaigns: list[dict]) -> None:
    _STORE_PATH.parent.mkdir(exist_ok=True)
    with open(_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(campaigns, f, ensure_ascii=False, indent=2)


def _target_user_ids(segment: str) -> list:
    option = TARGET_OPTIONS.get(segment)
    if option is None:
        return []
    orders, events = data_module.load("athlepa")
    users = data_module.load_users("athlepa")
    if users.empty:
        return []

    if option["kind"] == "persona":
        if "persona_type" not in users.columns:
            return []
        return users.loc[users["persona_type"] == option["key"], "user_id"].tolist()
    if option["kind"] == "rfm":
        if orders.empty:
            return []
        rfm = assign_segment(calculate_rfm(orders.copy()))
        return rfm.loc[rfm["segment"] == option["key"], "user_id"].tolist()
    if option["kind"] == "cart_abandon":
        if events.empty or "event_type" not in events.columns:
            return []
        cart_users = set(events.loc[events["event_type"] == "add_to_cart", "user_id"])
        purchase_users = set(events.loc[events["event_type"] == "purchase", "user_id"])
        return list(cart_users - purchase_users)
    return []


class GenerateCopyRequest(BaseModel):
    segment: str
    channel: str
    situation: str | None = None  # 마케팅 레시피에서 넘어온 경우, 세그먼트 기본 설명 대신 이 상황을 소구 포인트로 사용


RECURRING_FREQS = ["매일 발송", "3일마다", "일주일마다", "특정 요일 반복"]
WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]

TRIGGER_TYPES = ["schedule", "event", "api"]
EVENT_TRIGGERS = [
    "장바구니 담기 후 미구매", "위시리스트 등록 후 미구매", "회원가입 완료", "첫 구매 완료",
    "재구매 주기 도래", "리뷰 작성 요청 (배송 완료 후)", "생일/기념일", "회원 등급 승급",
    "포인트 소멸 임박", "관심 상품 재입고", "관심 상품 가격 인하", "장기 미접속 (휴면 전환 예정)",
]


class CreateCampaignRequest(BaseModel):
    segment: str
    channel: str
    title: str
    body: str
    trigger_type: str = "schedule"  # "schedule" | "event" | "api"
    send_mode: str = "immediate"  # "immediate" | "scheduled" | "recurring" (trigger_type=="schedule"일 때만 의미)
    send_at: str | None = None
    recurring_freq: str | None = None
    recurring_weekdays: list[int] = []
    event_trigger: str | None = None
    api_endpoint_key: str | None = None
    trigger_start_at: str | None = None  # event/api 트리거일 때 감지를 시작할 시점 (기본: 지금)
    trigger_end_at: str | None = None  # event/api 트리거일 때 선택적 만료 시점 (없으면 무기한)
    image_data_url: str | None = None


class TestSendRequest(BaseModel):
    segment: str
    channel: str
    title: str
    body: str
    receiver: str


@router.get("/api/campaigns/target-size")
def get_target_size(segment: str, session: dict = Depends(auth.get_session)):
    if segment not in TARGET_OPTIONS:
        raise HTTPException(status_code=400, detail="알 수 없는 세그먼트예요.")
    return {"size": len(_target_user_ids(segment))}


@router.post("/api/campaigns/generate-copy")
def generate_copy(req: GenerateCopyRequest, session: dict = Depends(auth.get_session)):
    option = TARGET_OPTIONS.get(req.segment)
    channel_meta = CHANNEL_META.get(req.channel)
    if option is None or channel_meta is None:
        raise HTTPException(status_code=400, detail="알 수 없는 세그먼트/채널이에요.")
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY가 설정되지 않았어요.")

    situation_hint = req.situation.strip() if req.situation and req.situation.strip() else ", ".join(option["desc"][:2])

    system_prompt = f"""당신은 스포츠 웨어 브랜드 'Athlepa'의 마케팅 카피라이터입니다.
현재 선택된 발송 채널: {channel_meta['label']}
[채널별 핵심 작성 가이드]: {channel_meta['guide']}

작성 규칙:
1. [필수] 특정 개인 이름을 언급하지 말고 해당 타겟 그룹 전체에게 대량 발송할 수 있는 매력적인 문장으로 작성하세요.
2. [필수] 마크다운 문법(##, ---, **, *, ` 등)을 절대로 사용하지 마세요. 순수 텍스트로만 작성하세요.
3. 이번 메시지에서 반영할 상황/소구 포인트: {situation_hint}
4. 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.
{{"title": "채널 특성에 맞춘 제목", "body": "채널 특성에 맞춘 본문"}}"""

    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6", max_tokens=500, system=system_prompt,
            messages=[{"role": "user", "content": f"세그먼트: {req.segment}\n발송 채널: {channel_meta['label']}\n\n위 조건에 맞춰 최적화된 마케팅 메시지를 작성해주세요."}],
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"AI 카피 생성에 실패했어요: {e}")
    raw = response.content[0].text.strip()
    try:
        start, end = raw.index("{"), raw.rindex("}") + 1
        parsed = json.loads(raw[start:end])
        return {"title": parsed.get("title", ""), "body": parsed.get("body", "")}
    except (ValueError, json.JSONDecodeError):
        return {"title": "", "body": raw}


@router.get("/api/campaigns/local")
def list_local_campaigns(session: dict = Depends(auth.get_session)):
    """캠페인 관리 목록에 합쳐질 로컬(시뮬레이션) 캠페인들. performance.py의
    get_campaigns()가 실제 campaign_history와 합쳐서 반환한다."""
    return _load_store()


@router.post("/api/campaigns")
def create_campaign(req: CreateCampaignRequest, session: dict = Depends(auth.get_session)):
    if req.segment not in TARGET_OPTIONS:
        raise HTTPException(status_code=400, detail="알 수 없는 세그먼트예요.")
    if req.channel not in CHANNEL_META:
        raise HTTPException(status_code=400, detail="알 수 없는 채널이에요.")
    if not req.title.strip() or not req.body.strip():
        raise HTTPException(status_code=400, detail="메시지 제목/본문을 입력해주세요.")
    if req.trigger_type not in TRIGGER_TYPES:
        raise HTTPException(status_code=400, detail="알 수 없는 발송 방식이에요.")
    if req.trigger_type == "schedule":
        if req.send_mode == "scheduled" and not req.send_at:
            raise HTTPException(status_code=400, detail="예약 발송 시각을 입력해주세요.")
        if req.send_mode == "recurring":
            if req.recurring_freq not in RECURRING_FREQS:
                raise HTTPException(status_code=400, detail="반복 발송 빈도를 선택해주세요.")
            if req.recurring_freq == "특정 요일 반복" and not req.recurring_weekdays:
                raise HTTPException(status_code=400, detail="반복할 요일을 1개 이상 선택해주세요.")
    elif req.trigger_type == "event":
        if req.event_trigger not in EVENT_TRIGGERS:
            raise HTTPException(status_code=400, detail="트리거 이벤트를 선택해주세요.")
    elif req.trigger_type == "api":
        if not (req.api_endpoint_key or "").strip():
            raise HTTPException(status_code=400, detail="API Endpoint Key를 입력해주세요.")
    if req.trigger_type in ("event", "api") and req.trigger_start_at and req.trigger_end_at:
        if req.trigger_end_at <= req.trigger_start_at:
            raise HTTPException(status_code=400, detail="종료일시는 시작일시보다 나중이어야 해요.")

    target_count = len(_target_user_ids(req.segment))
    channel_label = CHANNEL_META[req.channel]["label"]

    if req.trigger_type in ("event", "api"):
        trigger_start = req.trigger_start_at or datetime.now().isoformat()
        period_label = f" (활성 기간: {trigger_start} ~ {req.trigger_end_at})" if req.trigger_end_at else f" ({trigger_start}부터, 무기한)"

    if req.trigger_type == "event":
        status = f"이벤트 트리거 등록 완료 ('{req.event_trigger}' 발생 시 {channel_label} 자동 발송 예정){period_label}"
        sent_at = trigger_start
    elif req.trigger_type == "api":
        status = f"API 트리거 등록 완료 (Endpoint: {req.api_endpoint_key.strip()}, {channel_label} 자동 발송 예정){period_label}"
        sent_at = trigger_start
    elif req.send_mode == "immediate":
        status = f"전체 발송 완료 ({channel_label} - {target_count}명 중 {target_count}명 성공)"
        sent_at = datetime.now().isoformat()
    elif req.send_mode == "scheduled":
        status = f"예약 등록 완료 ({req.send_at} {channel_label} 자동 발송 예정)"
        sent_at = req.send_at
    else:
        first_run = req.send_at or datetime.now().isoformat()
        status = f"반복 발송 등록 ({req.recurring_freq}, 첫 발송 {first_run} {channel_label})"
        sent_at = first_run

    campaign = {
        "campaign_id": str(uuid.uuid4())[:8],
        "sent_at": sent_at,
        "segment": req.segment,
        "channel": req.channel,
        "target_count": target_count,
        "message_summary": f"제목: {req.title.strip()}\n\n본문: {req.body.strip()}",
        "status": status,
        "created_at": datetime.now().isoformat(),
        "image_data_url": req.image_data_url,
    }
    if req.trigger_type == "event":
        campaign["trigger"] = {"kind": "event", "event": req.event_trigger, "start_at": trigger_start, "end_at": req.trigger_end_at}
    elif req.trigger_type == "api":
        campaign["trigger"] = {"kind": "api", "endpoint_key": req.api_endpoint_key.strip(), "start_at": trigger_start, "end_at": req.trigger_end_at}
    elif req.send_mode == "recurring":
        campaign["recurring"] = {
            "freq": req.recurring_freq, "weekdays": req.recurring_weekdays, "active": True,
        }

    campaigns = _load_store()
    campaigns.append(campaign)
    _save_store(campaigns)
    return campaign


@router.post("/api/campaigns/test-send")
def test_send_campaign(req: TestSendRequest, session: dict = Depends(auth.get_session)):
    """이메일은 SendGrid로 실제 발송한다. 카카오톡/문자/웹 푸시는 아직 발송 연동 전이라
    (사업자 등록·템플릿 심사·기기 토큰 수집이 선행돼야 함) 기록만 남긴다."""
    if req.channel not in CHANNEL_META:
        raise HTTPException(status_code=400, detail="알 수 없는 채널이에요.")
    if not req.receiver.strip():
        raise HTTPException(status_code=400, detail="수신자 정보를 입력해주세요.")
    if not req.title.strip() or not req.body.strip():
        raise HTTPException(status_code=400, detail="메시지 제목/본문을 입력해주세요.")

    channel_label = CHANNEL_META[req.channel]["label"]
    receiver = req.receiver.strip()

    if req.channel == "email":
        try:
            status_code = email_sender.send_email(receiver, req.title.strip(), req.body.strip())
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"이메일 발송에 실패했어요: {e}")
        status = f"테스트 발송 완료 ({channel_label}, SendGrid {status_code})"
    elif req.channel == "webpush":
        try:
            push_sender.send_web_push(receiver, req.title.strip(), req.body.strip())
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"웹 푸시 발송에 실패했어요: {e}")
        status = f"테스트 발송 완료 ({channel_label}, FCM)"
    else:
        status = f"테스트 발송 ({channel_label}) - 실제 발송 연동 전이라 기록만 남겨요."

    campaign = {
        "campaign_id": str(uuid.uuid4())[:8],
        "sent_at": datetime.now().isoformat(),
        "segment": req.segment,
        "channel": req.channel,
        "target_count": 1,
        "message_summary": f"제목: {req.title.strip()}\n\n본문: {req.body.strip()}\n\n(테스트 수신자: {receiver})",
        "status": status,
        "created_at": datetime.now().isoformat(),
    }
    campaigns = _load_store()
    campaigns.append(campaign)
    _save_store(campaigns)
    return campaign


@router.get("/api/campaigns/recurring")
def list_recurring_campaigns(session: dict = Depends(auth.get_session)):
    return [c for c in _load_store() if c.get("recurring")]


@router.post("/api/campaigns/recurring/{campaign_id}/toggle")
def toggle_recurring_campaign(campaign_id: str, session: dict = Depends(auth.get_session)):
    campaigns = _load_store()
    campaign = next((c for c in campaigns if c["campaign_id"] == campaign_id and c.get("recurring")), None)
    if campaign is None:
        raise HTTPException(status_code=404, detail="반복 발송 캠페인을 찾을 수 없어요.")
    campaign["recurring"]["active"] = not campaign["recurring"]["active"]
    _save_store(campaigns)
    return campaign


@router.delete("/api/campaigns/recurring/{campaign_id}")
def delete_recurring_campaign(campaign_id: str, session: dict = Depends(auth.get_session)):
    campaigns = _load_store()
    remaining = [c for c in campaigns if c["campaign_id"] != campaign_id]
    if len(remaining) == len(campaigns):
        raise HTTPException(status_code=404, detail="반복 발송 캠페인을 찾을 수 없어요.")
    _save_store(remaining)
    return {"ok": True}
