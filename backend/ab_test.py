"""
A/B 테스트 생성/조회. campaign_history/campaign_sends와 같은 이유로 dataset_source
구분 없이 ATHLEPA 전용으로 운영된다.

이메일/웹 푸시는 그룹별로 실제 email_sender/push_sender를 호출해서 진짜 발송을
시도한다(_dispatch_group). 다만 users 테이블에 이메일/기기 토큰 같은 연락처 컬럼이
아예 없어서(Streamlit 원본부터 그랬다 - fcm_tokens.csv도 비어 있었다) 지금은 발송
시도가 전부 "연락처 없음"으로 스킵된다 - 나중에 실제 회원 연락처/알림 동의 토큰이
쌓이면 _resolve_receivers()의 컬럼명만 채우면 그대로 실제로 나간다. 카카오/문자는
아직 실 연동 전이라 시뮬레이션만 한다. 오픈/클릭/전환 수는 어느 채널이든 실시간
트래킹 인프라가 없어서 campaign_sends의 채널별 실제 히스토리 비율을 기반으로 항상
시뮬레이션한다(라이브 트래킹이 아니라는 걸 프론트에서 항상 같이 안내한다) - 발송
시도 자체가 실제인 것과는 별개다.

테스트 목록은 Supabase의 ab_tests 테이블에 저장한다 - 로컬 파일(JSON)로 저장하면
Render처럼 파일시스템이 임시적인 배포 환경에서 서버가 재시작될 때마다 기록이
사라지기 때문 (campaign_history/campaign_sends와 겹치지 않게 별도 테이블 사용).
"""

import math
import random
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import data as data_module
import email_sender
import performance
import push_sender

router = APIRouter()

SEGMENT_OPTIONS = ["전체", "신규 탐색자", "충동 구매자", "할인 구매자", "브랜드 충성 고객", "이탈 위험 고객", "휴면 고객"]

CHANNEL_META = {
    "email": {"label": "이메일", "click_trackable": True},
    "kakao": {"label": "카카오톡", "click_trackable": False},
    "sms": {"label": "메시지", "click_trackable": False},
    "webpush": {"label": "웹 푸시", "click_trackable": True},
    "webpopup": {"label": "웹 팝업", "click_trackable": True},
}

SUCCESS_METRICS = {"open": "오픈율", "click": "클릭률", "conversion": "전환율 (구매 완료)"}
METRIC_COUNT_FIELD = {"open": "opens", "click": "clicks", "conversion": "conversions"}


def _load_store() -> list[dict]:
    return data_module._get_client().table("ab_tests").select("*").execute().data


def _insert_test(test: dict) -> None:
    data_module._get_client().table("ab_tests").insert(test).execute()


def _update_test(test_id: str, patch: dict) -> None:
    data_module._get_client().table("ab_tests").update(patch).eq("test_id", test_id).execute()


def _target_size(segment: str) -> int:
    sends = performance._load_campaign_sends()
    if sends.empty:
        return 0
    if segment == "전체":
        return int(sends["user_id"].nunique())
    return int(sends.loc[sends["segment"] == segment, "user_id"].nunique())


def _target_user_ids(segment: str) -> list[str]:
    """실제 발송 대상 user_id 목록. _target_size와 같은 데이터 소스(campaign_sends)를
    써서 화면에 보이는 타겟 규모와 실제 발송 시도 대상 수가 어긋나지 않게 한다."""
    sends = performance._load_campaign_sends()
    if sends.empty:
        return []
    if segment != "전체":
        sends = sends[sends["segment"] == segment]
    return sends["user_id"].unique().tolist()


