import type { NextRequest } from "next/server";
import { getStore } from "./store";

export const FREE_PER_DAY = Number(process.env.NCRYPTED_FREE_PER_DAY ?? 3);
const FREE_GLOBAL_PER_DAY = Number(process.env.NCRYPTED_FREE_GLOBAL_PER_DAY ?? 2000);
export const FREE_MAX_TTL = 86_400;
const DAY = 86_400;

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

export function clientIp(req: Pick<NextRequest, "headers">): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Normalized client label from x-ncrypted-client, e.g. "mcp/0.1.3" -> "mcp". Unknown or missing -> "other". */
export function clientName(req: Pick<NextRequest, "headers">, fallback = "other"): string {
  const raw = req.headers.get("x-ncrypted-client")?.toLowerCase() ?? "";
  const name = raw.split("/")[0].replace(/[^a-z0-9-]/g, "").slice(0, 24);
  return name || fallback;
}

/** Free creations left today for this IP (without consuming any). */
export async function freeRemaining(ip: string): Promise<number> {
  const store = getStore();
  const [mine, all] = await Promise.all([store.count(`free:${ip}:${today()}`), store.count(`free:all:${today()}`)]);
  if (all >= FREE_GLOBAL_PER_DAY) return 0;
  return Math.max(0, FREE_PER_DAY - mine);
}

/** Atomically claims one free creation. Returns false when the IP or global quota is used up. */
export async function claimFree(ip: string): Promise<boolean> {
  const store = getStore();
  if ((await store.incr(`free:${ip}:${today()}`, 2 * DAY)) > FREE_PER_DAY) return false;
  return (await store.incr(`free:all:${today()}`, 2 * DAY)) <= FREE_GLOBAL_PER_DAY;
}

export type UsageEvent = "created_paid" | "created_free" | "read" | "burned" | "emailed";

/** Counts an event in today's stats hash (no personal data). Never throws. */
export async function track(event: UsageEvent, client?: string): Promise<void> {
  try {
    const store = getStore();
    const key = `stats:${today()}`;
    await store.hincr(key, event, 90 * DAY);
    if (client) await store.hincr(key, `client:${client}:${event}`, 90 * DAY);
  } catch (e) {
    console.error("[ncrypted] usage tracking failed", e);
  }
}

export async function statsFor(days: number): Promise<Record<string, Record<string, number>>> {
  const store = getStore();
  const out: Record<string, Record<string, number>> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * DAY * 1000).toISOString().slice(0, 10).replace(/-/g, "");
    out[d] = await store.hgetall(`stats:${d}`);
  }
  return out;
}
