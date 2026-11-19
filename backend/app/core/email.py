"""Minimal transactional email sending.

If ``SMTP_HOST`` is configured the message is sent over SMTP; otherwise it is
printed to stdout so developers can copy reset/verify links straight from the
server logs. No third-party dependency beyond the Python standard library.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger("app.email")

settings = get_settings()

BRAND_LOGO_PATH = (
    Path(__file__).resolve().parent.parent / "static" / "brand" / "logo-lockup-dark.png"
)
BRAND_LOGO_CID = "meroudhyog-logo"


def _console_send(to: str, subject: str, text: str, intended_to: str | None = None) -> None:
    banner = "=" * 72
    recipient = to
    if intended_to and intended_to != to:
        recipient = f"{to} (test redirect; intended for {intended_to})"
    logger.warning(
        "\n%s\n📧  EMAIL (console mailer — SMTP not configured)\n"
        "To:      %s\nSubject: %s\n%s\n%s\n%s",
        banner,
        recipient,
        subject,
        "-" * 72,
        text,
        banner,
    )


def send_email(
    to: str,
    subject: str,
    text: str,
    reply_to: str | None = None,
    raise_on_error: bool = False,
    html: str | None = None,
) -> None:
    """Send a plain-text or HTML email, or log it when SMTP is not configured."""
    intended_to = to
    if settings.MAIL_TEST_RECIPIENT:
        to = settings.MAIL_TEST_RECIPIENT
        text = f"[Test redirect — originally addressed to {intended_to}]\n\n{text}"

    if not settings.SMTP_HOST:
        _console_send(to, subject, text, intended_to)
        return

    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = to
    message["Subject"] = subject
    if reply_to:
        message["Reply-To"] = reply_to
    if intended_to != to:
        message["X-Original-To"] = intended_to
    message.set_content(text)

    if html:
        message.add_alternative(html, subtype="html")
        if BRAND_LOGO_PATH.exists() and f"cid:{BRAND_LOGO_CID}" in html:
            html_part = message.get_payload()[1]
            html_part.add_related(
                BRAND_LOGO_PATH.read_bytes(),
                maintype="image",
                subtype="png",
                cid=f"<{BRAND_LOGO_CID}>",
                filename="meroudhyog-logo.png",
            )

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
        logger.info("Email sent to %s (%s)", to, subject)
    except Exception:  # pragma: no cover - network failures shouldn't break auth flows
        logger.exception("Failed to send email to %s; falling back to console", to)
        _console_send(to, subject, text, intended_to)
        if raise_on_error:
            raise
