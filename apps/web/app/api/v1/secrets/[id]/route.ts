import { NextRequest } from "next/server";
import { burnSecret } from "@/lib/secrets";
import { clientName, track } from "@/lib/usage";
import { authorize, json, rateLimit } from "@/lib/http";

/** Burns an unread secret. Creator only. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "burn");
  if (limited) return limited;
  const { id } = await params;
  const meta = await authorize(req, id);
  if (meta instanceof Response) return meta;
  await burnSecret(id);
  await track("burned", clientName(req));
  return json({ burned: true });
}
