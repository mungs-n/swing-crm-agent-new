"""
Supabase 조회 + 캐싱 공용 모듈. main.py(REST 엔드포인트)와 chatbot.py(AI 도구 함수)가
같은 로더를 재사용한다 (두 곳에서 각자 Supabase를 다시 긁어오면 챗봇 답변과 화면
숫자가 미묘하게 어긋날 위험이 있다 - 항상 같은 캐시를 봐야 한다)."""

import os
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
from supabase import create_client

from dataset_mapping import apply_value_map
from utils.persona import derive_personas

CHANNEL_KR = {"SNS": "SNS", "search_ad": "검색광고", "direct": "직접유입", "email": "이메일", "referral": "추천"}
PERSONA_KR = {
    "new_explorer": "신규 탐색자", "impulsive_buyer": "충동 구매자", "discount_hunter": "할인 헌터",
    "brand_loyalist": "브랜드 충성 고객", "churn_risk": "이탈 위험 고객", "dormant": "휴면 고객",
}
AGE_LABELS = ["10대", "20대", "30대", "40대", "50대", "60대 이상"]

_executor = ThreadPoolExecutor(max_workers=8)
_thread_local = threading.local()

PAGE_SIZE = 1000


def _get_client():
    """스레드마다 클라이언트를 하나씩 재사용한다. 여러 스레드가 클라이언트 하나를
    동시에 공유하면 Windows에서 소켓 오류(WinError 10035)가 난다."""
    client = getattr(_thread_local, "client", None)
    if client is None:
        client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        _thread_local.client = client
    return client


def _fetch_all(table: str, dataset_source: str, columns: str = "*") -> pd.DataFrame:
    """Supabase(PostgREST)는 한 번에 최대 1000행만 돌려주므로, 먼저 전체 건수를 세고
    필요한 페이지를 스레드풀로 동시에 가져온다."""
    base = _get_client().table(table).select("*", count="exact").eq("dataset_source", dataset_source)
    total = (base.limit(1).execute().count) or 0
    if total == 0:
        return pd.DataFrame()

    def fetch_page(start: int):
        return (
            _get_client().table(table)
            .select(columns)
            .eq("dataset_source", dataset_source)
            .range(start, start + PAGE_SIZE - 1)
            .execute()
            .data
        )

    starts = list(range(0, total, PAGE_SIZE))
    pages = list(_executor.map(fetch_page, starts))
    rows = [row for page in pages for row in page]
    return pd.DataFrame(rows)


CACHE_TTL_SECONDS = 300
_cache: dict[str, tuple[float, object]] = {}


def _cached(key: str, loader):
    """Streamlit의 @st.cache_data(ttl=...)과 같은 역할 - 매 요청마다 Supabase를 다시
    긁어오면(특히 events는 13만행 이상, 130페이지+라 첫 조회에 몇 초씩 걸림) 탭을
    옮겨다닐 때마다 매번 그 비용을 다시 치르게 된다. 이 데이터는 시뮬레이션용 정적
    데이터라 자주 안 바뀌므로, 5분 동안은 캐시를 재사용한다(프론트엔드 api.js도
    45초짜리 자체 캐시를 따로 둬서, 짧은 간격의 탭 전환은 네트워크 왕복 자체가 없다)."""
    now = datetime.now().timestamp()
    hit = _cache.get(key)
    if hit is not None and now - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]
    value = loader()
    _cache[key] = (now, value)
    return value


def load(dataset_source: str):
    def loader():
        orders = _fetch_all("orders", dataset_source)
        # events는 13만 행 이상이라 컬럼을 전부(*) 가져오면 메모리를 크게 잡아먹는다
        # (Render 무료 플랜 512MB에서 배포 직후 이 fetch 때문에 OOM으로 죽는 걸 확인함).
        # 실제로 쓰는 컬럼은 이 4개뿐이라(raw_data.py의 원본 데이터 보기 포함) 여기서만 선택해서 가져온다.
        events = _fetch_all("events", dataset_source, columns="user_id,session_id,event_type,timestamp")
        if not orders.empty:
            orders["order_date"] = pd.to_datetime(orders["order_date"], format="ISO8601")
        if not events.empty:
            events["timestamp"] = pd.to_datetime(events["timestamp"], format="ISO8601")
            events = apply_value_map(events, dataset_source, "event_type")
        return orders, events

    return _cached(f"load:{dataset_source}", loader)


def load_users(dataset_source: str):
    def loader():
        users = _fetch_all("users", dataset_source)
        if not users.empty and "signup_date" in users.columns:
            users["signup_date"] = pd.to_datetime(users["signup_date"], format="ISO8601")
        users = apply_value_map(users, dataset_source, "gender")

        # 실제 회사 데이터엔 persona_type이 애초에 라벨링돼서 들어올 리 없다 - 이
        # 컬럼이 아예 없거나 전부 비어 있을 때만(=athlepa처럼 이미 라벨이 있는
        # 데이터셋은 안 건드림) 주문/이벤트에서 규칙 기반으로 역산해 채운다.
        if not users.empty and ("persona_type" not in users.columns or users["persona_type"].isna().all()):
            orders, events = load(dataset_source)
            derived = derive_personas(users, orders, events)
            users["persona_type"] = users["user_id"].map(derived)

        return users

    return _cached(f"users:{dataset_source}", loader)


def pct_delta(current, previous):
    if not previous:
        return 0.0
    return (current - previous) / previous * 100
