# ruff: noqa: E501

from __future__ import annotations

from html import escape
from string import Template

_LAYOUT = Template(
    """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>$title</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eef4f0;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      $preheader
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef4f0;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #dbe7e1;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="background-color:#12362a;padding:28px 32px;">
                <img src="cid:meroudhyog-logo" width="220" alt="Mero Udhyog" style="display:block;width:220px;max-width:100%;height:auto;border:0;" />
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 0;">
                <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:#27675c;">
                  $eyebrow
                </p>
                <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:600;line-height:1.2;color:#12362a;">
                  $heading
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#3f5149;">
                <p style="margin:0 0 16px;">Namaste $name,</p>
                <p style="margin:0 0 16px;">$intro</p>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:8px 32px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="border-radius:10px;background-color:#27675c;">
                      <a href="$cta_url" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:10px;">
                        $cta_label
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#6b7a73;">
                <p style="margin:0 0 8px;">$expiry_note</p>
                <p style="margin:0;word-break:break-all;">
                  If the button doesn't work, copy this link into your browser:<br />
                  <a href="$cta_url" style="color:#27675c;">$cta_url</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f8f5;border:1px solid #dbe7e1;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#3f5149;">
                      <strong style="color:#12362a;">Need help?</strong><br />
                      Write to
                      <a href="mailto:info@meroudhyog.com" style="color:#27675c;">info@meroudhyog.com</a>
                      or call
                      <a href="tel:+9779840934837" style="color:#27675c;">+977 9840934837</a>.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#7a8881;">
                <p style="margin:0 0 4px;color:#12362a;font-weight:700;">Mero Udhyog</p>
                <p style="margin:0;">A product of Factoryze Tech</p>
                <p style="margin:0;">Pepsicola, Kathmandu · Branch: Itahari, Sunsari</p>
                <p style="margin:12px 0 0;">This is an automated message — please don't reply directly.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""
)


def _layout(
    *,
    title: str,
    preheader: str,
    eyebrow: str,
    heading: str,
    name: str,
    intro: str,
    cta_label: str,
    cta_url: str,
    expiry_note: str,
) -> str:
    return _LAYOUT.substitute(
        title=escape(title),
        preheader=escape(preheader),
        eyebrow=escape(eyebrow),
        heading=escape(heading),
        name=escape(name),
        intro=escape(intro),
        cta_label=escape(cta_label),
        cta_url=escape(cta_url, quote=True),
        expiry_note=escape(expiry_note),
    )


def verification_email(*, full_name: str, link: str, expires_hours: int) -> tuple[str, str]:
    name = full_name.strip() or "there"
    text = (
        f"Namaste {name},\n\n"
        "Welcome to Mero Udhyog! Please confirm your email address by "
        f"opening the link below:\n\n{link}\n\n"
        f"This link expires in {expires_hours} hours.\n\n"
        "If you didn't create this account you can ignore this email.\n\n"
        "Need help? Write to info@meroudhyog.com or call "
        "+977 9840934837.\n"
        "Factoryze Tech · Pepsicola, Kathmandu · Branch: Itahari, Sunsari"
    )
    html = _layout(
        title="Verify your Mero Udhyog email",
        preheader="Confirm your email address to finish setting up Mero Udhyog.",
        eyebrow="Email verification",
        heading="Confirm your email address",
        name=name,
        intro=(
            "Welcome to Mero Udhyog! Please confirm your email address by "
            "clicking the button below. If you didn't create this account, "
            "you can safely ignore this email."
        ),
        cta_label="Verify my email",
        cta_url=link,
        expiry_note=f"This link expires in {expires_hours} hours.",
    )
    return text, html


def staff_id_verification_email(
    *,
    full_name: str,
    email: str,
    role: str,
    tenant_name: str,
    link: str,
    expires_hours: int,
) -> tuple[str, str]:
    name = full_name.strip() or "there"
    business = tenant_name.strip() or "your workspace"
    text = (
        f"Namaste {name},\n\n"
        f"{business} has added you as {role} with the login email {email}. "
        "Verify your ID to activate your staff account:\n\n"
        f"{link}\n\n"
        f"This link expires in {expires_hours} hours.\n\n"
        "If you were not added by this business, you can ignore this email.\n\n"
        "Need help? Write to info@meroudhyog.com or call "
        "+977 9840934837.\n"
        "Factoryze Tech · Pepsicola, Kathmandu · Branch: Itahari, Sunsari"
    )
    html = _layout(
        title=f"Verify your ID for {business}",
        preheader=f"Verify your ID to finish joining {business} on Mero Udhyog.",
        eyebrow="ID verification",
        heading="Verify your ID",
        name=name,
        intro=(
            f"{business} has added you as {role} with the login email {email}. "
            "Verify your ID to activate your staff account. If you were not "
            "added by this business, you can safely ignore this email."
        ),
        cta_label="Verify my ID",
        cta_url=link,
        expiry_note=f"This link expires in {expires_hours} hours.",
    )
    return text, html


def password_reset_email(*, full_name: str, link: str, expires_minutes: int) -> tuple[str, str]:
    name = full_name.strip() or "there"
    text = (
        f"Namaste {name},\n\n"
        "We received a request to reset your Mero Udhyog password. Open "
        f"the link below to choose a new one:\n\n{link}\n\n"
        f"This link expires in {expires_minutes} minutes. "
        "If you didn't request this, you can safely ignore this email.\n\n"
        "Need help? Write to info@meroudhyog.com or call "
        "+977 9840934837.\n"
        "Factoryze Tech · Pepsicola, Kathmandu · Branch: Itahari, Sunsari"
    )
    html = _layout(
        title="Reset your Mero Udhyog password",
        preheader="Use this secure link to choose a new Mero Udhyog password.",
        eyebrow="Password reset",
        heading="Reset your password",
        name=name,
        intro=(
            "We received a request to reset your Mero Udhyog password. Click "
            "the button below to choose a new one. If you didn't request this, "
            "you can safely ignore this email."
        ),
        cta_label="Reset my password",
        cta_url=link,
        expiry_note=f"This link expires in {expires_minutes} minutes.",
    )
    return text, html
