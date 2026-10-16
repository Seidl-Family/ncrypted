import { NextRequest } from "next/server";
import { ID_RE, json, error, rateLimit } from "@/lib/http";
import { getRequest, hasSubmission } from "@/lib/requests";

/** Public status for the request page. Never returns the public key (the page takes it from the link). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "request-status");
  if (limited) return limited;
  const { id } = await params;
  const r = ID_RE.test(id) ? await getRequest(id) : null;
  if (!r) return error("This request has expired, was already used, or doesn't exist.", 410);
  return json({ label: r.label, expiresAt: r.expiresAt, status: (await hasSubmission(id)) ? "fulfilled" : "open" });
}
