"""Notification module tests that need no database.

The CRUD behaviour of the notification center depends on a live Postgres, so
it lives in the integration suite. These cover the pieces that are pure logic:
the recipient-visibility SQL builder and the Web Push VAPID/encryption stack.
"""

import base64
import json
import time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy.dialects import postgresql

from app.modules.notifications import push
from app.modules.notifications.repository import NotificationRepository


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def test_recipient_visibility_builds_jsonb_containment():
    expr = NotificationRepository._visible_to("admin", "00000000-0000-0000-0000-000000000001")
    sql = str(expr.compile(dialect=postgresql.dialect()))
    # Postgres JSONB @> requires a JSON-bind operand, never a VARCHAR cast.
    assert "@>" in sql
    assert "::JSONB" in sql
    assert "::VARCHAR" not in sql
    assert "recipient_roles" in sql
    # Direct recipient OR everyone OR role broadcast must all be present.
    assert sql.count("recipient_user_id IS NULL") >= 2


def test_vapid_jwt_signing():
    private_key = ec.generate_private_key(ec.SECP256R1())
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    public_b64url = _b64url(
        private_key.public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
    )
    keys = push.VapidKeys(public_b64url=public_b64url, private_key=private_key)

    authorization, jwt = push._build_vapid_authorization(
        "mailto:admin@example.com", "https://fcm.googleapis.com", keys
    )
    assert authorization.startswith("vapid t=")
    assert f"k={public_b64url}" in authorization

    header, claims_raw, _sig = jwt.split(".")
    header = json.loads(base64.urlsafe_b64decode(header + "==="))
    claims = json.loads(base64.urlsafe_b64decode(claims_raw + "==="))
    assert header["alg"] == "ES256"
    assert header["kid"] == public_b64url
    assert claims["aud"] == "https://fcm.googleapis.com"
    assert claims["sub"] == "mailto:admin@example.com"
    assert claims["exp"] > time.time()


def test_push_payload_encrypts_aes128gcm():
    receiver_key = ec.generate_private_key(ec.SECP256R1())
    receiver_pub = _b64url(
        receiver_key.public_key().public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )
    )
    body = push.encrypt_payload(receiver_pub, _b64url(b"0123456789abcdef"), b"hello")
    # Header layout: 16-byte salt || rs(4 bytes = 4096) || keyid length (1 byte, 0).
    assert len(body) >= 16 + 4 + 1
    assert int.from_bytes(body[16:20], "big") == 4096
    assert body[20] == 0
    # Ciphertext + 16-byte GCM tag must follow the header.
    assert len(body) == 21 + 5 + 16


def test_public_key_none_when_unconfigured(monkeypatch):
    monkeypatch.setattr(push, "load_vapid_keys", lambda: None)
    assert push.public_key() is None