"""Live end-to-end check against a running server (not collected by pytest).

NCRYPTED_URL=http://localhost:3403 NCRYPTED_WALLET_PRIVATE_KEY=0x... .venv/bin/python tests/e2e_live.py
"""

import asyncio
import json
import os

from ncrypted import Ncrypted, NcryptedError
from ncrypted.langchain import ncrypted_tools


async def main():
    key = os.environ.pop("NCRYPTED_WALLET_PRIVATE_KEY", None)
    os.environ["NCRYPTED_WALLET_FILE"] = "/nonexistent/wallet.key"

    free = Ncrypted(client="py-e2e")
    q = await free.quota()
    print(f"✓ quota: {q['freeRemaining']}/{q['freePerDay']} free")
    made = 0
    while True:
        try:
            s = await free.create("py free", ttl=300)
        except NcryptedError as e:
            assert e.status == 402 and "wallet" in str(e), e
            print(f"✓ free tier: {made} created without a wallet, then a clear wallet hint")
            break
        assert s.free and await free.read(s.link) == "py free"
        made += 1

    paid = Ncrypted(client="py-e2e", private_key=key)
    s = await paid.create("py paid ✓", ttl=300, passphrase="pw", require_payment=True)
    assert not s.free
    print(f"✓ paid via x402 (tx {s.payment_tx})")
    assert (await paid.status(s.id, s.receipt_token))["status"] == "pending"
    assert await paid.read(s.link, "pw") == "py paid ✓"
    try:
        await paid.read(s.link, "pw")
        raise AssertionError("second read should fail")
    except NcryptedError as e:
        assert e.status == 410
    print("✓ status, one read, second read refused")

    tools = {t.name: t for t in ncrypted_tools(Ncrypted(client="langchain-e2e", private_key=key))}
    out = json.loads(await tools["ncrypted_create"].ainvoke({"secret": "via langchain", "ttl_seconds": 300}))
    assert await tools["ncrypted_read"].ainvoke({"link": out["link"]}) == "via langchain"
    assert (await tools["ncrypted_read"].ainvoke({"link": out["link"]})).startswith("Error:")
    print(f"✓ LangChain tools: {', '.join(tools)}")
    print("\nAll Python checks passed.")


asyncio.run(main())
