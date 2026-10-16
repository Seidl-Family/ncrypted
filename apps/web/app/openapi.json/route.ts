import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/http";
import { PRICE, NETWORK } from "@/lib/x402";

const bearer = [{ receiptToken: [] }];
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };
const payload = {
  type: "object",
  required: ["v", "ciphertext", "iv", "salt", "hasPassphrase"],
  properties: {
    v: { type: "integer", enum: [1] },
    ciphertext: { type: "string", description: "AES-256-GCM ciphertext, base64url" },
    iv: { type: "string", description: "12-byte IV, base64url" },
    salt: { type: "string", description: "16-byte salt, base64url" },
    hasPassphrase: { type: "boolean" },
  },
};

export function GET(req: NextRequest) {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "ncrypted",
      version: "1.0.0",
      description: `One-time, end-to-end encrypted secrets for AI agents. Creating a secret costs ${PRICE} USDC via x402 (${NETWORK}). Everything else is free.`,
    },
    servers: [{ url: publicOrigin(req) }],
    components: { securitySchemes: { receiptToken: { type: "http", scheme: "bearer" } } },
    paths: {
      "/api/v1/secrets": {
        post: {
          summary: `Store an encrypted one-time secret (x402: ${PRICE} USDC)`,
          requestBody: {
            required: true,
            content: { "application/json": { schema: { ...payload, properties: { ...payload.properties, ttl: { type: "integer", minimum: 300, maximum: 604800, default: 86400 } } } } },
          },
          responses: {
            "201": { description: "Created. Share link = url + '#' + key", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, url: { type: "string" }, expiresAt: { type: "string" }, receiptToken: { type: "string" } } } } } },
            "402": { description: "x402 payment required" },
          },
        },
      },
      "/api/v1/secrets/{id}/reveal": {
        post: { summary: "Fetch and destroy the encrypted payload", parameters: [idParam], responses: { "200": { description: "Payload", content: { "application/json": { schema: payload } } }, "410": { description: "Already read, burned or expired" } } },
      },
      "/api/v1/secrets/{id}/status": {
        get: { summary: "Creator: check whether it was read", security: bearer, parameters: [idParam], responses: { "200": { description: "pending | read | burned | expired" } } },
      },
      "/api/v1/secrets/{id}": {
        delete: { summary: "Creator: burn an unread secret", security: bearer, parameters: [idParam], responses: { "200": { description: "Burned" } } },
      },
      "/api/v1/secrets/{id}/email": {
        post: {
          summary: "Creator: email the share link once",
          security: bearer,
          parameters: [idParam],
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["to", "link"], properties: { to: { type: "string", format: "email" }, link: { type: "string" }, note: { type: "string", maxLength: 200 } } } } } },
          responses: { "200": { description: "Sent" }, "409": { description: "Already emailed" } },
        },
      },
    },
  });
}
