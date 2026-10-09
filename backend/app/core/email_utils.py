"""Tiny SMTP helper — reuses the same SMTP_HOST/SMTP_PORT/SMTP_EMAIL/
SMTP_PASSWORD env vars every other feature uses.

Failing silently is intentional: we never want an email hiccup to break a
core operation (tenant provisioning still succeeds even if the welcome mail
bounces). Callers can inspect the returned dict for status if they care.
"""
import logging
import os
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def send_html(to: str, subject: str, html: str,
              from_name: str = "Sitera",
              attachments: list | None = None) -> dict:
    """Send an HTML email, optionally with binary attachments.

    attachments: list of dicts like {"filename": "po.pdf", "content": <bytes>, "mime": "application/pdf"}
    """
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "465"))
    sender = os.environ.get("SMTP_EMAIL")
    password = os.environ.get("SMTP_PASSWORD")
    if not (host and sender and password and to):
        return {"ok": False, "reason": "smtp_not_configured"}

    if attachments:
        msg = MIMEMultipart()
        msg.attach(MIMEText(html, "html"))
        for att in attachments:
            mime = att.get("mime", "application/octet-stream")
            maintype, _, subtype = mime.partition("/")
            part = MIMEApplication(att["content"], _subtype=subtype or "octet-stream")
            part.add_header("Content-Disposition", "attachment",
                            filename=att.get("filename", "attachment.bin"))
            msg.attach(part)
    else:
        msg = MIMEText(html, "html")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{sender}>"
    msg["To"] = to
    try:
        with smtplib.SMTP_SSL(host, port, timeout=20) as s:
            s.login(sender, password)
            s.sendmail(sender, [to], msg.as_string())
        return {"ok": True}
    except Exception as e:  # noqa: BLE001
        logger.warning("SMTP send failed to %s: %s", to, e)
        return {"ok": False, "reason": str(e)[:200]}
