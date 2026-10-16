import type { Metadata } from "next";
import { REPO } from "@/lib/docs";

export const metadata: Metadata = { title: "Privacy policy · ncrypted" };

export default function Privacy() {
  return (
    <main>
      <p className="brand"><a href="/">ncrypted</a></p>
      <h1>Privacy policy</h1>
      <p>Effective October 16, 2026. ncrypted is operated by Seidl Family (&quot;we&quot;).</p>

      <h2>The short version</h2>
      <p>
        With the local MCP server, CLI or SDK, secrets are encrypted on your device before they reach us. We store only
        ciphertext we cannot decrypt, delete it the first time it is read or when it expires, and run no analytics or ad
        tracking.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <b>Encrypted secret:</b> ciphertext, initialization vector, salt, and whether a passphrase is required. Deleted
          atomically on first read, when burned, or at expiry (default 24 hours, maximum 7 days).
        </li>
        <li>
          <b>Receipt metadata:</b> a SHA-256 hash of the creator&apos;s receipt token, status (pending, read, burned),
          creation, expiry and read times, and whether the link was emailed. Kept until 7 days after the secret expires.
        </li>
      </ul>
      <p>
        The decryption key travels in the link&apos;s <code>#fragment</code>, which browsers and our SDK never send to our
        servers. We never store keys, passphrases or plaintext.
      </p>

      <h2>When we briefly see more</h2>
      <ul>
        <li>
          <b>Email delivery:</b> if you ask us to email a link, the recipient address, the link (which includes the key) and
          your optional note pass through our server to our email provider, Resend, for that one request. We don&apos;t
          store them; we only record that the secret was emailed. Resend processes the message under its own privacy
          policy.
        </li>
        <li>
          <b>Hosted MCP endpoint</b> (<code>https://ncrypted.ai/mcp</code>): this optional mode encrypts and decrypts on our
          server, so the plaintext is processed in memory for that request. It is never written to storage or logs. Use
          the local server if you don&apos;t want this.
        </li>
      </ul>

      <h2>Payments</h2>
      <p>
        Creating a secret is paid in USDC over x402 on the Base blockchain. Payments are verified and settled by
        Coinbase&apos;s x402 facilitator. Your paying wallet address, the amount and the transaction are recorded publicly
        on the blockchain, which we don&apos;t control. We don&apos;t collect names, card details or accounts.
      </p>

      <h2>Technical data</h2>
      <p>
        Our host, Vercel, keeps standard request logs (such as IP address, time and path) under its own retention policy.
        We use your IP address briefly to rate-limit requests; those counters expire within minutes. We set no cookies and
        run no analytics or advertising.
      </p>

      <h2>Service providers</h2>
      <p>
        Vercel (hosting), Upstash (encrypted secret storage), Resend (email delivery, only when requested) and Coinbase
        (payment settlement). We don&apos;t sell or share data for advertising.
      </p>

      <h2>Children</h2>
      <p>ncrypted is not directed at people under 18.</p>

      <h2>Changes and contact</h2>
      <p>
        We&apos;ll post changes on this page with a new effective date. Questions or requests:{" "}
        <a href={`https://github.com/${REPO}/issues`}>github.com/{REPO}/issues</a>.
      </p>
    </main>
  );
}
