"""실제 웹 푸시 발송 (Firebase Cloud Messaging). 원본 Streamlit 버전
(automation/campaign_builder.py의 send_web_push)을 그대로 옮겼다.

로컬 개발에서는 backend/serviceAccountKey.json 파일을 그대로 쓰고, Render처럼
파일을 커밋할 수 없는 배포 환경에서는 그 JSON을 base64로 인코딩해서
FIREBASE_SERVICE_ACCOUNT_B64 환경변수로 대신 받는다."""

import base64
import json
import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, messaging

ATHLEPA_SITE_URL = os.environ.get("ATHLEPA_SITE_URL", "https://athlepa-demo.netlify.app/")

_KEY_PATH = Path(__file__).parent / "serviceAccountKey.json"


def _ensure_initialized():
    if firebase_admin._apps:
        return
    b64 = os.environ.get("FIREBASE_SERVICE_ACCOUNT_B64")
    if b64:
        info = json.loads(base64.b64decode(b64))
        cred = credentials.Certificate(info)
    elif _KEY_PATH.exists():
        cred = credentials.Certificate(str(_KEY_PATH))
    else:
        raise RuntimeError("Firebase 서비스 계정 키가 없어요 (serviceAccountKey.json 또는 FIREBASE_SERVICE_ACCOUNT_B64).")
    firebase_admin.initialize_app(cred)


def send_web_push(token: str, title: str, body: str, image: str | None = None, link: str | None = None) -> int:
    _ensure_initialized()
    target_link = link or ATHLEPA_SITE_URL
    msg = messaging.Message(
        notification=messaging.Notification(title=title, body=body, image=image),
        webpush=messaging.WebpushConfig(
            fcm_options=messaging.WebpushFCMOptions(link=target_link),
            notification=messaging.WebpushNotification(title=title, body=body, image=image),
        ),
        token=token,
    )
    messaging.send(msg)
    return 200
