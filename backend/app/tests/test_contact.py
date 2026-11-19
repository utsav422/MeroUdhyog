import pytest

from app.modules.contact import service as contact_service


@pytest.mark.asyncio
async def test_contact_message_is_emailed_to_general_inbox(client, monkeypatch):
    sent: dict[str, str] = {}

    def fake_send(
        to: str,
        subject: str,
        text: str,
        reply_to: str | None = None,
        raise_on_error: bool = False,
    ) -> None:
        sent.update(
            {
                "to": to,
                "subject": subject,
                "text": text,
                "reply_to": reply_to or "",
                "raise_on_error": str(raise_on_error),
            }
        )

    monkeypatch.setattr(contact_service, "send_email", fake_send)
    monkeypatch.setattr(
        contact_service.settings,
        "CONTACT_EMAIL",
        "info.meroudhyog@gmail.com",
    )

    response = await client.post(
        "/api/v1/contact",
        json={
            "name": "Ramesh Shrestha",
            "business": "Shrestha Traders",
            "email": "ramesh@example.com",
            "phone": "+977 9800000000",
            "topic": "Plans & pricing",
            "message": "Please share the pricing details.",
            "website": "",
        },
    )

    assert response.status_code == 202, response.text
    assert response.json()["detail"]
    assert sent["to"] == "info.meroudhyog@gmail.com"
    assert sent["reply_to"] == "ramesh@example.com"
    assert sent["raise_on_error"] == "True"
    assert "Plans & pricing" in sent["subject"]
    assert "Ramesh Shrestha" in sent["subject"]
    assert "Shrestha Traders" in sent["text"]
    assert "Please share the pricing details." in sent["text"]


@pytest.mark.asyncio
async def test_contact_honeypot_does_not_send(client, monkeypatch):
    sent = False

    def fake_send(*args, **kwargs) -> None:
        nonlocal sent
        sent = True

    monkeypatch.setattr(contact_service, "send_email", fake_send)

    response = await client.post(
        "/api/v1/contact",
        json={
            "name": "Spam Bot",
            "email": "bot@example.com",
            "topic": "Partnership",
            "message": "Buy cheap backlinks",
            "website": "https://spam.example",
        },
    )

    assert response.status_code == 202, response.text
    assert sent is False


@pytest.mark.asyncio
async def test_contact_returns_503_when_email_delivery_fails(client, monkeypatch):
    def fake_send(*args, **kwargs) -> None:
        raise OSError("SMTP unavailable")

    monkeypatch.setattr(contact_service, "send_email", fake_send)

    response = await client.post(
        "/api/v1/contact",
        json={
            "name": "Ramesh Shrestha",
            "email": "ramesh@example.com",
            "topic": "Support",
            "message": "Help me please.",
        },
    )

    assert response.status_code == 503, response.text
    assert "info.meroudhyog@gmail.com" in response.json()["detail"]


@pytest.mark.asyncio
async def test_contact_rejects_invalid_email(client):
    response = await client.post(
        "/api/v1/contact",
        json={
            "name": "Ramesh Shrestha",
            "email": "not-an-email",
            "topic": "Support",
            "message": "Help me please.",
        },
    )

    assert response.status_code == 422, response.text
