---
name: ncrypted
description: Share, receive and install passwords, API keys and tokens without them appearing in chat. Use whenever a credential must be sent to a person or another agent (one-time encrypted link), whenever you need a secret FROM the user (send them a request link instead of asking them to paste it), and whenever a secret must end up in a Vercel env var or .env file (write it there directly without seeing it). Also use to open ncrypted links (https://.../s/{id}#{key}).
---

# ncrypted: one-time secrets

ncrypted turns a sensitive value into a link that can be opened **exactly once**. The value is encrypted on your machine (AES-256-GCM); the key lives only in the link's `#fragment`, so the service only ever stores ciphertext. Creating a secret costs **0.005 USDC** on Base, paid automatically over x402 from the configured wallet. Reading is free.

## When to use it
- A user asks you to send, share or hand over a password, API key, token, recovery code, private key or similar.
- You generated a credential (e.g. a new DB password) that a person or another agent needs.
- **You need a secret from the user** (e.g. "add my Stripe key to Vercel"): use `ncrypted_request`. Never ask them to paste it into chat.
- **A secret must end up in a Vercel env var or a .env file**: use `ncrypted_to_vercel_env` / `ncrypted_to_dotenv` (or a request with that destination) so the value never passes through you.
- Another agent or person gives you an ncrypted link to open.

Do **not** use it for non-sensitive data, or as long-term storage: a secret disappears after one read or at its expiry.

## Tools (MCP server `@seidl-family/ncrypted-mcp`)
| Tool | Use |
|---|---|
| `ncrypted_create` | `secret`, optional `ttl_seconds` (300 to 604800, default 86400), `passphrase`, `emailTo`, `emailNote`. Returns `link`, `id`, `receiptToken`, `expiresAt`. |
| `ncrypted_read` | `link`, optional `passphrase`. Returns the plaintext and destroys the secret. |
| `ncrypted_status` | `id`, `receiptToken`: pending / read / burned / expired. |
| `ncrypted_burn` | `id`, `receiptToken`: destroy an unread secret. |
| `ncrypted_to_vercel_env` | `link`, `key`, optional `project`, `team`, `targets`, `cwd`: writes the value into a Vercel env var (sensitive) without showing it to you. Checks Vercel access first. |
| `ncrypted_to_dotenv` | `link`, `key`, optional `path`: writes `KEY=value` into a .env file (mode 600). |
| `ncrypted_request` | `label` (what you need and why): returns a link for the user to paste the value into. Free. |
| `ncrypted_request_fulfill` | `id`, `destination` (`vercel_env`, `dotenv` or `return`), destination fields, `wait_seconds`: waits for the user, then delivers. Prefer a destination over `return`. |
| `ncrypted_wallet_setup` | Creates the payer wallet if missing and returns `fundUrl` for the user. `backup_to_owner` puts the key in a one-time link for them. |
| `ncrypted_wallet` | Free secrets left today, payer address, USDC balance. |

Without MCP, use the CLI: `printf '%s' "$VALUE" | npx -y ncrypted create --ttl 1h --json` and `npx -y ncrypted read "<link>"`.

## Typical flows
- **"Put my OpenAI key in Vercel production"** → `ncrypted_request` (label: "OpenAI API key for <project>, Vercel production") → give the user the link → `ncrypted_request_fulfill` with `destination: "vercel_env"`, `key: "OPENAI_API_KEY"`, `targets: ["production"]` → tell the user it's set and to redeploy. You never see the key.
- **"Here's a link with the DB password, add it to .env"** → `ncrypted_to_dotenv`.
- **"Send the new admin password to Sam"** → `ncrypted_create`, give the user the link (or `emailTo`).

## Rules
1. **Never echo the secret value** in chat, summaries, commit messages, tickets or logs, before or after creating the link. Refer to it by what it is ("the staging DB password").
2. **The link is as sensitive as the secret.** Send it only to the intended recipient.
3. **Pick the shortest reasonable TTL.** Live handoff: 300 to 3600 seconds. Async to a human: 86400 (default). Maximum 7 days.
4. **Delivery:**
   - *Link*: give the user the link to forward.
   - *Email*: pass `emailTo` (and a short `emailNote` with context, never the secret). The service relays the link once and doesn't store it. For highly sensitive values, also set a `passphrase` and give it to the user to share over a different channel.
   - *Agent handoff*: pass the link (and passphrase, if any) in your message to the other agent. It opens it with `ncrypted_read`.
5. **Reading destroys it.** Only call `ncrypted_read` when you are about to use the value. Use it for the task, do not repeat it back.
6. If a read says the secret was already read or expired, tell the user. If they didn't open it themselves, recommend rotating the credential, since someone else may have.
7. Keep the `receiptToken` if the user may want to confirm delivery (`ncrypted_status`) or revoke the link (`ncrypted_burn`).

## Setup
Creating secrets needs a **dedicated, low-balance** Base wallet holding USDC (0.005 USDC per secret; no ETH needed). The SDK refuses to pay more than 0.01 USDC per request. The key is read from `NCRYPTED_WALLET_PRIVATE_KEY`, else `~/.config/ncrypted/wallet.key`.

- The first 3 secrets per day are free (TTL up to 24h, no email). Requests, reads and deliveries are free.
- Check with `ncrypted_wallet`. If no wallet is configured and more is needed, call `ncrypted_wallet_setup` and give the user `fundUrl`. Never ask the user for a private key, and don't open a `backupLink` yourself.
- Reading links works without any wallet.

## Hosted alternative
For clients that can't run local MCP servers, a hosted endpoint is at `https://ncrypted.ai/mcp` (Streamable HTTP). It needs an MCP client that supports x402 payments, and the server sees the plaintext briefly while encrypting. Prefer the local server for anything sensitive.
