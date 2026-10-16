import type { Metadata } from "next";
import { REPO } from "@/lib/docs";

export const metadata: Metadata = { title: "Terms of service · ncrypted" };

export default function Terms() {
  return (
    <main>
      <p className="brand"><a href="/">ncrypted</a></p>
      <h1>Terms of service</h1>
      <p>
        Effective October 16, 2026. These terms govern your use of ncrypted (the website, API, hosted MCP endpoint, and the
        ncrypted SDK, CLI, MCP server and plugins), operated by Seidl Family (&quot;we&quot;). By using the service you agree
        to them.
      </p>

      <h2>The service</h2>
      <p>
        ncrypted stores encrypted secrets and returns links that can be opened once. A secret is deleted after its first
        read, when its creator burns it, or when it expires. Deleted secrets can&apos;t be recovered, and we can&apos;t
        recover lost links, keys or passphrases.
      </p>

      <h2>Fees</h2>
      <p>
        Creating a secret costs the price shown in the payment request (currently 0.005 USDC), paid over x402 on Base.
        Payments settle on a public blockchain and are final and non-refundable, except that a request that fails before the
        secret is stored is not charged. Reading, status checks and burning are free. We may change prices for future
        requests; the price in each payment request is the one that applies.
      </p>

      <h2>Your wallet</h2>
      <p>
        You are responsible for the wallet that pays for secrets and for keeping its private key safe. Use a dedicated,
        low-balance wallet. We never ask for your private key. Blockchain networks, stablecoins and payment facilitators are
        operated by third parties, and we aren&apos;t responsible for their outages, fees or failures.
      </p>

      <h2>Acceptable use</h2>
      <p>Don&apos;t use ncrypted to:</p>
      <ul>
        <li>store or share content that is illegal, or that you have no right to share;</li>
        <li>distribute malware or phishing, or send unsolicited email through the email delivery feature;</li>
        <li>attack, overload, probe or circumvent the service, its rate limits or its payment requirements.</li>
      </ul>
      <p>We may block requests or wallets that break these rules.</p>

      <h2>Security and your responsibilities</h2>
      <p>
        Anyone who has a link (and its passphrase, if one was set) can open the secret, so share links only with intended
        recipients. If a recipient finds a link already opened, assume the secret was exposed and rotate it. The hosted MCP
        endpoint processes plaintext on our server; use the local server if that isn&apos;t acceptable.
      </p>

      <h2>No warranty; limitation of liability</h2>
      <p>
        The service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, including
        availability, fitness for a particular purpose or non-infringement. To the fullest extent permitted by law, we
        aren&apos;t liable for indirect, incidental or consequential damages, or for lost data or secrets. Our total
        liability for any claim is limited to the fees you paid us in the 30 days before the claim.
      </p>

      <h2>Open source</h2>
      <p>
        The ncrypted source code is available under the MIT License at{" "}
        <a href={`https://github.com/${REPO}`}>github.com/{REPO}</a>. That license governs the code; these terms govern use
        of our hosted service.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms by posting a new version here; continued use means you accept it. Questions:{" "}
        <a href={`https://github.com/${REPO}/issues`}>github.com/{REPO}/issues</a>.
      </p>
    </main>
  );
}
