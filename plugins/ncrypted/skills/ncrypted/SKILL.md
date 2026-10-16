---
name: ncrypted
description: Share passwords, API keys, tokens, and other sensitive values safely as one-time, end-to-end encrypted links that self-destruct after a single read. Use whenever a credential or secret must be sent to a person (by link or email) or handed off to another agent, instead of pasting it into chat, tickets, commits, or logs. Also use to open ncrypted links (https://.../s/{id}#{key}) received from others.
---

# ncrypted: one-time secrets

ncrypted turns a sensitive value into a link that can be opened **exactly once**. The value is encrypted on your machine (AES-256-GCM); the key lives only in the link's `#fragment`, so the service only ever stores ciphertext. Creating a secret costs **0.005 USDC** on Base, paid automatically over x402 from the configured wallet. Reading is free.

## When to use it
- A user asks you to send, share or hand over a password, API key, token, recovery code, private key or similar.
- You generated a credential (e.g. a new DB password) that a person or another agent needs.
- Another agent or person gives you an ncrypted link to open.

Do **not** use it for non-sensitive data, or as long-term storage: a secret disappears after one read or at its expiry.

## Tools (MCP server `@ncrypted/mcp`)
| Tool | Use |
|---|---|
| `ncrypted_create` | `secret`, optional `ttl_seconds` (300 to 604800, default 86400), `passphrase`, `emailTo`, `emailNote`. Returns `link`, `id`, `receiptToken`, `expiresAt`. |
| `ncrypted_read` | `link`, optional `passphrase`. Returns the plaintext and destroys the secret. |
| `ncrypted_status` | `id`, `receiptToken`: pending / read / burned / expired. |
| `ncrypted_burn` | `id`, `receiptToken`: destroy an unread secret. |

Without MCP, use the CLI: `printf '%s' "$VALUE" | npx -y ncrypted create --ttl 1h --json` and `npx -y ncrypted read "<link>"`.

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
Requires `NCRYPTED_WALLET_PRIVATE_KEY`: the private key of a **dedicated, low-balance** Base wallet holding USDC (each secret is 0.005 USDC; no ETH needed). The SDK refuses to pay more than 0.01 USDC per request. If it's missing, `ncrypted_create` returns an error explaining this; reading links works without a wallet.
