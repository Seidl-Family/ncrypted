import { NextRequest } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { z } from "zod";
import { resourceServer, NETWORK, PRICE, PAY_TO } from "@/lib/x402";
import { storeSecret } from "@/lib/secrets";
import { json, error, publicOrigin } from "@/lib/http";
import { claimFree, clientIp, clientName, freeRemaining, track, FREE_MAX_TTL, FREE_PER_DAY } from "@/lib/usage";

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

async function parse(req: NextRequest) {
  let raw;
  try {
    raw = await req.json();
  } catch {
    return { err: error("Body must be JSON", 400) };
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return { err: error(`Invalid request: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, 400) };
  return { data: parsed.data };
}

async function handler(req: NextRequest) {
  if (!PAY_TO) return error("Service is not configured", 503);
  const { data, err } = await parse(req);
  if (err) return err;
  const { ttl, ...payload } = data;
  const rec = await storeSecret(payload, ttl, publicOrigin(req));
  await track("created_paid", clientName(req));
  return json(rec, 201);
}

const paid = withX402(
  handler,
  {
    "/api/v1/secrets": {
      accepts: { scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO ?? "0x0000000000000000000000000000000000000000" },
      description:
        "ncrypted: store a client-side encrypted, one-time secret (password, API key, note). Returns an id; the client builds the share link /s/{id}#{key}. The secret self-destructs after one read or at ttl. Use the `ncrypted` npm SDK or @seidl-family/ncrypted-mcp to encrypt.",
      mimeType: "application/json",
      serviceName: "ncrypted",
      tags: ["secrets", "encryption", "one-time", "security", "agents"],
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

/**
 * Free tier: requests without a payment get FREE_PER_DAY secrets per IP per day (max 24h TTL, no email).
 * Everything else, including requests once the quota is used, goes through x402.
 */
export async function POST(req: NextRequest) {
  if (!PAY_TO) return error("Service is not configured", 503);
  const paying = req.headers.has("payment-signature") || req.headers.has("x-payment");
  // Clients that need a paid secret (e.g. for email delivery) opt out of the free tier.
  if (!paying && !req.headers.has("x-ncrypted-no-free")) {
    const { data, err } = await parse(req.clone() as NextRequest);
    if (err) return err;
    const ip = clientIp(req);
    if (data.ttl <= FREE_MAX_TTL && (await claimFree(ip))) {
      const { ttl, ...payload } = data;
      const rec = await storeSecret(payload, ttl, publicOrigin(req), true);
      await track("created_free", clientName(req));
      return json({ ...rec, free: true, freeRemaining: await freeRemaining(ip) }, 201);
    }
  }
  const res = await paid(req);
  if (res.status === 402) {
    res.headers.set("x-ncrypted-free-per-day", String(FREE_PER_DAY));
    res.headers.set("x-ncrypted-free-max-ttl", String(FREE_MAX_TTL));
    res.headers.set("x-ncrypted-free-remaining", String(paying ? 0 : await freeRemaining(clientIp(req))));
  }
  return res;
}
