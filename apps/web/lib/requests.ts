import { z } from "zod";
import { toB64url, randomBytes } from "ncrypted/crypto";
import { getStore } from "./store";
import { sha256 } from "./http";

export interface RequestRecord {
  publicKey: string;
  label: string;
  rt: string; // sha256(pollToken)
  expiresAt: string;
}

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const CreateRequestBody = z.object({
  publicKey: b64url.length(43), // 32-byte X25519 key
  label: z.string().trim().min(1).max(120),
  ttl: z.number().int().min(300).max(86_400).default(3600),
});

export const SealedBody = z.object({
  v: z.literal(1),
  epk: b64url.length(43),
  iv: b64url.length(16),
  ciphertext: b64url.max(90_000),
});

export const REQUESTS_PER_IP_PER_DAY = 25;

export async function createRequest(publicKey: string, label: string, ttl: number, origin: string) {
  const id = toB64url(randomBytes(16));
  const pollToken = toB64url(randomBytes(24));
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  await getStore().setJson(`q:${id}`, { publicKey, label, rt: await sha256(pollToken), expiresAt } satisfies RequestRecord, ttl);
  return { id, url: `${origin}/r/${id}`, expiresAt, pollToken };
}

export const getRequest = (id: string) => getStore().getJson<RequestRecord>(`q:${id}`);

export function secondsLeft(r: RequestRecord): number {
  return Math.max(1, Math.floor((Date.parse(r.expiresAt) - Date.now()) / 1000));
}

/** Stores the human's sealed submission once. Returns false if the request was already fulfilled. */
export function storeSubmission(id: string, sealed: z.infer<typeof SealedBody>, ttl: number): Promise<boolean> {
  return getStore().setJson(`qs:${id}`, sealed, ttl, true);
}

export const hasSubmission = async (id: string) => (await getStore().getJson(`qs:${id}`)) !== null;

/** Atomically takes the sealed submission (one-time) and retires the request. */
export async function takeSubmission(id: string) {
  const sealed = await getStore().takeJson<z.infer<typeof SealedBody>>(`qs:${id}`);
  if (sealed) await getStore().takeJson(`q:${id}`);
  return sealed;
}
