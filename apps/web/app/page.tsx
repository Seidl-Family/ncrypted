import { REPO } from "@/lib/docs";
import { PRICE } from "@/lib/x402";

export default function Home() {
  const price = PRICE.replace("$", "");
  return (
    <main>
      <p className="brand">ncrypted</p>
      <h1>One-time secrets for AI agents.</h1>
      <p>
        Your agent encrypts a password, API key or note on its own machine and gets a link that opens exactly once (3 free a
        day, then {price} USDC). Share it with a person, email it, or hand it to another agent. After one read it&apos;s gone for good.
      </p>
      <p>
        <span className="pill">3 free per day</span> <span className="pill">then {price} USDC</span> <span className="pill">reads are free</span>{" "}
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
          <p>The first read deletes it atomically. Unread secrets expire (5 minutes to 7 days).</p>
        </div>
      </div>

      <h2>Secrets your agent never sees</h2>
      <p>
        When your agent needs a key from you, it sends a request link instead of asking you to paste it into chat. You paste
        the value on that page, it&apos;s encrypted in your browser to a key on the agent&apos;s machine, and the agent writes it
        straight into a Vercel env var or a .env file. The value never enters the conversation.
      </p>
      <pre>{`you:    put my Stripe key in Vercel production
agent:  ncrypted_request -> https://ncrypted.ai/r/…#…   (you paste it there)
agent:  ncrypted_request_fulfill -> vercel_env STRIPE_SECRET_KEY [production]
agent:  done. Redeploy to use it.`}</pre>
      <p>Requests and deliveries are free.</p>

      <h2>Install</h2>
      <p>
        Framework guides: <a href="/guides/claude-code">Claude Code</a> · <a href="/guides/vercel">Vercel</a> ·{" "}
        <a href="/guides/ai-sdk">AI SDK</a> · <a href="/guides/openai-agents">OpenAI Agents</a> ·{" "}
        <a href="/guides/mastra">Mastra</a> · <a href="/guides/langchain">LangChain</a> · <a href="/guides/crewai">CrewAI</a>
      </p>
      <p>
        The first 3 secrets per day are free, with no wallet. After that, each costs 0.005 USDC from a dedicated Base
        wallet: <code>npx ncrypted wallet new</code> (or the agent&apos;s <code>ncrypted_wallet_setup</code> tool) creates one at{" "}
        <code>~/.config/ncrypted/wallet.key</code> and gives you a funding link. Reading is always free.
      </p>
      <h3>Claude Code</h3>
      <pre>{`/plugin marketplace add ${REPO}
/plugin install ncrypted@ncrypted`}</pre>
      <h3>Codex</h3>
      <pre>{`codex plugin marketplace add ${REPO}`}</pre>
      <h3>Gemini CLI</h3>
      <pre>{`gemini extensions install https://github.com/${REPO}`}</pre>
      <h3>Any MCP client (local, zero-knowledge)</h3>
      <pre>{`{
  "mcpServers": {
    "ncrypted": {
      "command": "npx",
      "args": ["-y", "@seidl-family/ncrypted-mcp"]
    }
  }
}`}</pre>
      <h3>Hosted MCP</h3>
      <p>
        For clients that can&apos;t run local servers: <code>https://ncrypted.ai/mcp</code> (Streamable HTTP). Your client must
        support x402 payments, and the server sees the plaintext briefly while encrypting it. Prefer the local server for
        anything sensitive.
      </p>
      <h3>Agent Skill</h3>
      <pre>{`npx skills add ${REPO}`}</pre>
      <h3>CLI and SDK</h3>
      <pre>{`echo "hunter2" | npx ncrypted create --ttl 1h --email ops@example.com
npx ncrypted read "https://ncrypted.ai/s/abc#key"

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
        Full details: <a href="/guides">guides</a> · <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">openapi.json</a> ·{" "}
        <a href={`https://github.com/${REPO}`}>source</a> · <a href="/privacy">privacy</a> · <a href="/terms">terms</a>
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
