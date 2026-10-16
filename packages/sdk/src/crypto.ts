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

// ---- Secret requests: a human seals a value to the requesting agent's X25519 public key. ----

const REQUEST_INFO = new TextEncoder().encode("ncrypted request v1");

export interface SealedPayload {
  v: number;
  epk: string; // ephemeral X25519 public key, base64url (32 bytes)
  iv: string; // base64url, 12 bytes
  ciphertext: string; // base64url
}

/** New X25519 keypair for a secret request. publicKey goes in the request link's #fragment; keep privateKey local. */
export async function generateRequestKeypair(): Promise<{ publicKey: string; privateKey: JsonWebKey }> {
  const kp = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { publicKey: toB64url(raw), privateKey: await crypto.subtle.exportKey("jwk", kp.privateKey) };
}

async function requestKey(shared: ArrayBuffer, epk: Uint8Array, pk: Uint8Array) {
  const salt = new Uint8Array(epk.length + pk.length);
  salt.set(epk);
  salt.set(pk, epk.length);
  const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: REQUEST_INFO }, base, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Seals plaintext so only the holder of the request's private key can open it. Used by the request page. */
export async function sealToPublicKey(plaintext: string, publicKey: string): Promise<SealedPayload> {
  const data = new TextEncoder().encode(plaintext);
  if (data.length === 0) throw new Error("Secret is empty");
  if (data.length > MAX_PLAINTEXT_BYTES) throw new Error(`Secret exceeds ${MAX_PLAINTEXT_BYTES} bytes`);
  const pk = fromB64url(publicKey);
  if (pk.length !== 32) throw new Error("Invalid request public key");
  const recipient = await crypto.subtle.importKey("raw", pk, { name: "X25519" }, false, []);
  const eph = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: recipient }, eph.privateKey, 256);
  const key = await requestKey(shared, epk, pk);
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return { v: VERSION, epk: toB64url(epk), iv: toB64url(iv), ciphertext: toB64url(ct) };
}

/** Opens a sealed payload with the request's private key. Throws if it was tampered with or sealed to another key. */
export async function openSealed(sealed: SealedPayload, privateKey: JsonWebKey, publicKey: string): Promise<string> {
  const priv = await crypto.subtle.importKey("jwk", privateKey, { name: "X25519" }, false, ["deriveBits"]);
  const epk = fromB64url(sealed.epk);
  const eph = await crypto.subtle.importKey("raw", epk, { name: "X25519" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: eph }, priv, 256);
  const key = await requestKey(shared, epk, fromB64url(publicKey));
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(sealed.iv) }, key, fromB64url(sealed.ciphertext));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Could not open the submitted secret: it was tampered with or sealed to a different key");
  }
}

/** Splits a request link: https://host/r/{id}#{publicKey} */
export function parseRequestLink(link: string): { origin: string; id: string; publicKey: string } {
  const url = new URL(link);
  const m = url.pathname.match(/^\/r\/([A-Za-z0-9_-]{16,64})\/?$/);
  const publicKey = url.hash.slice(1);
  if (!m || !publicKey) throw new Error("Not a valid ncrypted request link (expected https://host/r/{id}#{publicKey})");
  return { origin: url.origin, id: m[1], publicKey };
}
