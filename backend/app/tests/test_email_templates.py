from app.core.email_templates import password_reset_email, verification_email


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