def _resolve_receivers(user_ids: list[str], channel: str) -> dict[str, str]:
    """user_id -> 실제 수신자(이메일/FCM 토큰) 매핑. users 테이블에 그런 연락처
    컬럼이 원래 없어서 지금은 항상 빈 dict를 돌려주고, 발송 시도는 스킵된다.
    나중에 실제 회원 연락처/알림 동의 토큰이 테이블에 쌓이면 여기 컬럼명만 채우면
    실제로 나가기 시작한다."""
    contact_col = {"email": "email", "webpush": "fcm_token"}.get(channel)
    if contact_col is None or not user_ids:
        return {}
    users = data_module.load_users("athlepa")
    if users.empty or contact_col not in users.columns:
        return {}
    subset = users.loc[users["user_id"].isin(user_ids), ["user_id", contact_col]].dropna()
    return dict(zip(subset["user_id"], subset[contact_col]))


def _dispatch_group(channel: str, user_ids: list[str], title: str, body: str, image: str | None) -> dict | None:
    """email/webpush 그룹에 한해 실제로 email_sender/push_sender를 호출해 발송을
    시도한다. 카카오/문자는 아직 실 연동 전이라 None을 돌려주고 호출부가 시뮬레이션을
    그대로 쓴다."""
    if channel not in ("email", "webpush"):
        return None
    receivers = _resolve_receivers(user_ids, channel)
    sent = failed = 0
    for uid in user_ids:
        receiver = receivers.get(uid)
        if not receiver:
            continue
        try:
            if channel == "email":
                email_sender.send_email(receiver, title, body)
            else:
                push_sender.send_web_push(receiver, title, body, image=image)
            sent += 1
        except Exception:
            failed += 1
    return {
        "attempted": len(user_ids), "sent": sent, "failed": failed,
        "skipped_no_contact": len(user_ids) - sent - failed,
    }


def _apportion(n: int, ratios: list[int]) -> list[int]:
    """정수 n을 ratios(합 100) 비율대로 나눈다. 표본이 적을 때 반올림으로 그룹이
    통째로 0명이 되는 걸 막기 위해 최대잔여법을 쓴다."""
    raw = [n * r / 100 for r in ratios]
    counts = [int(x) for x in raw]
    remainder = n - sum(counts)
    order = sorted(range(len(ratios)), key=lambda i: raw[i] - counts[i], reverse=True)
    for i in order[:remainder]:
        counts[i] += 1
    return counts


def _channel_base_rates(channel: str) -> dict:
    """campaign_sends 실제 히스토리에서 이 채널의 평균 오픈율/클릭률/전환율을
    구한다. 데이터가 없으면 그럴듯한 기본값으로 대체한다."""
    sends = performance._load_campaign_sends()
    defaults = {"open": 0.30, "click": 0.10, "conversion": 0.04}
    if sends.empty:
        return defaults
    ch = sends[(sends["channel"] == channel) & (sends["delivered"] == True)]  # noqa: E712
    if ch.empty:
        return defaults
    n = len(ch)
    return {
        "open": float(ch["opened_at"].notna().sum() / n) if "opened_at" in ch else defaults["open"],
        "click": float(ch["clicked_at"].notna().sum() / n) if "clicked_at" in ch else defaults["click"],
        "conversion": float(ch["converted_order_id"].notna().sum() / n) if "converted_order_id" in ch else defaults["conversion"],
    }


def _binomial(n: int, p: float) -> int:
    p = max(0.0, min(1.0, p))
    return sum(1 for _ in range(n) if random.random() < p)


