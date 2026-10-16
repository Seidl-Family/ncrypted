import { NextRequest } from "next/server";
import { statusOf } from "@/lib/secrets";
import { authorize, json, rateLimit } from "@/lib/http";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "status");
  if (limited) return limited;
  const { id } = await params;
  const meta = await authorize(req, id);
  if (meta instanceof Response) return meta;
  return json(await statusOf(id, meta));
}
