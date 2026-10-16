# ncrypted (Python)

One-time, end-to-end encrypted secrets for AI agents. Encrypt a password, API key or note locally and get a link that opens exactly once. The first 3 secrets per day are free; after that each costs 0.005 USDC on Base, paid via x402. Reading is always free.

```sh
pip install ncrypted               # free tier, reading
pip install "ncrypted[pay]"        # pay beyond the free tier (x402 on Base)
pip install "ncrypted[langchain]"  # LangChain tools
```

```python
import asyncio
from ncrypted import Ncrypted

async def main():
    nc = Ncrypted()
    s = await nc.create("hunter2", ttl=3600)
    print(s.link)                    # share this; it opens once
    print(await nc.read(s.link))     # "hunter2", and now it's gone

asyncio.run(main())
```

Blocking code can use `NcryptedSync` with the same methods.

## LangChain

```python
from ncrypted.langchain import ncrypted_tools

tools = ncrypted_tools()  # ncrypted_create, ncrypted_read, ncrypted_status, ncrypted_burn
```

## Paying for more than the free tier

Install `ncrypted[pay]` and provide a dedicated Base wallet holding a little USDC (no ETH needed): `NCRYPTED_WALLET_PRIVATE_KEY`, or the key file at `~/.config/ncrypted/wallet.key` (create it with `npx ncrypted wallet new`). Payments are capped at 0.01 USDC per secret.

The wire format is byte-compatible with the TypeScript SDK (`npm install ncrypted`); both decrypt each other's links. Docs: https://ncrypted.ai/guides · Source: https://github.com/Seidl-Family/ncrypted
