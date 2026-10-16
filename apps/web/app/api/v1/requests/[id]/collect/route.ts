import { NextRequest } from "next/server";
import { ID_RE, json, error, rateLimit, sha256 } from "@/lib/http";
import { getRequest, takeSubmission } from "@/lib/requests";
import { clientName, track } from "@/lib/usage";

/** The requesting agent collects the sealed value (one-time). 202 while still waiting for the human. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "request-collect");
  if (limited) return limited;
  const { id } = await params;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const r = ID_RE.test(id) ? await getRequest(id) : null;
  if (!r) return error("This request has expired, was already collected, or doesn't exist.", 410);
  if (!token || (await sha256(token)) !== r.rt) return error("Not found", 404);
  const sealed = await takeSubmission(id);
  if (!sealed) return json({ status: "pending", expiresAt: r.expiresAt }, 202);
  await track("request_collected", clientName(req));
  return json({ status: "fulfilled", sealed });
}
