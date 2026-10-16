// Isomorphic (Node 20+ / browser) zero-knowledge encryption for ncrypted.
// The 256-bit link key never leaves the client; the server only sees ciphertext.

export const VERSION = 1;
export const MAX_PLAINTEXT_BYTES = 64 * 1024;
const PBKDF2_ITERATIONS = 600_000;
const INFO = new TextEncoder().encode("ncrypted v1");

export interface EncryptedPayload {
  v: number;
  ciphertext: string; // base64url
  iv: string; // base64url, 12 bytes
  salt: string; // base64url, 16 bytes
  hasPassphrase: boolean;
}

export function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKey(linkKey: Uint8Array, salt: Uint8Array<ArrayBuffer>, passphrase?: string) {
  let ikm: Uint8Array<ArrayBuffer> = new Uint8Array(linkKey);
  if (passphrase) {
    const pw = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
    const stretched = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, pw, 256),
    );
    ikm = new Uint8Array(linkKey.length + stretched.length);
    ikm.set(linkKey);
    ikm.set(stretched, linkKey.length);
  }
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts plaintext with a fresh random link key. Returns the payload for the server and the key for the URL fragment. */
export async function encrypt(plaintext: string, passphrase?: string): Promise<{ payload: EncryptedPayload; key: string }> {
  const data = new TextEncoder().encode(plaintext);
  if (data.length === 0) throw new Error("Secret is empty");
  if (data.length > MAX_PLAINTEXT_BYTES) throw new Error(`Secret exceeds ${MAX_PLAINTEXT_BYTES} bytes`);
  const linkKey = randomBytes(32);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(linkKey, salt, passphrase);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return {
    payload: { v: VERSION, ciphertext: toB64url(ct), iv: toB64url(iv), salt: toB64url(salt), hasPassphrase: !!passphrase },
    key: toB64url(linkKey),
  };
}

/** Decrypts a payload with the link key (and passphrase if one was set). Throws on a wrong key, passphrase or tampered data. */
export async function decrypt(payload: EncryptedPayload, linkKey: string, passphrase?: string): Promise<string> {
  if (payload.hasPassphrase && !passphrase) throw new Error("This secret requires a passphrase");
  const key = await deriveKey(fromB64url(linkKey), fromB64url(payload.salt), payload.hasPassphrase ? passphrase : undefined);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(payload.iv) }, key, fromB64url(payload.ciphertext));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Decryption failed: wrong key or passphrase, or the data was tampered with");
  }
}

/** Splits a share link into its id and key: https://host/s/{id}#{key} */
export function parseLink(link: string): { origin: string; id: string; key: string } {
  const url = new URL(link);
  const m = url.pathname.match(/^\/s\/([A-Za-z0-9_-]{16,64})\/?$/);
  const key = url.hash.slice(1);
  if (!m || !key) throw new Error("Not a valid ncrypted link (expected https://host/s/{id}#{key})");
  return { origin: url.origin, id: m[1], key };
}
