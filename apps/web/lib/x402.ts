import { x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { createFacilitatorConfig } from "@coinbase/x402";

export const NETWORK = (process.env.NCRYPTED_NETWORK ?? "eip155:84532") as `${string}:${string}`;
export const PRICE = process.env.NCRYPTED_PRICE ?? "$0.005";
export const PAY_TO = process.env.NCRYPTED_PAY_TO;

// Coinbase CDP facilitator when keys are present (needed for Base mainnet and Bazaar listing),
// otherwise the free x402.org facilitator, which supports Base Sepolia.
// The library default timeout is 90s; a stalled /supported call on a cold instance then hangs the
// paying agent for 90s before a 502. 20s fails fast (init retries on the next request) while leaving
// room for settle, which waits for the Base transaction.
const FACILITATOR_TIMEOUT_MS = 20_000;
const facilitator = new HTTPFacilitatorClient({
  ...(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET
    ? createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET)
    : { url: process.env.FACILITATOR_URL ?? "https://x402.org/facilitator" }),
  timeoutMs: FACILITATOR_TIMEOUT_MS,
});

export const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);
