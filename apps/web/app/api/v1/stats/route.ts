import { NextRequest } from "next/server";
import { json, error } from "@/lib/http";
import { statsFor } from "@/lib/usage";

/** Daily usage counters (no personal data). Requires Authorization: Bearer $STATS_TOKEN. */
export async function GET(req: NextRequest) {
  const token = process.env.STATS_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || given !== token) return error("Unauthorized", 401);
  const days = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 14) || 14));
  return json(await statsFor(days));
}
