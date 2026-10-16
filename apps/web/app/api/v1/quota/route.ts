import { NextRequest } from "next/server";
import { json, rateLimit } from "@/lib/http";
import { PRICE, NETWORK } from "@/lib/x402";
import { clientIp, freeRemaining, FREE_MAX_TTL, FREE_PER_DAY } from "@/lib/usage";

/** Free-tier allowance left today for the caller, plus the paid price. */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, "quota");
  if (limited) return limited;
  return json({
    freePerDay: FREE_PER_DAY,
    freeRemaining: await freeRemaining(clientIp(req)),
    freeMaxTtl: FREE_MAX_TTL,
    price: PRICE,
    currency: "USDC",
    network: NETWORK,
  });
}
