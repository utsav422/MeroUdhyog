from app.core.config import get_settings
from app.core.email import send_email
from app.modules.contact.schemas import ContactMessageIn

settings = get_settings()


def _safe_header(value: str) -> str:
    return " ".join(value.split())


def send_contact_message(data: ContactMessageIn) -> None:
    if data.website:
        return

    recipient = settings.CONTACT_EMAIL or "info.meroudhyog@gmail.com"
    subject = _safe_header(f"[Website] {data.topic} — {data.name}")
    lines = [
        "New contact form submission",
        "",
        f"Name: {data.name}",
        f"Business: {data.business or '—'}",
        f"Email: {data.email}",
        f"Phone: {data.phone or '—'}",
        f"Topic: {data.topic}",
        "",
        "Message:",
        data.message,
        "",
        "—",
        "Sent from the meroudhyog.com contact form",
    ]
    send_email(
        to=recipient,
        subject=subject,
        text="\n".join(lines),
        reply_to=str(data.email),
        raise_on_error=True,
    )
