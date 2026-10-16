import { toB64url, randomBytes, type EncryptedPayload } from "ncrypted/crypto";
import { getStore, type Meta } from "./store";
import { sha256 } from "./http";

export const GONE = "This secret has already been read, burned, or has expired.";

export interface CreatedRecord {
  id: string;
  url: string;
  expiresAt: string;
  receiptToken: string;
}

/** Stores an already-encrypted payload and returns its id, share URL (without key) and receipt token. */
export async function storeSecret(payload: EncryptedPayload, ttl: number, origin: string, free = false): Promise<CreatedRecord> {
  const id = toB64url(randomBytes(16));
  const receiptToken = toB64url(randomBytes(24));
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  await getStore().put(id, payload, { rt: await sha256(receiptToken), status: "pending", expiresAt, ...(free ? { free: true } : {}) }, ttl);
  return { id, url: `${origin}/s/${id}`, expiresAt, receiptToken };
}

/** Atomically fetches and deletes the ciphertext. Returns null if it is gone. */
export async function takeSecret(id: string): Promise<EncryptedPayload | null> {
  const store = getStore();
  const payload = await store.take(id);
  if (payload) await store.updateMeta(id, { status: "read", readAt: new Date().toISOString() });
  return payload;
}

/** Reads the ciphertext without consuming it. */
export const peekSecret = (id: string) => getStore().peek(id);

export async function statusOf(id: string, meta: Meta) {
  let status: string = meta.status;
  if (status === "pending" && !(await getStore().exists(id))) status = "expired";
  return { status, expiresAt: meta.expiresAt, ...(meta.readAt ? { readAt: meta.readAt } : {}) };
}

/** Destroys an unread secret. Returns false if there was nothing left to destroy (already read, burned or expired). */
export async function burnSecret(id: string): Promise<boolean> {
  const store = getStore();
  const dropped = await store.drop(id);
  if (dropped) await store.updateMeta(id, { status: "burned" });
  return dropped;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Returns the secret's metadata if the receipt token matches, otherwise null. */
export async function metaForReceipt(id: string, receiptToken: string): Promise<Meta | null> {
  const meta = await getStore().meta(id);
  if (!meta || !timingSafeEqual(meta.rt, await sha256(receiptToken))) return null;
  return meta;
}
