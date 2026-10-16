# ncrypted

One-time, end-to-end encrypted secrets for AI agents.

An agent encrypts a password, API key or note **locally**, pays **0.005 USDC** over [x402](https://x402.org) on Base, and gets a link that opens **exactly once**. Share it with a person, email it, or hand it to another agent. Reading is free and destroys the secret.

```
https://ncrypted.ai/s/{id}#{key}
                                    └─ decryption key, never sent to the server
```

## Install

You need a dedicated, low-balance Base wallet with some USDC (no ETH needed). Export its key as `NCRYPTED_WALLET_PRIVATE_KEY`.

**Claude Code**
```
/plugin marketplace add Seidl-Family/ncrypted
/plugin install ncrypted@ncrypted
```

**Any MCP client** (Claude Desktop, Cursor, Codex, …)
```json
{ "mcpServers": { "ncrypted": { "command": "npx", "args": ["-y", "@seidl-family/ncrypted-mcp"], "env": { "NCRYPTED_WALLET_PRIVATE_KEY": "0x..." } } } }
```

**Agent Skill**: `npx skills add Seidl-Family/ncrypted`

**CLI / SDK**
```sh
echo "hunter2" | npx ncrypted create --ttl 1h [--email ops@example.com] [--passphrase X]
npx ncrypted read "https://ncrypted.ai/s/abc#key"
```
```ts
import { Ncrypted } from "ncrypted";
const nc = new Ncrypted(); // reads NCRYPTED_WALLET_PRIVATE_KEY
const { link, receiptToken, id } = await nc.create("hunter2", { ttl: 3600 });
const value = await nc.read(link); // free, destroys it
```

## How it works

- **Zero-knowledge**: AES-256-GCM with a random 256-bit key, derived via HKDF (plus PBKDF2 if you set a passphrase). The server stores ciphertext only.
- **Exactly once**: reads use Redis `GETDEL`, so concurrent readers can't both get it. Unread secrets expire after their TTL (5 min to 7 days).
- **Preview-safe**: opening the web page doesn't consume the secret; the recipient has to click *Reveal*.
- **Pay per secret**: x402 `exact` scheme, USDC on Base, settled only after the secret is stored. The SDK refuses to pay more than $0.01 per request.
- **Email**: the creator can email the link once. It passes through the server for that request and isn't stored. Use a passphrase for very sensitive values.

## Payments and safety

ncrypted charges a fixed **0.005 USDC per secret created**, paid over [x402](https://x402.org) on Base. Everything else is free: reading, status checks, revoking.

- **Narrow scope:** the only payment the plugin can make is ncrypted's own fee for `ncrypted_create`. It has no tool to send arbitrary amounts, trade, swap, or pay anyone else.
- **Hard cap:** the SDK refuses to pay more than 0.01 USDC for a single request, whatever the server asks.
- **Dedicated wallet:** payments come from a low-balance wallet the user creates on purpose (`npx ncrypted wallet new`) and funds themselves. The plugin never asks for, reads or stores the user's main wallet, and the skill tells the agent never to ask for private keys in chat.
- **Visible and explicit:** every charge is an explicit `ncrypted_create` tool call. There are no background or recurring charges.
- **No charge on failure:** payment settles through Coinbase's x402 facilitator only after the secret is stored.
- **Zero-knowledge by default:** the local MCP server encrypts on the user's machine, so the service stores ciphertext only. The optional hosted endpoint (`https://ncrypted.ai/mcp`) is clearly labeled as server-side encryption.

## Repo layout

| Path | What |
|---|---|
| `apps/web` | Next.js app on Vercel: API, viewer page, llms.txt, openapi.json |
| `packages/sdk` | `ncrypted` on npm: crypto, client, CLI |
| `packages/mcp` | `@seidl-family/ncrypted-mcp` on npm: stdio MCP server |
| `skills/ncrypted` | Agent Skill (`SKILL.md`) |
| `plugins/ncrypted` | Claude Code plugin; `.claude-plugin/marketplace.json` lists it |
| `server.json` | MCP Registry manifest (published by `.github/workflows/mcp-registry.yml`) |

## Development

```sh
npm install
npm test                       # crypto unit tests
cp apps/web/.env.example apps/web/.env.local   # set NCRYPTED_PAY_TO
npm run dev                    # in-memory store when Redis isn't configured
npm run build && npm run e2e   # needs .env.e2e with a funded Base Sepolia wallet
```

After editing `skills/ncrypted/SKILL.md`, run `npm run sync:skill`.

On each MCP release, bump the pinned version in `plugins/ncrypted/.mcp.json`, `plugins/ncrypted/package.json` (then `npm install --package-lock-only` there) and `gemini-extension.json` (the Claude directory rejects `@latest`), then run the "Publish to MCP Registry" workflow.
