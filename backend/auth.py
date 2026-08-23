"""
로그인 기반 멀티테넌시. Streamlit 버전은 st.session_state(서버 세션)에 회사 정보를
저장해서 브라우저가 dataset_source를 직접 못 바꾸게 했는데, 여기서도 같은 신뢰 경계를
유지한다 - 로그인 성공 시 발급하는 세션 토큰을 서버 메모리에 매핑해두고, 이후 모든
API 요청은 그 토큰으로만 dataset_source를 알아낸다 (쿼리 파라미터로 dataset_source를
직접 받지 않는다 - 그러면 클라이언트가 남의 회사 데이터를 그냥 요청할 수 있게 된다).

세션은 메모리(SESSIONS)에 캐시하면서 Supabase의 platform_sessions 테이블에도 같이
쓴다 - 메모리만 썼다면 Render가 재배포되거나(무료 플랜은 재배포도 잦고, 15분 넘게
안 쓰이면 프로세스가 잠들었다 새로 뜨기도 한다) 프로세스가 재시작될 때마다 로그인한
모든 사람이 강제로 로그아웃됐다(A/B 테스트/캠페인 이력이 로컬 파일이라 재배포 때마다
사라졌던 것과 같은 원인). 매 요청마다 Supabase를 조회하면 느려지니, 메모리에 있으면
그걸 먼저 쓰고 없을 때만(=이 프로세스가 방금 재시작돼서 아직 모를 때) Supabase에서
찾아와 메모리에 다시 채워넣는다."""

import os
import re
import secrets

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from supabase import create_client

router = APIRouter()

SESSIONS: dict[str, dict] = {}
_SESSION_FIELDS = ["company_id", "company_name", "dataset_source", "currency", "email"]


def _client():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode(), bcrypt.gensalt()).decode()


def verify_password(raw: str, hashed: str) -> bool:
    return bcrypt.checkpw(raw.encode(), hashed.encode())


def _store_session(token: str, session: dict) -> None:
    SESSIONS[token] = session
    _client().table("platform_sessions").insert({"token": token, **session}).execute()


def _drop_session(token: str) -> None:
    SESSIONS.pop(token, None)
    _client().table("platform_sessions").delete().eq("token", token).execute()


