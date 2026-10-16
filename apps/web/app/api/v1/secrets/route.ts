import { NextRequest } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { z } from "zod";
import { toB64url, randomBytes } from "ncrypted/crypto";
import { resourceServer, NETWORK, PRICE, PAY_TO } from "@/lib/x402";
import { getStore } from "@/lib/store";
import { json, error, publicOrigin, sha256 } from "@/lib/http";

const b64url = (max: number) => z.string().regex(/^[A-Za-z0-9_-]+$/).max(max);

const Body = z.object({
  v: z.literal(1),
  ciphertext: b64url(90_000), // 64 KB plaintext + GCM tag, base64url
  iv: b64url(16).length(16),
  salt: b64url(22).length(22),
  hasPassphrase: z.boolean(),
  ttl: z.number().int().min(300).max(604_800).default(86_400),
});

const exampleInput = {
  v: 1,
  ciphertext: "q7h0...base64url",
  iv: "Yb2x0Zl9pdjEy",
  salt: "c2FsdHNhbHRzYWx0c2FsdA",
  hasPassphrase: false,
  ttl: 86400,
};

async function handler(req: NextRequest) {
  if (!PAY_TO) return error("Service is not configured", 503);
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return error("Body must be JSON", 400);
  }
  if (!parsed.success) return error(`Invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400);
  const { ttl, ...payload } = parsed.data;

  const id = toB64url(randomBytes(16));
  const receiptToken = toB64url(randomBytes(24));
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  await getStore().put(id, payload, { rt: await sha256(receiptToken), status: "pending", expiresAt }, ttl);

  return json({ id, url: `${publicOrigin(req)}/s/${id}`, expiresAt, receiptToken }, 201);
}

export const POST = withX402(
  handler,
  {
    "/api/v1/secrets": {
      accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO ?? "0x0000000000000000000000000000000000000000" },
      description:
        "ncrypted: store a client-side encrypted, one-time secret (password, API key, note). Returns an id; the client builds the share link /s/{id}#{key}. The secret self-destructs after one read or at ttl. Use the `ncrypted` npm SDK or @seidl-family/ncrypted-mcp to encrypt.",
      mimeType: "application/json",
      serviceName: "ncrypted",
      tags: ["secrets", "security", "encryption", "one-time", "sharing", "agents"],
      extensions: declareDiscoveryExtension({
        bodyType: "json",
        input: exampleInput,
        inputSchema: {
          type: "object",
          properties: {
            v: { type: "number", const: 1 },
            ciphertext: { type: "string", description: "AES-256-GCM ciphertext, base64url" },
            iv: { type: "string", description: "12-byte IV, base64url" },
            salt: { type: "string", description: "16-byte HKDF salt, base64url" },
            hasPassphrase: { type: "boolean" },
            ttl: { type: "number", description: "Seconds until expiry, 300-604800" },
          },
          required: ["v", "ciphertext", "iv", "salt", "hasPassphrase"],
        },
        output: {
          example: { id: "Xq3...", url: "https://ncrypted.ai/s/Xq3...", expiresAt: "2026-10-17T12:00:00.000Z", receiptToken: "..." },
        },
      }),
    },
  },
  resourceServer,
);
