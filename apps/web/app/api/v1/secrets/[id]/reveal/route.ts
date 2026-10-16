import { NextRequest } from "next/server";
import { takeSecret, GONE } from "@/lib/secrets";
import { ID_RE, json, error, rateLimit } from "@/lib/http";

/** Returns the ciphertext and destroys it in the same atomic step. POST only, so link previews can't burn secrets. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "reveal");
  if (limited) return limited;
  const { id } = await params;
  if (!ID_RE.test(id)) return error(GONE, 410);
  const payload = await takeSecret(id);
  return payload ? json(payload) : error(GONE, 410);
}
