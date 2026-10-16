import { Redis } from "@upstash/redis";
import type { EncryptedPayload } from "ncrypted/crypto";

export type Status = "pending" | "read" | "burned";

export interface Meta {
  rt: string; // sha256(receiptToken), hex
  status: Status;
  expiresAt: string;
  readAt?: string;
  emailed?: boolean;
}

/** Receipts outlive the secret by a week so senders can still check whether it was read. */
const META_GRACE = 7 * 86400;

interface Store {
  put(id: string, payload: EncryptedPayload, meta: Meta, ttl: number): Promise<void>;
  /** Atomically fetches and deletes the ciphertext. Only one caller can ever get it. */
  take(id: string): Promise<EncryptedPayload | null>;
  /** Reads the ciphertext without consuming it. Only for verifying a passphrase before take(). */
  peek(id: string): Promise<EncryptedPayload | null>;
  drop(id: string): Promise<boolean>;
  exists(id: string): Promise<boolean>;
  meta(id: string): Promise<Meta | null>;
  updateMeta(id: string, patch: Partial<Meta>): Promise<void>;
  /** Sets emailed=true; returns false if it was already set. */
  claimEmail(id: string): Promise<boolean>;
}

function redisStore(redis: Redis): Store {
  return {
    async put(id, payload, meta, ttl) {
      await redis
        .multi()
        .set(`s:${id}`, JSON.stringify(payload), { ex: ttl })
        .hset(`m:${id}`, meta as unknown as Record<string, unknown>)
        .expire(`m:${id}`, ttl + META_GRACE)
        .exec();
    },
    async take(id) {
      const v = await redis.getdel<EncryptedPayload | string>(`s:${id}`);
      if (!v) return null;
      return typeof v === "string" ? (JSON.parse(v) as EncryptedPayload) : v;
    },
    async peek(id) {
      const v = await redis.get<EncryptedPayload | string>(`s:${id}`);
      if (!v) return null;
      return typeof v === "string" ? (JSON.parse(v) as EncryptedPayload) : v;
    },
    async drop(id) {
      return (await redis.del(`s:${id}`)) === 1;
    },
    async exists(id) {
      return (await redis.exists(`s:${id}`)) === 1;
    },
    async meta(id) {
      const m = await redis.hgetall<Record<string, unknown>>(`m:${id}`);
      if (!m) return null;
      return { ...m, emailed: m.emailed === true || m.emailed === "true" } as Meta;
    },
    async updateMeta(id, patch) {
      await redis.hset(`m:${id}`, patch as Record<string, unknown>);
    },
    async claimEmail(id) {
      return (await redis.hsetnx(`m:${id}`, "emailedClaim", "1")) === 1;
    },
  };
}

/** Dev-only fallback so the app runs locally before Redis is provisioned. */
function memoryStore(): Store {
  const g = globalThis as unknown as { __ncrypted?: { s: Map<string, [string, number]>; m: Map<string, Meta & { claim?: boolean }> } };
  const db = (g.__ncrypted ??= { s: new Map(), m: new Map() });
  const live = (id: string) => {
    const e = db.s.get(id);
    if (e && e[1] < Date.now()) db.s.delete(id);
    return db.s.get(id);
  };
  return {
    async put(id, payload, meta, ttl) {
      db.s.set(id, [JSON.stringify(payload), Date.now() + ttl * 1000]);
      db.m.set(id, { ...meta });
    },
    async take(id) {
      const e = live(id);
      db.s.delete(id);
      return e ? (JSON.parse(e[0]) as EncryptedPayload) : null;
    },
    async peek(id) {
      const e = live(id);
      return e ? (JSON.parse(e[0]) as EncryptedPayload) : null;
    },
    async drop(id) {
      const had = !!live(id);
      db.s.delete(id);
      return had;
    },
    async exists(id) {
      return !!live(id);
    },
    async meta(id) {
      return db.m.get(id) ?? null;
    },
    async updateMeta(id, patch) {
      const m = db.m.get(id);
      if (m) Object.assign(m, patch);
    },
    async claimEmail(id) {
      const m = db.m.get(id);
      if (!m || m.claim) return false;
      m.claim = true;
      return true;
    },
  };
}

function create(): Store {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return redisStore(new Redis({ url, token }));
  if (process.env.NODE_ENV === "production") throw new Error("Redis is not configured (KV_REST_API_URL / KV_REST_API_TOKEN)");
  console.warn("[ncrypted] No Redis configured, using in-memory store (dev only)");
  return memoryStore();
}

let store: Store | undefined;
export const getStore = () => (store ??= create());

