import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { ID_RE, json, error, rateLimit } from "@/lib/http";

const GONE = "This secret has already been read, burned, or has expired.";

/** Returns the ciphertext and destroys it in the same atomic step. POST only, so link previews can't burn secrets. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "reveal");
  if (limited) return limited;
  const { id } = await params;
  if (!ID_RE.test(id)) return error(GONE, 410);
  const store = getStore();
  const payload = await store.take(id);
  if (!payload) return error(GONE, 410);
  await store.updateMeta(id, { status: "read", readAt: new Date().toISOString() });
  return json(payload);
}
