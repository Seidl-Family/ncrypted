export const REPO = "Seidl-Family/ncrypted";

export function llmsTxt(origin: string) {
  return `# ncrypted

> One-time, end-to-end encrypted secrets for AI agents. An agent encrypts a password, API key or sensitive note locally, pays 0.005 USDC (x402, Base), and gets a link that works exactly once. Share it with a human, email it, or hand it to another agent. Reading is free and destroys the secret.

## Quick start (recommended: encryption happens on your side)
- MCP server: \`npx -y @seidl-family/ncrypted-mcp\`. Tools: ncrypted_create, ncrypted_read, ncrypted_status, ncrypted_burn, ncrypted_wallet.
- CLI: \`echo "s3cret" | npx ncrypted create --ttl 1h\`, \`npx ncrypted read <link>\`
- SDK: \`import { Ncrypted } from "ncrypted"; const { link } = await new Ncrypted().create("s3cret");\`
- Claude Code: \`/plugin marketplace add ${REPO}\` then \`/plugin install ncrypted@ncrypted\`
- Codex: \`codex plugin marketplace add ${REPO}\`; Gemini CLI: \`gemini extensions install https://github.com/${REPO}\`
- Hosted MCP (x402-capable clients; server sees plaintext briefly): ${origin}/mcp
- Wallet: \`npx ncrypted wallet new\` creates ~/.config/ncrypted/wallet.key; fund it with USDC on Base. Check with the ncrypted_wallet tool.

## Rules for agents
- Never paste the secret value into chat, logs or tickets. Share only the link.
- The link contains the decryption key after "#"; treat it like the secret.
- A link opens once. Reading it (ncrypted_read or the web page) destroys it.
- For high-sensitivity email handoffs, set a passphrase and send it through a different channel.

## HTTP API (${origin})
- POST /api/v1/secrets  [x402, $0.005 USDC on Base] body {v:1, ciphertext, iv, salt, hasPassphrase, ttl?} -> {id, url, expiresAt, receiptToken}. Link = url + "#" + base64url(32-byte key).
- POST /api/v1/secrets/{id}/reveal  [free] -> encrypted payload, deleted atomically. 410 if gone.
- GET /api/v1/secrets/{id}/status  [free, Bearer receiptToken] -> {status: pending|read|burned|expired}
- DELETE /api/v1/secrets/{id}  [free, Bearer receiptToken] -> burns it
- POST /api/v1/secrets/{id}/email  [free, Bearer receiptToken, once] body {to, link, note?}

## Crypto
AES-256-GCM. key = HKDF-SHA256(ikm = linkKey [|| PBKDF2-SHA256(passphrase, salt, 600000)], salt, info "ncrypted v1"). 12-byte IV, 16-byte salt, all base64url. Reference implementation: https://github.com/${REPO}/blob/main/packages/sdk/src/crypto.ts

## Links
- OpenAPI: ${origin}/openapi.json
- Source: https://github.com/${REPO}
`;
}
