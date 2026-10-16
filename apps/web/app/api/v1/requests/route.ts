import { NextRequest } from "next/server";
import { json, error, publicOrigin, rateLimit } from "@/lib/http";
import { CreateRequestBody, createRequest, REQUESTS_PER_IP_PER_DAY } from "@/lib/requests";
import { getStore } from "@/lib/store";
import { clientIp, clientName, track } from "@/lib/usage";

/** Registers a secret request. Free. The private key never leaves the requesting agent. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "request-create");
  if (limited) return limited;
  const parsed = CreateRequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request: expected {publicKey, label, ttl?}", 400);
  const day = new Date().toISOString().slice(0, 10);
  if ((await getStore().incr(`reqs:${clientIp(req)}:${day}`, 2 * 86_400)) > REQUESTS_PER_IP_PER_DAY) {
    return error(`Limit of ${REQUESTS_PER_IP_PER_DAY} secret requests per day reached`, 429);
  }
  const { publicKey, label, ttl } = parsed.data;
  const created = await createRequest(publicKey, label, ttl, publicOrigin(req));
  await track("request_created", clientName(req));
  return json(created, 201);
}
