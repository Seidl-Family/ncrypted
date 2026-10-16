import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { authorize, json, rateLimit } from "@/lib/http";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "status");
  if (limited) return limited;
  const { id } = await params;
  const meta = await authorize(req, id);
  if (meta instanceof Response) return meta;
  let status: string = meta.status;
  if (status === "pending" && !(await getStore().exists(id))) status = "expired";
  return json({ status, expiresAt: meta.expiresAt, ...(meta.readAt ? { readAt: meta.readAt } : {}) });
}
