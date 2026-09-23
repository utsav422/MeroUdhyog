"""Web Push (RFC 8291 / aes128gcm) delivery for lock-screen notifications.

Self-hosted — no external push service is required. The app signs push
requests with a VAPID key pair (``VAPID_PUBLIC_KEY`` / ``VAPID_PRIVATE_KEY``
in the environment) and encrypts each payload with the browser's subscription
keys, so Chrome/Edge/Firefox/Safari deliver it to the device.

If the VAPID keys are not configured the module degrades to a no-op: in-app
notifications keep working, only the push channel stays off.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import time
import urllib.parse
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.modules.notifications.models import PushSubscription

logger = logging.getLogger("factory.notifications.push")


@dataclass
class VapidKeys:
    public_b64url: str
    private_key: Any  # EllipticCurvePrivateKey


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64url(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def load_vapid_keys() -> VapidKeys | None:
    """Load the VAPID key pair from settings; generate on first run if unset."""
    import cryptography.hazmat.primitives.asymmetric.ec as ec
    from cryptography.hazmat.primitives import serialization

    settings = get_settings()
    priv_raw = settings.VAPID_PRIVATE_KEY.strip()
    pub_raw = settings.VAPID_PUBLIC_KEY.strip()
    if not priv_raw or not pub_raw:
        logger.warning(
            "Web Push is disabled: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in "
            "the environment to enable lock-screen notifications."
        )
        return None
    try:
        pem = _unb64url(priv_raw)
        if b"PRIVATE KEY" not in pem:
            raise ValueError("VAPID_PRIVATE_KEY is not a PEM private key")
        private_key = serialization.load_pem_private_key(pem, password=None)
        if not isinstance(private_key, ec.EllipticCurvePrivateKey):
            raise ValueError("VAPID_PRIVATE_KEY must be an EC (P-256) key")
        return VapidKeys(
            public_b64url=_b64url(private_key.public_key().public_bytes(
                serialization.Encoding.X962,
                serialization.PublicFormat.UncompressedPoint,
            )),
            private_key=private_key,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Invalid VAPID key configuration: %s", exc)
        return None


def make_vapid_private_pem() -> str:
    """Generate a fresh P-256 key and return its PKCS8 PEM (base64url-encoded).

    Exists so a developer/operator can easily produce the two env values:
    ``VAPID_PRIVATE_KEY`` (this) and ``VAPID_PUBLIC_KEY`` (first line = the
    base64url uncompressed public key). Printed by the CLI helper.
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = ec.generate_private_key(ec.SECP256R1())
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    public_b64url = _b64url(private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    ))
    return f"PUBLIC={public_b64url}\nPRIVATE={_b64url(pem)}\n"


def _endpoint_origin(endpoint: str) -> str:
    parsed = urllib.parse.urlparse(endpoint)
    return f"{parsed.scheme}://{parsed.netloc}"


