import { describe, it, expect } from "vitest";
import { encrypt, decrypt, parseLink, fromB64url, toB64url } from "../src/crypto.js";

describe("crypto", () => {
  it("round-trips without passphrase", async () => {
    const { payload, key } = await encrypt("hunter2 🔐");
    expect(payload.hasPassphrase).toBe(false);
    expect(await decrypt(payload, key)).toBe("hunter2 🔐");
  });

  it("round-trips with passphrase and rejects a wrong or missing one", async () => {
    const { payload, key } = await encrypt("db-password", "correct horse");
    expect(await decrypt(payload, key, "correct horse")).toBe("db-password");
    await expect(decrypt(payload, key, "wrong")).rejects.toThrow(/Decryption failed/);
    await expect(decrypt(payload, key)).rejects.toThrow(/passphrase/);
  });

  it("rejects a wrong key", async () => {
    const { payload } = await encrypt("x");
    const other = await encrypt("y");
    await expect(decrypt(payload, other.key)).rejects.toThrow(/Decryption failed/);
  });

  it("rejects tampered ciphertext", async () => {
    const { payload, key } = await encrypt("tamper me");
    const ct = fromB64url(payload.ciphertext);
    ct[0] ^= 1;
    await expect(decrypt({ ...payload, ciphertext: toB64url(ct) }, key)).rejects.toThrow(/Decryption failed/);
  });

  it("rejects empty and oversized secrets", async () => {
    await expect(encrypt("")).rejects.toThrow(/empty/);
    await expect(encrypt("a".repeat(64 * 1024 + 1))).rejects.toThrow(/exceeds/);
  });

  it("parses links", () => {
    expect(parseLink("https://ncrypted.ai/s/abcdefghijklmnopqrstuv#KEY_123")).toEqual({
      origin: "https://ncrypted.ai",
      id: "abcdefghijklmnopqrstuv",
      key: "KEY_123",
    });
    expect(() => parseLink("https://ncrypted.ai/s/abcdefghijklmnopqrstuv")).toThrow();
  });
});
