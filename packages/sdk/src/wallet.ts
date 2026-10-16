// Node-only helpers for the local payer wallet used to pay for secrets.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** NCRYPTED_WALLET_FILE, or ~/.config/ncrypted/wallet.key */
export function walletPath(): string {
  return process.env.NCRYPTED_WALLET_FILE || join(homedir(), ".config", "ncrypted", "wallet.key");
}

/** Normalizes a private key, or returns undefined for empty or unexpanded "${VAR}" placeholders. */
export function normalizeKey(raw: string | undefined): `0x${string}` | undefined {
  const v = raw?.trim();
  if (!v || v.startsWith("${") || v.startsWith("$")) return undefined;
  const hex = v.startsWith("0x") ? v : `0x${v}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error("Wallet private key must be 32 bytes of hex (0x + 64 hex characters)");
  return hex as `0x${string}`;
}

export async function readWalletKey(): Promise<`0x${string}` | undefined> {
  try {
    return normalizeKey(await readFile(walletPath(), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

/** Creates a new wallet key file (mode 0600). Refuses to overwrite an existing one. */
export async function createWallet(): Promise<{ address: string; path: string }> {
  const path = walletPath();
  const key = generatePrivateKey();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${key}\n`, { mode: 0o600, flag: "wx" });
  return { address: privateKeyToAccount(key).address, path };
}

/** USDC balance on Base mainnet, via a public RPC. */
export async function usdcBalance(address: string, rpc = "https://mainnet.base.org"): Promise<number> {
  const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_BASE, data }, "latest"] }),
  });
  const { result } = (await res.json()) as { result: string };
  return Number(BigInt(result)) / 1e6;
}
