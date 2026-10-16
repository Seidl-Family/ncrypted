import { NextRequest } from "next/server";
import { ID_RE, json, error, rateLimit } from "@/lib/http";
import { getRequest, SealedBody, secondsLeft, storeSubmission } from "@/lib/requests";
import { track } from "@/lib/usage";

/** The human's browser uploads the value sealed to the request's public key. Accepted once. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "request-fulfill");
  if (limited) return limited;
  const { id } = await params;
  const r = ID_RE.test(id) ? await getRequest(id) : null;
  if (!r) return error("This request has expired, was already used, or doesn't exist.", 410);
  const parsed = SealedBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid submission", 400);
  if (!(await storeSubmission(id, parsed.data, secondsLeft(r)))) return error("This request was already answered.", 409);
  await track("request_fulfilled", "web");
  return json({ ok: true });
}
