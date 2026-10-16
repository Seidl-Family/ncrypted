"""LangChain tools for ncrypted (pip install 'ncrypted[langchain]', plus 'ncrypted[pay]' to pay beyond the free tier).

    from ncrypted.langchain import ncrypted_tools
    tools = ncrypted_tools()  # pass to create_agent / bind_tools as usual
"""

from __future__ import annotations

import json
from typing import Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from .client import Ncrypted, NcryptedError


class _CreateInput(BaseModel):
    secret: str = Field(description="The sensitive value to share (password, API key, token, note). Max 64 KB.")
    ttl_seconds: int = Field(86400, ge=300, le=604800, description="Expiry if never opened. Default 86400 (24h).")
    passphrase: Optional[str] = Field(None, description="Optional second factor; deliver it through a different channel.")
    email_to: Optional[str] = Field(None, description="Email the link to this address (requires a paid secret).")


class _ReadInput(BaseModel):
    link: str = Field(description="The full ncrypted link including the #key fragment.")
    passphrase: Optional[str] = Field(None, description="Required only if the sender set one.")


class _ReceiptInput(BaseModel):
    id: str = Field(description="The secret id returned by ncrypted_create.")
    receipt_token: str = Field(description="The receipt token returned by ncrypted_create.")


def ncrypted_tools(client: Ncrypted | None = None) -> list[StructuredTool]:
    """ncrypted_create, ncrypted_read, ncrypted_status and ncrypted_burn as LangChain tools (sync and async)."""
    nc = client or Ncrypted(client="langchain")

    async def create(secret: str, ttl_seconds: int = 86400, passphrase: str | None = None, email_to: str | None = None) -> str:
        try:
            r = await nc.create(secret, ttl=ttl_seconds, passphrase=passphrase, email_to=email_to)
        except (NcryptedError, ValueError) as e:
            return f"Error: {e}"
        return json.dumps(
            {
                "link": r.link,
                "id": r.id,
                "expires_at": r.expires_at,
                "receipt_token": r.receipt_token,
                "emailed": r.emailed,
                "free": r.free,
                "note": "The link opens exactly once. Share only the link, never the secret itself.",
            }
        )

    async def read(link: str, passphrase: str | None = None) -> str:
        try:
            return await nc.read(link, passphrase)
        except (NcryptedError, ValueError) as e:
            return f"Error: {e}"

    async def status(id: str, receipt_token: str) -> str:
        try:
            return json.dumps(await nc.status(id, receipt_token))
        except NcryptedError as e:
            return f"Error: {e}"

    async def burn(id: str, receipt_token: str) -> str:
        try:
            await nc.burn(id, receipt_token)
            return json.dumps({"burned": True})
        except NcryptedError as e:
            return f"Error: {e}"

    def tool(name: str, description: str, coro, schema) -> StructuredTool:
        def sync(**kwargs):
            import asyncio

            return asyncio.run(coro(**kwargs))

        return StructuredTool.from_function(func=sync, coroutine=coro, name=name, description=description, args_schema=schema)

    return [
        tool(
            "ncrypted_create",
            "Encrypt a password, API key, token or private note and return a one-time link that self-destructs after a "
            "single read. Use it whenever a credential must be shared with a person or another agent, instead of writing "
            "the value in a message. Never repeat the secret; share only the link. 3 free per day, then 0.005 USDC each.",
            create,
            _CreateInput,
        ),
        tool(
            "ncrypted_read",
            "Open an ncrypted link (https://ncrypted.ai/s/{id}#{key}) and return the secret. This destroys it permanently. "
            "Free. Use the value only for the task at hand and do not repeat it.",
            read,
            _ReadInput,
        ),
        tool("ncrypted_status", "Check whether a secret you created has been opened (pending, read, burned or expired). Free.", status, _ReceiptInput),
        tool("ncrypted_burn", "Destroy a secret you created before anyone opens it. Free.", burn, _ReceiptInput),
    ]
