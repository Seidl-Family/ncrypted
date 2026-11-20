import { x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { createFacilitatorConfig } from "@coinbase/x402";
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
        console.warn(`Facilitator /supported failed, using copy from ${new Date(cached.at).toISOString()}: ${err}`);
        return cached.value;
      }
      throw err;
    }
  }
}

const facilitator = new CachedFacilitatorClient({
  ...(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET
    ? createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
    : { url: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator" }),
  timeoutMs: FACILITATOR_TIMEOUT_MS,
});

export const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);
