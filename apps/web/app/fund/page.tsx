import type { Metadata } from "next";
import { connection } from "next/server";
import Copy from "./copy";

export const metadata: Metadata = { title: "Fund an agent wallet · ncrypted", robots: { index: false, follow: false } };

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

async function balance(address: string): Promise<number | null> {
  try {
    const res = await fetch("https://mainnet.base.org", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: USDC, data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}` }, "latest"],
      }),
      cache: "no-store",
    });
    const { result } = (await res.json()) as { result: string };
    return Number(BigInt(result)) / 1e6;
  } catch {
    return null;
  }
}

export default async function Fund({ searchParams }: { searchParams: Promise<{ address?: string; amount?: string }> }) {
  await connection();
  const { address = "", amount: rawAmount } = await searchParams;
  const amount = Math.min(100, Math.max(0.01, Number(rawAmount) || 1));
  if (!ADDRESS_RE.test(address)) {
    return (
      <main>
        <p className="brand"><a href="/">ncrypted</a></p>
        <h1>Fund an agent wallet</h1>
        <p>This link is missing a valid wallet address. Ask your agent for a new funding link.</p>
      </main>
    );
  }
  const usdc = await balance(address);
  const eip681 = `ethereum:${USDC}@8453/transfer?address=${address}&uint256=${Math.round(amount * 1e6)}`;
  return (
    <main>
      <p className="brand"><a href="/">ncrypted</a></p>
      <h1>Fund your agent&apos;s wallet</h1>
      <p>
        Your AI agent uses this wallet to pay for one-time secrets on ncrypted (0.005 USDC each, after 3 free per day).
        Send it a small amount of <b>USDC on Base</b>. {amount} USDC covers {Math.floor(amount / 0.005)} secrets. No ETH is
        needed.
      </p>

      <h2>address</h2>
      <pre>{address}</pre>
      <p><Copy text={address} /></p>

      <h2>send</h2>
      <ul>
        <li>Network: <b>Base</b> (chain id 8453). Sending on another network will lose the funds.</li>
        <li>Token: <b>USDC</b> ({USDC})</li>
        <li>Suggested amount: <b>{amount} USDC</b></li>
        <li>
          From a mobile wallet: <a href={eip681}>open a prefilled transfer</a>
        </li>
        <li>From Coinbase: Send → USDC → paste the address → choose Base.</li>
      </ul>

      <h2>balance</h2>
      <p>{usdc === null ? "Couldn't load the balance right now." : `${usdc} USDC (about ${Math.floor(usdc / 0.005)} secrets). Refresh after sending.`}</p>

      <h2>about this wallet</h2>
      <p>
        The private key was created on your agent&apos;s machine and stays there (in <code>~/.config/ncrypted/wallet.key</code>).
        ncrypted never has it. ncrypted&apos;s software only uses it to pay ncrypted fees, capped at 0.01 USDC each, but
        anything with access to that machine could use the key, so keep the balance small.
      </p>
    </main>
  );
}
