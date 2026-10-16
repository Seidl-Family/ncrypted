"""Async client for ncrypted, mirroring the TypeScript SDK (packages/sdk/src/client.ts)."""

from __future__ import annotations

import asyncio
import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from .crypto import decrypt, encrypt, parse_link

__version__ = "0.1.0"
DEFAULT_BASE_URL = "https://ncrypted.ai"
MAX_PRICE = "$0.01"
SETTLE_ATTEMPTS = 3
GONE = "This secret has already been read, burned, or has expired."
NO_WALLET = (
    "Run `npx ncrypted wallet new` (or create ~/.config/ncrypted/wallet.key) for a payer wallet, send it a little "
    "USDC on Base (0.005 per secret, no ETH needed), or set NCRYPTED_WALLET_PRIVATE_KEY. Requires `pip install ncrypted[pay]`."
)


class NcryptedError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


@dataclass
class CreatedSecret:
    id: str
    link: str
    """Full one-time link including the decryption key. Treat it like the secret itself."""
    expires_at: str
    receipt_token: str
    emailed: bool
    free: bool
    free_remaining: int | None = None
    payment_tx: str | None = None


def wallet_path() -> Path:
    return Path(os.environ.get("NCRYPTED_WALLET_FILE") or Path.home() / ".config" / "ncrypted" / "wallet.key")


def _normalize_key(raw: str | None) -> str | None:
    v = (raw or "").strip()
    if not v or v.startswith("$"):
        return None
    hexkey = v if v.startswith("0x") else f"0x{v}"
    if len(hexkey) != 66 or any(c not in "0123456789abcdefABCDEF" for c in hexkey[2:]):
        raise ValueError("Wallet private key must be 32 bytes of hex (0x + 64 hex characters)")
    return hexkey


def _wallet_key(explicit: str | None) -> str | None:
    key = _normalize_key(explicit or os.environ.get("NCRYPTED_WALLET_PRIVATE_KEY"))
    if key:
        return key
    try:
        return _normalize_key(wallet_path().read_text())
    except FileNotFoundError:
        return None


def _settlement(res: httpx.Response) -> dict | None:
    header = res.headers.get("payment-response") or res.headers.get("x-payment-response")
    if not header:
        return None
    try:
        return json.loads(base64.b64decode(header))
    except Exception:
        return None


def _error(res: httpx.Response) -> NcryptedError:
    msg = res.reason_phrase
    try:
        msg = res.json().get("error") or msg
    except Exception:
        pass
    if res.status_code == 402:
        reason = (_settlement(res) or {}).get("errorReason")
        msg = f"Payment settlement failed ({reason}). You were not charged." if reason else f"Payment required ({msg})."
    return NcryptedError(msg, res.status_code)