def get_session(authorization: str | None = Header(default=None)) -> dict:
    """다른 라우터(main.py, chatbot.py)가 Depends(get_session)으로 재사용하는 인증
    의존성. 'Authorization: Bearer <token>' 헤더를 읽어서 세션을 찾고, 없으면 401.
    메모리에 없으면(이 프로세스가 방금 재시작됐을 수 있음) Supabase에서 한 번 찾아와
    메모리에 다시 채워넣은 뒤 돌려준다."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = authorization.removeprefix("Bearer ").strip()
    session = SESSIONS.get(token)
    if session:
        return session

    res = _client().table("platform_sessions").select("*").eq("token", token).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail="세션이 만료됐습니다. 다시 로그인해주세요.")
    row = res.data[0]
    session = {k: row.get(k) for k in _SESSION_FIELDS}
    SESSIONS[token] = session
    return session


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "company"


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    company_name: str
    email: str
    password: str
    currency: str = "KRW"


class SessionOut(BaseModel):
    token: str
    company_id: str
    company_name: str
    dataset_source: str
    currency: str = "KRW"
    email: str | None = None
    api_key: str | None = None
    webhook_secret: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/api/auth/login", response_model=SessionOut)
def login(req: LoginRequest):
    sb = _client()
    res = sb.table("platform_users").select("*, companies(*)").eq("email", req.email).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    user = res.data[0]
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    company = user["companies"]
    token = secrets.token_urlsafe(32)
    _store_session(token, {
        "company_id": company["company_id"],
        "company_name": company["company_name"],
        "dataset_source": company["dataset_source"],
        "currency": company.get("currency") or "KRW",
        "email": user["email"],
    })
    return SessionOut(token=token, **SESSIONS[token])


@router.post("/api/auth/signup", response_model=SessionOut)
def signup(req: SignupRequest):
    sb = _client()
    existing = sb.table("platform_users").select("email").eq("email", req.email).limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="이미 등록된 이메일입니다.")

    base_slug = _slugify(req.company_name)
    company_id = f"{base_slug}-{secrets.token_hex(3)}"
    api_key = f"{base_slug}_pub_{secrets.token_hex(8)}"
    webhook_secret = f"{base_slug}_wh_{secrets.token_hex(12)}"

    sb.table("companies").insert({
        "company_id": company_id,
        "company_name": req.company_name,
        "dataset_source": company_id,
        "api_key": api_key,
        "webhook_secret": webhook_secret,
        "currency": req.currency,
    }).execute()
    sb.table("platform_users").insert({
        "email": req.email, "password_hash": hash_password(req.password), "company_id": company_id,
    }).execute()

    token = secrets.token_urlsafe(32)
    _store_session(token, {"company_id": company_id, "company_name": req.company_name, "dataset_source": company_id, "currency": req.currency, "email": req.email})
    return SessionOut(token=token, api_key=api_key, webhook_secret=webhook_secret, **SESSIONS[token])


@router.get("/api/auth/me", response_model=SessionOut)
def me(authorization: str | None = Header(default=None)):
    session = get_session(authorization)
    return SessionOut(token=authorization.removeprefix("Bearer ").strip(), **session)


@router.post("/api/auth/change-password")
def change_password(req: ChangePasswordRequest, session: dict = Depends(get_session)):
    if not session.get("email"):
        raise HTTPException(status_code=400, detail="계정 이메일 정보를 찾을 수 없어요. 다시 로그인해주세요.")
    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="새 비밀번호는 4자 이상이어야 해요.")

    sb = _client()
    res = sb.table("platform_users").select("*").eq("email", session["email"]).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없어요.")
    user = res.data[0]
    if not verify_password(req.current_password, user["password_hash"]):
        # 401은 이 API 전역에서 "세션이 유효하지 않음"을 뜻하도록 예약돼 있다
        # (api.js의 post()가 401을 항상 세션 만료로 처리해서 실제 메시지 대신
        # "로그인이 필요합니다"로 덮어써버린다) - 그래서 여기는 400으로 구분한다.
        raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않아요.")

    sb.table("platform_users").update({"password_hash": hash_password(req.new_password)}).eq("email", session["email"]).execute()
    return {"ok": True}


@router.get("/api/settings/keys")
def get_keys(session: dict = Depends(get_session)):
    sb = _client()
    res = sb.table("companies").select("api_key").eq("company_id", session["company_id"]).limit(1).execute()
    return {"api_key": res.data[0]["api_key"] if res.data else None}


@router.post("/api/settings/keys/regenerate")
def regenerate_keys(session: dict = Depends(get_session)):
    """api_key/webhook_secret을 새로 발급한다. webhook_secret은 가입 때와 마찬가지로
    이 응답에서 딱 한 번만 평문으로 보여준다(그 뒤로는 다시 조회할 방법이 없다 -
    보안 원칙: 민감한 시크릿은 저장/재조회가 아니라 재발급으로만 다시 볼 수 있게 한다)."""
    base_slug = _slugify(session["company_name"])
    api_key = f"{base_slug}_pub_{secrets.token_hex(8)}"
    webhook_secret = f"{base_slug}_wh_{secrets.token_hex(12)}"
    sb = _client()
    sb.table("companies").update({"api_key": api_key, "webhook_secret": webhook_secret}).eq("company_id", session["company_id"]).execute()
    return {"api_key": api_key, "webhook_secret": webhook_secret}


@router.post("/api/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        _drop_session(authorization.removeprefix("Bearer ").strip())
    return {"ok": True}