def _build_vapid_authorization(
    subject: str, audience: str, keys: VapidKeys
) -> tuple[str, str]:
    """Return (Authorization header value, VAPID JWT) for a push service origin."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec

    header = {"typ": "JWT", "alg": "ES256", "kid": keys.public_b64url}
    now = int(time.time())
    claims = {"aud": audience, "exp": now + 12 * 3600, "sub": subject}
    signing_input = (
        f"{_b64url(json.dumps(header, separators=(',', ':')).encode())}."
        f"{_b64url(json.dumps(claims, separators=(',', ':')).encode())}"
    ).encode("ascii")
    der_sig = keys.private_key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r, s = _decode_der_signature(der_sig)
    raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    jwt = f'{signing_input.decode("ascii")}.{_b64url(raw_sig)}'
    return f"vapid t={jwt}, k={keys.public_b64url}", jwt


def _decode_der_signature(der: bytes) -> tuple[int, int]:
    # Minimal ASN.1 DER SEQUENCE { INTEGER r, INTEGER s } decoder.
    if der[0] != 0x30:
        raise ValueError("Not a DER signature")
    i = 2  # skip seq header
    vals = []
    for _ in range(2):
        if der[i] != 0x02:
            raise ValueError("Not an INTEGER in signature")
        length = der[i + 1]
        start = i + 2
        integer = der[start : start + length]
        vals.append(int.from_bytes(integer, "big"))
        i = start + length
    return vals[0], vals[1]


def _hkdf(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    from cryptography.hazmat.primitives import hashes

    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)


def encrypt_payload(p256dh: str, auth: str, payload: bytes) -> bytes:
    """Encrypt a payload for a subscription using the aes128gcm scheme.

    Follows RFC 8291 §3.4: the ECDH shared secret is mixed with the
    subscription's ``auth`` secret, a ``WebPush: info`` step embeds both
    public keys (uncompressed, 0x04-prefixed), and the 16-byte salt from the
    message header keys the AES-128-GCM content encryption key + nonce.
    """
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    ua_public_bytes = _unb64url(p256dh)  # 65-byte uncompressed point (0x04 + X + Y)
    ua_public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public_bytes)
    auth_secret = _unb64url(auth)

    server_key = ec.generate_private_key(ec.SECP256R1())
    server_public_raw = server_key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )

    shared_secret = server_key.exchange(ec.ECDH(), ua_public)

    # 1. Mix the subscription's auth secret with the ECDH shared secret.
    prk = _hkdf(shared_secret, auth_secret, b"Content-Encoding: auth\x00", 32)
    # 2. Embed both public keys via the WebPush info label.
    key_info = b"WebPush: info\x00" + ua_public_bytes + server_public_raw
    ikm = _hkdf(prk, None, key_info, 32)
    # 3. Derive CEK + nonce using the per-record salt and P-256 context.
    salt = os.urandom(16)
    context = (
        b"P-256"
        + b"\x00\x41"
        + ua_public_bytes
        + b"\x00\x41"
        + server_public_raw
    )
    key = _hkdf(ikm, salt, b"Content-Encoding: aes128gcm\x00" + context, 16)
    nonce = _hkdf(ikm, salt, b"Content-Encoding: nonce\x00" + context, 12)

    ciphertext = AESGCM(key).encrypt(nonce, payload, None)
    # aes128gcm body: salt(16) || rs(4) || keyid_len(1) || keyid || ciphertext
    return salt + (4096).to_bytes(4, "big") + b"\x00" + ciphertext


async def _send_one(
    subscription: PushSubscription, body: bytes, headers: dict[str, str]
) -> None:
    """Send an encrypted push; raise :class:`httpx.HTTPStatusError` on failure."""
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            subscription.endpoint,
            content=body,
            headers=headers,
            follow_redirects=True,
        )
        if response.status_code in (404, 410):
            raise httpx.HTTPStatusError(
                "Subscription no longer valid",
                request=response.request,
                response=response,
            )
        if response.status_code not in (200, 201, 202, 204):
            logger.warning(
                "Push endpoint returned %s for %s", response.status_code, subscription.endpoint
            )
            response.raise_for_status()


async def push_to_users(
    session: AsyncSession,
    tenant_id: UUID,
    user_ids: list[UUID],
    title: str,
    body: str,
    urgency: str = "normal",
    url: str | None = None,
) -> None:
    """Best-effort push to every active subscription of the given users.

    Never raises: push failures must not break the underlying business
    operation. Stale subscriptions (410/404) are removed from the database.
    """
    keys = load_vapid_keys()
    if keys is None or not user_ids:
        return
    settings = get_settings()
    subject = settings.VAPID_SUBJECT.strip() or "mailto:admin@example.com"

    subs = (
        await session.execute(
            select(PushSubscription).where(
                PushSubscription.tenant_id == tenant_id,
                PushSubscription.user_id.in_(user_ids),
                PushSubscription.is_active.is_(True),
            )
        )
    ).scalars().all()
    payload = json.dumps(
        {"title": title, "body": body[:500], "url": url or "/"}
    ).encode("utf-8")
    for sub in subs:
        try:
            audience = _endpoint_origin(sub.endpoint)
            authorization, _jwt = _build_vapid_authorization(subject, audience, keys)
            headers = {
                "Authorization": authorization,
                "Content-Encoding": "aes128gcm",
                "TTL": "86400",
                "Urgency": urgency,
                "Content-Type": "application/octet-stream",
            }
            body_bytes = encrypt_payload(sub.p256dh, sub.auth, payload)
            await _send_one(sub, body_bytes, headers)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (404, 410):
                await session.execute(
                    delete(PushSubscription).where(PushSubscription.id == sub.id)
                )
                await session.flush()
            else:
                logger.warning("Push failed for %s: %s", sub.id, exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Push failed for %s: %s", sub.id, exc)


def public_key() -> str | None:
    """Base64url (unpadded) raw P-256 public key for ``pushManager.subscribe``."""
    keys = load_vapid_keys()
    return keys.public_b64url if keys else None