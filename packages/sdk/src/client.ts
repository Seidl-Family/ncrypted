import { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { encrypt, decrypt, parseLink, type EncryptedPayload } from "./crypto.js";
import { normalizeKey, readWalletKey, walletPath } from "./wallet.js";

export const DEFAULT_BASE_URL = "https://ncrypted.ai";
/** Hard cap on what the SDK will ever pay for one secret, whatever the server asks. */
export const MAX_PRICE = "$0.01";

export interface NcryptedOptions {
  /** API origin. Defaults to NCRYPTED_URL or the hosted service. */
  baseUrl?: string;
  /**
   * 0x-prefixed EVM private key of a wallet holding USDC on Base. Defaults to NCRYPTED_WALLET_PRIVATE_KEY,
   * then the key file at NCRYPTED_WALLET_FILE or ~/.config/ncrypted/wallet.key (create one with `npx ncrypted wallet new`).
   */
  privateKey?: string;
  /** Bring your own x402-paying fetch instead of a private key. */
  paymentFetch?: typeof fetch;
}

export interface CreateOptions {
  /** Lifetime in seconds, 300 to 604800 (7 days). Default 86400. */
  ttl?: number;
  /** Extra secret the recipient must also know. Share it through a different channel than the link. */
  passphrase?: string;
  /** Email the link to this address. The server sees the link (including key) for that one request. */
  emailTo?: string;
  /** Optional short note shown in the email, e.g. "DB password for staging". Never put the secret here. */
  emailNote?: string;
}

export interface CreatedSecret {
  id: string;
  /** Full share link including the decryption key in the #fragment. Treat it like the secret itself. */
  link: string;
  expiresAt: string;
  /** Lets the creator check status or burn the secret. Not needed by the recipient. */
  receiptToken: string;
  emailed: boolean;
  /** On-chain settlement transaction hash, if reported. */
  paymentTx?: string;
}

export type SecretStatus = "pending" | "read" | "burned" | "expired";

export class NcryptedError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function settlementOf(res: Response): { success: boolean; errorReason?: string; transaction?: string } | undefined {
  const header = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
  if (!header) return undefined;
  try {
    return decodePaymentResponseHeader(header);
  } catch {
    return undefined;
  }
}

async function errorFrom(res: Response): Promise<NcryptedError> {
  let msg = res.statusText;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) msg = body.error;
  } catch {}
  if (res.status === 402) {
    const reason = settlementOf(res)?.errorReason;
    msg = reason
      ? `Payment settlement failed (${reason}). You were not charged.`
      : `Payment required (${msg}). Check the wallet holds USDC on Base.`;
  }
  return new NcryptedError(msg, res.status);
}

/** Settlement attempts per create. A failed settlement never moves funds, so retrying is safe. */
const SETTLE_ATTEMPTS = 3;

export class Ncrypted {
  readonly baseUrl: string;
  private payFetch?: Promise<typeof fetch | undefined>;

  constructor(private readonly opts: NcryptedOptions = {}) {
    const env = typeof process !== "undefined" ? process.env : {};
    this.baseUrl = (opts.baseUrl ?? env.NCRYPTED_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  /** Resolves the paying fetch lazily, so a missing or bad wallet only affects create(), never reads. */
  private payer(): Promise<typeof fetch | undefined> {
    return (this.payFetch ??= (async () => {
      if (this.opts.paymentFetch) return this.opts.paymentFetch;
      const env = typeof process !== "undefined" ? process.env : {};
      const pk = normalizeKey(this.opts.privateKey ?? env.NCRYPTED_WALLET_PRIVATE_KEY) ?? (await readWalletKey());
      if (!pk) return undefined;
      return wrapFetchWithPaymentFromConfig(fetch, {
        schemes: [{ network: "eip155:*", client: new ExactEvmScheme(privateKeyToAccount(pk)) }],
        spendControls: { maxAmountPerPayment: MAX_PRICE },
      });
    })().catch((e) => {
      this.payFetch = undefined;
      throw e;
    }));
  }

  /** Encrypts locally, pays 0.005 USDC via x402, stores the ciphertext and returns a one-time link. */
  async create(secret: string, opts: CreateOptions = {}): Promise<CreatedSecret> {
    const payFetch = await this.payer();
    if (!payFetch) {
      throw new Error(
        `No wallet configured. Run \`npx ncrypted wallet new\` to create one at ${walletPath()} and send it a little USDC on Base, ` +
          "or set NCRYPTED_WALLET_PRIVATE_KEY.",
      );
    }
    const { payload, key } = await encrypt(secret, opts.passphrase);
    const body: Record<string, unknown> = { ...payload, ttl: opts.ttl ?? 86400 };
    // The link is only knowable after the server assigns an id, so email goes in a second, free call.
    let res: Response;
    for (let attempt = 1; ; attempt++) {
      res = await payFetch(`${this.baseUrl}/api/v1/secrets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      // Retry only when the payment was signed but settlement failed on-chain (e.g. a facilitator RPC hiccup).
      if (res.status === 402 && settlementOf(res)?.success === false && attempt < SETTLE_ATTEMPTS) continue;
      break;
    }
    if (!res.ok) throw await errorFrom(res);
    const data = (await res.json()) as { id: string; url: string; expiresAt: string; receiptToken: string };
    const link = `${data.url}#${key}`;
    const paymentTx = settlementOf(res)?.transaction;
    let emailed = false;
    if (opts.emailTo) {
      await this.email(data.id, data.receiptToken, link, opts.emailTo, opts.emailNote);
      emailed = true;
    }
    return { id: data.id, link, expiresAt: data.expiresAt, receiptToken: data.receiptToken, emailed, paymentTx };
  }

  /** Sends the link by email once. Allowed only for the creator and only once per secret. */
  async email(id: string, receiptToken: string, link: string, to: string, note?: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/secrets/${id}/email`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${receiptToken}` },
      body: JSON.stringify({ to, link, note }),
    });
    if (!res.ok) throw await errorFrom(res);
  }

  /** Reads and destroys a secret. Free. Works with links from any ncrypted host. */
  async read(link: string, passphrase?: string): Promise<string> {
    const { origin, id, key } = parseLink(link);
    const res = await fetch(`${origin}/api/v1/secrets/${id}/reveal`, { method: "POST" });
    if (res.status === 410 || res.status === 404) {
      throw new NcryptedError("This secret has already been read, burned, or has expired.", 410);
    }
    if (!res.ok) throw await errorFrom(res);
    const payload = (await res.json()) as EncryptedPayload;
    return decrypt(payload, key, passphrase);
  }

  /** Whether the secret has been read yet. Needs the creator's receipt token. */
  async status(id: string, receiptToken: string): Promise<{ status: SecretStatus; readAt?: string; expiresAt?: string }> {
    const res = await fetch(`${this.baseUrl}/api/v1/secrets/${id}/status`, {
      headers: { authorization: `Bearer ${receiptToken}` },
    });
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as { status: SecretStatus; readAt?: string; expiresAt?: string };
  }

  /** Destroys an unread secret early. Needs the creator's receipt token. */
  async burn(id: string, receiptToken: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/v1/secrets/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${receiptToken}` },
    });
    if (!res.ok) throw await errorFrom(res);
  }
}
