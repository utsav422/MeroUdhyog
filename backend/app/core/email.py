"""Minimal email sending for auth flows (password reset, verification).

If ``SMTP_HOST`` is configured the message is sent over SMTP; otherwise it is
printed to stdout so developers can copy the reset/verify link straight from
the server logs. No third-party dependency beyond the Python standard library.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger("app.email")

settings = get_settings()


def _console_send(to: str, subject: str, text: str) -> None:
    banner = "=" * 72
    logger.warning(
        "\n%s\n📧  EMAIL (console mailer — SMTP not configured)\n"
        "To:      %s\nSubject: %s\n%s\n%s\n%s",
        banner,
        to,
        subject,
        "-" * 72,
        text,
        banner,
    )


def send_email(to: str, subject: str, text: str) -> None:
    """Send a plain-text email, or log it when SMTP is not configured."""
    if not settings.SMTP_HOST:
        _console_send(to, subject, text)
        return

    message = EmailMessage()
    message["From"] = settings.MAIL_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
        logger.info("Email sent to %s (%s)", to, subject)
    except Exception:  # pragma: no cover - network failures shouldn't break requests
        logger.exception("Failed to send email to %s; falling back to console", to)
        _console_send(to, subject, text)