class Ncrypted:
    """Async ncrypted client. The first 3 secrets per day are free; then 0.005 USDC each via x402 (needs ncrypted[pay])."""

    def __init__(
        self,
        base_url: str | None = None,
        private_key: str | None = None,
        client: str = "python",
        timeout: float = 30.0,
    ):
        self.base_url = (base_url or os.environ.get("NCRYPTED_URL") or DEFAULT_BASE_URL).rstrip("/")
        self._private_key = private_key
        self._headers = {"x-ncrypted-client": f"{client}/{__version__}"}
        self._timeout = timeout

    def _paying_client(self) -> httpx.AsyncClient | None:
        key = _wallet_key(self._private_key)
        if not key:
            return None
        try:
            from eth_account import Account
            from x402 import x402Client
            from x402.http.clients import x402_httpx_transport
            from x402.mechanisms.evm.exact import register_exact_evm_client
            from x402.mechanisms.evm.signers import EthAccountSigner
        except ImportError as e:  # pragma: no cover - depends on extras
            raise NcryptedError(f"Paying for secrets needs the pay extra: pip install 'ncrypted[pay]' ({e})") from e
        x402 = x402Client()
        register_exact_evm_client(x402, EthAccountSigner(Account.from_key(key)))
        x402.set_spend_controls({"max_amount_per_payment": MAX_PRICE})
        return httpx.AsyncClient(transport=x402_httpx_transport(x402), timeout=self._timeout)

    async def create(
        self,
        secret: str,
        ttl: int = 86400,
        passphrase: str | None = None,
        email_to: str | None = None,
        email_note: str | None = None,
        require_payment: bool = False,
    ) -> CreatedSecret:
        """Encrypt locally and store the ciphertext; returns a one-time link."""
        payer = self._paying_client()
        require_payment = require_payment or bool(email_to)
        if payer is None and require_payment:
            raise NcryptedError(("Email delivery needs a paid secret. " if email_to else "") + NO_WALLET, 402)
        payload, key = encrypt(secret, passphrase)
        headers = {**self._headers, "content-type": "application/json"}
        if require_payment:
            headers["x-ncrypted-no-free"] = "1"
        http = payer or httpx.AsyncClient(timeout=self._timeout)
        async with http:
            for attempt in range(1, SETTLE_ATTEMPTS + 1):
                res = await http.post(f"{self.base_url}/api/v1/secrets", headers=headers, json={**payload, "ttl": ttl})
                settled = _settlement(res)
                if res.status_code == 402 and settled and settled.get("success") is False and attempt < SETTLE_ATTEMPTS:
                    continue
                break
        if res.status_code == 402 and payer is None:
            max_ttl = int(res.headers.get("x-ncrypted-free-max-ttl", 86400))
            why = f"Free secrets can last at most {max_ttl // 3600}h." if ttl > max_ttl else "The free secrets for today are used up."
            raise NcryptedError(f"{why} {NO_WALLET}", 402)
        if res.status_code >= 400:
            raise _error(res)
        data = res.json()
        link = f"{data['url']}#{key}"
        emailed = False
        if email_to:
            await self.email(data["id"], data["receiptToken"], link, email_to, email_note)
            emailed = True
        return CreatedSecret(
            id=data["id"],
            link=link,
            expires_at=data["expiresAt"],
            receipt_token=data["receiptToken"],
            emailed=emailed,
            free=bool(data.get("free")),
            free_remaining=data.get("freeRemaining"),
            payment_tx=(_settlement(res) or {}).get("transaction"),
        )

    async def email(self, id: str, receipt_token: str, link: str, to: str, note: str | None = None) -> None:
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            res = await http.post(
                f"{self.base_url}/api/v1/secrets/{id}/email",
                headers={**self._headers, "authorization": f"Bearer {receipt_token}"},
                json={"to": to, "link": link, "note": note},
            )
        if res.status_code >= 400:
            raise _error(res)

    async def read(self, link: str, passphrase: str | None = None) -> str:
        """Read and destroy a secret. Free. Works with links from any ncrypted host."""
        p = parse_link(link)
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            res = await http.post(f"{p.origin}/api/v1/secrets/{p.id}/reveal", headers=self._headers)
        if res.status_code in (404, 410):
            raise NcryptedError(GONE, 410)
        if res.status_code >= 400:
            raise _error(res)
        return decrypt(res.json(), p.key, passphrase)

    async def status(self, id: str, receipt_token: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            res = await http.get(
                f"{self.base_url}/api/v1/secrets/{id}/status",
                headers={**self._headers, "authorization": f"Bearer {receipt_token}"},
            )
        if res.status_code >= 400:
            raise _error(res)
        return res.json()

    async def burn(self, id: str, receipt_token: str) -> None:
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            res = await http.delete(
                f"{self.base_url}/api/v1/secrets/{id}",
                headers={**self._headers, "authorization": f"Bearer {receipt_token}"},
            )
        if res.status_code >= 400:
            raise _error(res)

    async def quota(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            res = await http.get(f"{self.base_url}/api/v1/quota", headers=self._headers)
        if res.status_code >= 400:
            raise _error(res)
        return res.json()


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    raise RuntimeError("Use the async Ncrypted client inside a running event loop")


class NcryptedSync:
    """Blocking wrapper around Ncrypted for scripts and sync frameworks."""

    def __init__(self, *args: Any, **kwargs: Any):
        self._c = Ncrypted(*args, **kwargs)

    def create(self, *args: Any, **kwargs: Any) -> CreatedSecret:
        return _run(self._c.create(*args, **kwargs))

    def read(self, *args: Any, **kwargs: Any) -> str:
        return _run(self._c.read(*args, **kwargs))

    def status(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        return _run(self._c.status(*args, **kwargs))

    def burn(self, *args: Any, **kwargs: Any) -> None:
        return _run(self._c.burn(*args, **kwargs))

    def quota(self) -> dict[str, Any]:
        return _run(self._c.quota())
