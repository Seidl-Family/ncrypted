"""ncrypted v1 envelope, byte-compatible with the TypeScript reference (packages/sdk/src/crypto.ts).

AES-256-GCM with a key derived by HKDF-SHA256 from a random 32-byte link key (plus PBKDF2-SHA256 of an optional
passphrase). The link key travels only in the share link's #fragment, so the service stores ciphertext only.
"""

from __future__ import annotations

import base64
import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

VERSION = 1
MAX_PLAINTEXT_BYTES = 64 * 1024
PBKDF2_ITERATIONS = 600_000
INFO = b"ncrypted v1"
_LINK_RE = re.compile(r"^/s/([A-Za-z0-9_-]{16,64})/?$")


def to_b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def from_b64url(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _derive_key(link_key: bytes, salt: bytes, passphrase: str | None) -> bytes:
    ikm = link_key
    if passphrase:
        stretched = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=PBKDF2_ITERATIONS).derive(
            passphrase.encode("utf-8")
        )
        ikm = link_key + stretched
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=salt, info=INFO).derive(ikm)


def encrypt(plaintext: str, passphrase: str | None = None) -> tuple[dict, str]:
    """Encrypt with a fresh link key. Returns (payload for the server, base64url link key for the #fragment)."""
    data = plaintext.encode("utf-8")
    if not data:
        raise ValueError("Secret is empty")
    if len(data) > MAX_PLAINTEXT_BYTES:
        raise ValueError(f"Secret exceeds {MAX_PLAINTEXT_BYTES} bytes")
    link_key, salt, iv = os.urandom(32), os.urandom(16), os.urandom(12)
    ct = AESGCM(_derive_key(link_key, salt, passphrase)).encrypt(iv, data, None)
    payload = {
        "v": VERSION,
        "ciphertext": to_b64url(ct),
        "iv": to_b64url(iv),
        "salt": to_b64url(salt),
        "hasPassphrase": bool(passphrase),
    }
    return payload, to_b64url(link_key)


def decrypt(payload: dict, link_key: str, passphrase: str | None = None) -> str:
    """Decrypt a payload. Raises ValueError on a wrong key or passphrase, or tampered data."""
    if payload.get("hasPassphrase") and not passphrase:
        raise ValueError("This secret requires a passphrase")
    key = _derive_key(from_b64url(link_key), from_b64url(payload["salt"]), passphrase if payload.get("hasPassphrase") else None)
    try:
        pt = AESGCM(key).decrypt(from_b64url(payload["iv"]), from_b64url(payload["ciphertext"]), None)
    except InvalidTag:
        raise ValueError("Decryption failed: wrong key or passphrase, or the data was tampered with") from None
    return pt.decode("utf-8")


@dataclass(frozen=True)
class ParsedLink:
    origin: str
    id: str
    key: str


def parse_link(link: str) -> ParsedLink:
    """Split https://host/s/{id}#{key}."""
    u = urlsplit(link)
    m = _LINK_RE.match(u.path)
    if not u.scheme or not u.netloc or not m or not u.fragment:
        raise ValueError("Not a valid ncrypted link (expected https://host/s/{id}#{key})")
    return ParsedLink(origin=f"{u.scheme}://{u.netloc}", id=m.group(1), key=u.fragment)
