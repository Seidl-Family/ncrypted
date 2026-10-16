import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getStore, type Meta } from "./store";

export const ID_RE = /^[A-Za-z0-9_-]{22}$/;

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const error = (message: string, status: number) => json({ error: message }, status);

export function publicOrigin(req: NextRequest): string {
  return (process.env.NCRYPTED_PUBLIC_URL ?? req.nextUrl.origin).replace(/\/$/, "");
}

export async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Loads a secret's metadata and checks the creator's bearer receipt token. Returns a Response on failure. */
export async function authorize(req: NextRequest, id: string): Promise<Meta | NextResponse> {
  if (!ID_RE.test(id)) return error("Not found", 404);
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return error("Missing receipt token", 401);
  const meta = await getStore().meta(id);
  if (!meta || !timingSafeEqual(meta.rt, await sha256(token))) return error("Not found", 404);
  return meta;
}

let limiter: Ratelimit | null | undefined;
function getLimiter() {
  if (limiter !== undefined) return limiter;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  limiter = url && token
    ? new Ratelimit({ redis: new Redis({ url, token }), limiter: Ratelimit.slidingWindow(60, "1 m"), prefix: "rl" })
    : null;
  return limiter;
}

/** Per-IP limit for the free endpoints. Returns a 429 Response when exceeded. */
export async function rateLimit(req: NextRequest, bucket: string): Promise<NextResponse | null> {
  const l = getLimiter();
  if (!l) return null;
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = await l.limit(`${bucket}:${ip}`);
  return success ? null : error("Too many requests", 429);
}
