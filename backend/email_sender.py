"""실제 이메일 발송 (SendGrid). 원본 Streamlit 버전(automation/email_sender.py)의
send_email()을 그대로 옮겼다 - 같은 SendGrid 계정/발신 이메일을 재사용한다."""

import os

import sendgrid
from sendgrid.helpers.mail import Mail


def send_email(to_email: str, subject: str, body: str) -> int:
    html = body.replace("\n", "<br>")
    sg = sendgrid.SendGridAPIClient(api_key=os.environ["SENDGRID_API_KEY"])
    message = Mail(
        from_email=os.environ["FROM_EMAIL"],
        to_emails=to_email,
        subject=subject,
        html_content=html,
    )
    response = sg.send(message)
    return response.status_code