def _simulate_group_counts(channel: str, users: int, is_control: bool) -> dict:
    if is_control or users <= 0:
        return {"opens": 0, "clicks": 0, "conversions": 0}
    base = _channel_base_rates(channel)
    jitter = random.uniform(0.75, 1.35)
    opens = _binomial(users, base["open"] * jitter)
    clicks = min(opens, _binomial(users, base["click"] * jitter)) if CHANNEL_META[channel]["click_trackable"] else 0
    conversions = _binomial(users, base["conversion"] * jitter)
    return {"opens": opens, "clicks": clicks, "conversions": conversions}


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _two_proportion_test(users_a: int, conv_a: int, users_b: int, conv_b: int):
    """A(기준) 대비 B의 개선율(%), 95% CI(%p), p-value. 표본이 작으면(정규근사
    조건 미충족) 통계 검정 없이 개선율만 돌려준다."""
    if users_a == 0 or users_b == 0:
        return None, None, None
    p_a, p_b = conv_a / users_a, conv_b / users_b
    if min(conv_a, users_a - conv_a, conv_b, users_b - conv_b) < 5:
        uplift = ((p_b - p_a) / p_a * 100) if p_a > 0 else None
        return uplift, None, None

    se_diff = math.sqrt(p_a * (1 - p_a) / users_a + p_b * (1 - p_b) / users_b)
    diff = p_b - p_a
    ci = ((diff - 1.96 * se_diff) * 100, (diff + 1.96 * se_diff) * 100)
    p_pool = (conv_a + conv_b) / (users_a + users_b)
    se_pool = math.sqrt(p_pool * (1 - p_pool) * (1 / users_a + 1 / users_b))
    z = diff / se_pool if se_pool > 0 else 0
    p_value = 2 * (1 - _norm_cdf(abs(z)))
    uplift = (diff / p_a * 100) if p_a > 0 else None
    return uplift, ci, p_value


def _enrich_test(test: dict) -> dict:
    """그룹별 rate/uplift/CI/p-value/유의성을 계산해서 붙인다. 컨트롤 그룹이
    있으면 컨트롤이 기준, 없으면 첫 그룹이 기준."""
    count_field = METRIC_COUNT_FIELD.get(test["success_metric"], "conversions")
    groups = test["groups"]
    control = next((g for g in groups if g["is_control"]), None)
    baseline = control or (groups[0] if groups else None)

    enriched_groups = []
    for g in groups:
        rate = (g[count_field] / g["users"] * 100) if g["users"] else 0.0
        is_baseline = baseline is not None and g["group_id"] == baseline["group_id"]
        if is_baseline:
            uplift, ci, p_value = None, None, None
        else:
            uplift, ci, p_value = _two_proportion_test(
                baseline["users"], baseline[count_field], g["users"], g[count_field]
            )
        enriched_groups.append({
            **g, "rate": round(rate, 1), "is_baseline": is_baseline,
            "uplift": round(uplift, 1) if uplift is not None else None,
            "ci_low": round(ci[0], 1) if ci else None,
            "ci_high": round(ci[1], 1) if ci else None,
            "p_value": round(p_value, 3) if p_value is not None else None,
            "significant": p_value is not None and p_value < 0.05,
        })
    return {**test, "groups": enriched_groups}


class GroupIn(BaseModel):
    label: str
    ratio: int


class CreateTestRequest(BaseModel):
    segment: str
    channel: str
    groups: list[GroupIn]
    include_control: bool = True
    control_ratio: int = 20
    messages: dict[str, dict] = {}
    success_metric: str = "conversion"


class EndTestRequest(BaseModel):
    winner_group_id: str


@router.get("/api/ab-tests/segment-size")
def get_segment_size(segment: str, session: dict = Depends(auth.get_session)):
    return {"size": _target_size(segment)}


@router.get("/api/ab-tests")
def list_ab_tests(session: dict = Depends(auth.get_session)):
    tests = _load_store()
    tests.sort(key=lambda t: t["created_at"], reverse=True)
    enriched = [_enrich_test(t) for t in tests]

    summary = {"running": 0, "done": 0, "significant": 0}
    for t in enriched:
        if t["status"] == "진행중":
            summary["running"] += 1
        elif t["status"] == "완료":
            summary["done"] += 1
        if any(g["significant"] for g in t["groups"]):
            summary["significant"] += 1

    return {"tests": enriched, "summary": summary}


