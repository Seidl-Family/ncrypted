import { REPO } from "@/lib/docs";
import { PRICE } from "@/lib/x402";

export default function Home() {
  const price = PRICE.replace("$", "");
  return (
    <main>
      <p className="brand">ncrypted</p>
      <h1>One-time secrets for AI agents.</h1>
      <p>
        Your agent encrypts a password, API key or note on its own machine, pays {price} USDC, and gets a link that opens exactly
        once. Share it with a person, email it, or hand it to another agent. After one read it&apos;s gone for good.
      </p>
      <p>
        <span className="pill">{price} USDC per secret</span> <span className="pill">reads are free</span>{" "}
        <span className="pill">x402 on Base</span> <span className="pill">end-to-end encrypted</span>
      </p>

      <h2>How it works</h2>
      <div className="grid">
        <div className="card">
          <h3>1. Encrypt locally</h3>
          <p>AES-256-GCM with a random key. Our server only ever sees ciphertext.</p>
        </div>
        <div className="card">
          <h3>2. Pay per secret</h3>
          <p>The agent&apos;s wallet pays {price} USDC over x402. No accounts, no API keys.</p>
        </div>
        <div className="card">
          <h3>3. Share the link</h3>
          <p>The key rides in the link&apos;s <code>#fragment</code>, which browsers never send to servers.</p>
        </div>
        <div className="card">
          <h3>4. Burn after reading</h3>
          <p>The first read deletes it atomically. Unread secrets expire (1 hour to 7 days).</p>
        </div>
      </div>

      <h2>Install</h2>
      <p>Every option needs a Base wallet holding a little USDC. Set its private key as <code>NCRYPTED_WALLET_PRIVATE_KEY</code>. Use a dedicated low-balance wallet.</p>
      <h3>Claude Code plugin</h3>
      <pre>{`/plugin marketplace add ${REPO}
/plugin install ncrypted@ncrypted`}</pre>
      <h3>Any MCP client</h3>
      <pre>{`{
  "mcpServers": {
    "ncrypted": {
      "command": "npx",
      "args": ["-y", "@seidl-family/ncrypted-mcp"],
      "env": { "NCRYPTED_WALLET_PRIVATE_KEY": "0x..." }
    }
  }
}`}</pre>
      <h3>Agent Skill</h3>
      <pre>{`npx skills add ${REPO}`}</pre>
      <h3>CLI and SDK</h3>
      <pre>{`echo "hunter2" | npx ncrypted create --ttl 1h --email ops@example.com
npx ncrypted read "https://…/s/abc#key"

import { Ncrypted } from "ncrypted";
const { link } = await new Ncrypted().create("hunter2", { ttl: 3600 });`}</pre>

      <h2>API</h2>
      <table>
        <tbody>
          <tr><td><code>POST /api/v1/secrets</code></td><td>{price} USDC (x402). Store ciphertext, get id and receipt token.</td></tr>
          <tr><td><code>POST /api/v1/secrets/:id/reveal</code></td><td>Free. Returns ciphertext and deletes it.</td></tr>
          <tr><td><code>GET /api/v1/secrets/:id/status</code></td><td>Free, creator only. pending, read, burned or expired.</td></tr>
          <tr><td><code>DELETE /api/v1/secrets/:id</code></td><td>Free, creator only. Burn before it&apos;s read.</td></tr>
          <tr><td><code>POST /api/v1/secrets/:id/email</code></td><td>Free, creator only, once. Email the link.</td></tr>
        </tbody>
      </table>
      <p>
        Full details: <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">openapi.json</a> ·{" "}
        <a href={`https://github.com/${REPO}`}>source</a>
      </p>

      <h2>Security notes</h2>
      <p>
        Emailing a link means it passes through our server once on its way to the email provider. We never store it, but for
        very sensitive values add a passphrase and send that through another channel. Links are single-use, so if a recipient
        finds theirs already opened, assume it was intercepted and rotate the credential.
      </p>
    </main>
  );
}
