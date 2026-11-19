import re
import uuid

import pytest

from app.core import email as email_module
from app.modules.auth import service as auth_service

PASSWORD = "Sup3rSecret!2026"


async def _register(client, slug: str, email: str):
    return await client.post(
        "/api/v1/auth/register",
        json={
            "tenant_name": slug.title(),
            "tenant_slug": slug,
            "email": email,
            "password": PASSWORD,
            "full_name": "Verification Test",
            "role": "owner",
        },
    )


@pytest.mark.asyncio
async def test_registration_requires_email_verification(client, monkeypatch):
    sent: list[dict[str, str | None]] = []

    def fake_send(
        to: str,
        subject: str,
        text: str,
        html: str | None = None,
        **_: object,
    ) -> None:
        sent.append({"to": to, "subject": subject, "text": text, "html": html})

    monkeypatch.setattr(auth_service, "send_email", fake_send)
    monkeypatch.setattr(auth_service.settings, "REQUIRE_EMAIL_VERIFICATION", True)

    slug = f"ver{uuid.uuid4().hex[:6]}"
    email = f"{slug}@test.com"

    r = await _register(client, slug, email)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["verification_required"] is True
    assert body["email"] == email
    assert body["access_token"] is None
    assert body["refresh_token"] is None

    assert len(sent) == 1
    message = sent[0]
    assert message["to"] == email
    assert "verify" in str(message["subject"]).lower()
    assert "cid:meroudhyog-logo" in str(message["html"])
    assert "Verify my email" in str(message["html"])
    assert "#27675c" in str(message["html"])
    match = re.search(r"token=([^\s]+)", str(message["text"]))
    assert match, message["text"]
    token = match.group(1)

    r = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 401, r.text
    assert "not verified" in r.json()["detail"].lower()

    r = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert r.status_code == 200, r.text

    r = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]


def test_send_email_redirects_to_test_recipient(monkeypatch):
    captured = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            captured["host"] = host
            captured["port"] = port
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            captured["starttls"] = True

        def login(self, user, password):
            captured["login"] = (user, password)

        def send_message(self, message):
            captured["message"] = message

    monkeypatch.setattr(email_module.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(email_module.settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(email_module.settings, "SMTP_PORT", 587)
    monkeypatch.setattr(email_module.settings, "SMTP_USER", "")
    monkeypatch.setattr(email_module.settings, "SMTP_USE_TLS", True)
    monkeypatch.setattr(email_module.settings, "MAIL_FROM", "Mero Udhyog <info@meroudhyog.com>")
    monkeypatch.setattr(email_module.settings, "MAIL_TEST_RECIPIENT", "utsavguragain33@gmail.com")

    email_module.send_email(
        "real-user@example.com",
        "Verify your email",
        "Click the link",
        reply_to="reply-to@example.com",
    )

    message = captured["message"]
    assert message["To"] == "utsavguragain33@gmail.com"
    assert message["Reply-To"] == "reply-to@example.com"
    assert message["X-Original-To"] == "real-user@example.com"
    assert message["From"] == "Mero Udhyog <info@meroudhyog.com>"
    assert captured["starttls"] is True
    assert "real-user@example.com" in message.get_content()


def test_send_email_includes_html_and_brand_logo(monkeypatch):
    captured = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def send_message(self, message):
            captured["message"] = message

    monkeypatch.setattr(email_module.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(email_module.settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(email_module.settings, "SMTP_USER", "")
    monkeypatch.setattr(email_module.settings, "MAIL_TEST_RECIPIENT", "")

    email_module.send_email(
        "user@example.com",
        "Branded email",
        "Plain text fallback",
        html=(
            '<html><body><img src="cid:meroudhyog-logo" alt="Mero Udhyog">'
            "<p>Hello</p></body></html>"
        ),
    )

    message = captured["message"]
    parts = list(message.walk())
    html_part = next(part for part in parts if part.get_content_type() == "text/html")
    assert "cid:meroudhyog-logo" in html_part.get_content()

    logo_parts = [part for part in parts if part.get_content_type() == "image/png"]
    assert logo_parts
    assert logo_parts[0]["Content-ID"] == "<meroudhyog-logo>"
    assert logo_parts[0].get_filename() == "meroudhyog-logo.png"


def test_send_email_can_raise_delivery_failure(monkeypatch):
    class BrokenSMTP:
        def __init__(self, host, port, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def send_message(self, message):
            raise OSError("SMTP unavailable")

    monkeypatch.setattr(email_module.smtplib, "SMTP", BrokenSMTP)
    monkeypatch.setattr(email_module.settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(email_module.settings, "SMTP_USER", "")
    monkeypatch.setattr(email_module.settings, "MAIL_TEST_RECIPIENT", "")

    with pytest.raises(OSError, match="SMTP unavailable"):
        email_module.send_email(
            "real-user@example.com",
            "Contact form",
            "Hello",
            raise_on_error=True,
        )