@router.post("/api/ab-tests")
def create_ab_test(req: CreateTestRequest, session: dict = Depends(auth.get_session)):
    if req.channel not in CHANNEL_META:
        raise HTTPException(status_code=400, detail="알 수 없는 채널이에요.")
    if req.segment not in SEGMENT_OPTIONS:
        raise HTTPException(status_code=400, detail="알 수 없는 세그먼트예요.")
    if not req.groups:
        raise HTTPException(status_code=400, detail="그룹을 1개 이상 추가해주세요.")

    total_ratio = sum(g.ratio for g in req.groups) + (req.control_ratio if req.include_control else 0)
    if total_ratio != 100:
        raise HTTPException(status_code=400, detail=f"그룹 비율 합이 100%가 되도록 맞춰주세요. (현재 {total_ratio}%)")

    for g in req.groups:
        msg = req.messages.get(g.label, {})
        if not msg.get("title", "").strip():
            raise HTTPException(status_code=400, detail=f"'{g.label}' 그룹의 메시지 제목을 입력해주세요.")

    target_ids = _target_user_ids(req.segment)
    size = len(target_ids)
    ratios = [g.ratio for g in req.groups] + ([req.control_ratio] if req.include_control else [])
    counts = _apportion(size, ratios)

    # 그룹 순서(변형 그룹들 -> 컨트롤)대로 실제 대상자 id를 나눠 갖는다 - 발송 시도를
    # 실제 대상자에게 하기 위함(오픈/클릭/전환 시뮬레이션은 인원수만 필요해서 무관).
    id_slices = []
    cursor = 0
    for c in counts:
        id_slices.append(target_ids[cursor:cursor + c])
        cursor += c

    group_rows = []
    for i, g in enumerate(req.groups):
        group_id = chr(97 + i)  # a, b, c...
        users = counts[i]
        stats = _simulate_group_counts(req.channel, users, is_control=False)
        msg = req.messages.get(g.label, {})
        title, text, image = msg.get("title", ""), msg.get("text", ""), msg.get("image_data_url")
        dispatch = _dispatch_group(req.channel, id_slices[i], title, text, image)
        group_rows.append({
            "group_id": group_id, "label": g.label, "is_control": False, "ratio": g.ratio,
            "users": users, "title": title, "text": text,
            "image_data_url": image, "dispatch": dispatch, **stats,
        })
    if req.include_control:
        users = counts[-1]
        group_rows.append({
            "group_id": "ctrl", "label": "컨트롤", "is_control": True, "ratio": req.control_ratio,
            "users": users, "title": "", "text": "", "dispatch": None, "opens": 0, "clicks": 0, "conversions": 0,
        })

    test = {
        "test_id": str(uuid.uuid4())[:8],
        "test_name": f"{req.segment} · {CHANNEL_META[req.channel]['label']} 테스트",
        "segment": req.segment, "channel": req.channel, "success_metric": req.success_metric,
        "status": "진행중", "created_at": datetime.now(timezone.utc).isoformat(), "ended_at": None,
        "winner_group_id": None, "groups": group_rows,
    }

    _insert_test(test)
    return _enrich_test(test)


@router.post("/api/ab-tests/{test_id}/end")
def end_ab_test(test_id: str, req: EndTestRequest, session: dict = Depends(auth.get_session)):
    tests = _load_store()
    test = next((t for t in tests if t["test_id"] == test_id), None)
    if test is None:
        raise HTTPException(status_code=404, detail="테스트를 찾을 수 없어요.")
    if not any(g["group_id"] == req.winner_group_id for g in test["groups"]):
        raise HTTPException(status_code=400, detail="유효하지 않은 winner 그룹이에요.")

    ended_at = datetime.now(timezone.utc).isoformat()
    _update_test(test_id, {"status": "완료", "winner_group_id": req.winner_group_id, "ended_at": ended_at})
    test["status"] = "완료"
    test["winner_group_id"] = req.winner_group_id
    test["ended_at"] = ended_at
    return _enrich_test(test)
