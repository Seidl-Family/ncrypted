import { x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { createFacilitatorConfig } from "@coinbase/x402";
import { Agent, Pool, setGlobalDispatcher } from "undici";
import { getStore } from "./store";

export const NETWORK = (process.env.NCRYPTED_NETWORK ?? "eip155:84532") as `${string}:${string}`;
export const PRICE = process.env.NCRYPTED_PRICE ?? "$0.005";
export const PAY_TO = process.env.NCRYPTED_PAY_TO;

// Coinbase CDP facilitator when keys are present (needed for Base mainnet and Bazaar listing),
// otherwise the free x402.org facilitator, which supports Base Sepolia.
// The library default timeout is 90s; a stalled /supported call on a cold instance then hangs the
// paying agent for 90s before a 502. 20s fails fast (init retries on the next request) while leaving
// room for settle, which waits for the Base transaction.
const FACILITATOR_TIMEOUT_MS = 20_000;

type Supported = Awaited<ReturnType<HTTPFacilitatorClient["getSupported"]>>;
const SUPPORTED_KEY = "x402:supported";
const SUPPORTED_FRESH_MS = 60 * 60 * 1000; // use the shared copy without asking for an hour
const SUPPORTED_KEEP_S = 7 * 86400; // keep a stale copy as a fallback for a week

/**
 * The facilitator's /supported list rarely changes, but every cold instance fetches it before it can
 * build a 402 or verify a payment, and that call often times out or fails. When it does, a paying
 * agent gets a 502 and no secret. Share one copy across instances in Redis: use it while fresh,
 * refresh it after an hour, and fall back to the stale copy when the facilitator can't be reached.
 */
class CachedFacilitatorClient extends HTTPFacilitatorClient {
  override async getSupported(): Promise<Supported> {
    let store: ReturnType<typeof getStore> | undefined;
    try {
      store = getStore();
    } catch {
      store = undefined; // no Redis (local build): go straight to the facilitator
    }
    const cached = store ? await store.getJson<{ at: number; value: Supported }>(SUPPORTED_KEY).catch(() => null) : null;
    if (cached && Date.now() - cached.at < SUPPORTED_FRESH_MS) return cached.value;
    try {
      const value = await super.getSupported();
      await store?.setJson(SUPPORTED_KEY, { at: Date.now(), value }, SUPPORTED_KEEP_S).catch(() => {});
      return value;
    } catch (err) {
      if (cached) {
        console.warn(`Facilitator /supported failed, using copy from ${new Date(cached.at).toISOString()}: ${describeError(err)}`);
        return cached.value;
      }
      throw err;
    }
  }
}

const facilitatorConfig =
  process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET
    ? createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
    : { url: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator" };

/**
 * Open a new connection for every facilitator call instead of reusing a pooled keep-alive socket.
 * Vercel freezes an instance between requests, so a socket opened on one request can sit for an
 * hour before the next facilitator call. By then the network path has usually dropped it, and the
 * reused socket either resets ("fetch failed") or hangs until our timeout. A fresh TLS connection
 * costs ~100ms; a stale one costs the payment. Other hosts (Redis) keep normal pooling.
 */
const FACILITATOR_ORIGIN = new URL(facilitatorConfig.url!).origin;
setGlobalDispatcher(
  new Agent({
    factory: (origin, opts) =>
      new Pool(origin, String(origin) === FACILITATOR_ORIGIN ? { ...opts, pipelining: 0 } : opts),
  }),
);

/** Error text plus the underlying network cause (code and message), which fetch hides behind "fetch failed". */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause as { code?: string; message?: string } | undefined;
  if (!cause) return String(err);
  return `${err} (cause: ${[cause.code, cause.message].filter(Boolean).join(" ")})`;
}

const facilitator = new CachedFacilitatorClient({ ...facilitatorConfig, timeoutMs: FACILITATOR_TIMEOUT_MS });

export const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension)
  // A failed payment otherwise leaves no trace in the logs. Nothing personal is logged.
  .onVerifyFailure(async ({ error }) => {
    console.warn(`x402 verify failed: ${describeError(error)}`);
  })
  .onSettleFailure(async ({ error }) => {
    console.warn(`x402 settle failed: ${describeError(error)}`);
  })
  .onAfterSettle(async ({ result }) => {
    console.log(`x402 settled: success=${result.success} tx=${result.transaction ?? "none"} network=${result.network ?? ""}`);
  });
