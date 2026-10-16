import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { authorize, json, rateLimit } from "@/lib/http";

/** Burns an unread secret. Creator only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "burn");
  if (limited) return limited;
  const { id } = await params;
  const meta = await authorize(req, id);
  if (meta instanceof Response) return meta;
  const store = getStore();
  if (await store.drop(id)) await store.updateMeta(id, { status: "burned" });
  return json({ burned: true });
}
