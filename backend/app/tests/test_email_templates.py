from app.core.email_templates import (
    password_reset_email,
    staff_id_verification_email,
    verification_email,
)


def test_verification_email_uses_green_branding_and_logo():
    link = "https://app.meroudhyog.com/verify-email?token=abc&next=/dashboard"
    text, html = verification_email(
        full_name="Ramesh & Co",
        link=link,
        expires_hours=48,
    )

    assert "Namaste Ramesh & Co" in text
    assert link in text
    assert "cid:meroudhyog-logo" in html
    assert "Verify my email" in html
    assert "#27675c" in html
    assert "Ramesh &amp; Co" in html
    assert link.replace("&", "&amp;") in html


def test_staff_id_verification_email_includes_staff_and_tenant_details():
    link = "https://app.meroudhyog.com/verify-id?token=abc"
    text, html = staff_id_verification_email(
        full_name="Bishal Thapa",
        email="bishal@example.com",
        role="worker",
        tenant_name="Ramesh & Co",
        link=link,
        expires_hours=48,
    )

    assert "Namaste Bishal Thapa" in text
    assert "Ramesh & Co has added you as worker" in text
    assert "bishal@example.com" in text
    assert link in text
    assert "cid:meroudhyog-logo" in html
    assert "Verify my ID" in html
    assert "Ramesh &amp; Co" in html
    assert link in html


def test_password_reset_email_uses_green_branding_and_logo():
    link = "https://app.meroudhyog.com/reset-password?token=abc"
    text, html = password_reset_email(
        full_name="Sita Sharma",
        link=link,
        expires_minutes=60,
    )

    assert "Namaste Sita Sharma" in text
    assert link in text
    assert "cid:meroudhyog-logo" in html
    assert "Reset my password" in html
    assert "#27675c" in html
    assert link in html
