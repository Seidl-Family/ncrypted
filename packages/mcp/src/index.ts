#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Ncrypted } from "ncrypted";

const client = new Ncrypted();
const server = new McpServer({ name: "ncrypted", version: "0.1.1" });

const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, ...text(`Error: ${(e as Error).message}`) });

server.registerTool(
  "ncrypted_create",
  {
    title: "Create one-time secret",
    description:
      "Encrypt a password, API key, or sensitive note locally and store it as a one-time secret. Returns a link that " +
      "works exactly once, then self-destructs. Costs 0.005 USDC (paid automatically from the configured Base wallet via x402). " +
      "Share the returned link with a human, email it (emailTo), or hand it to another agent, which reads it with ncrypted_read. " +
      "Treat the link like the secret itself; never echo the secret value in chat.",
    inputSchema: {
      secret: z.string().min(1).describe("The sensitive value to share. Max 64 KB."),
      ttl_seconds: z.number().int().min(300).max(604800).optional().describe("Expiry if never read. Default 86400 (24h), max 7 days."),
      passphrase: z.string().optional().describe("Optional second factor. The recipient needs it in addition to the link; deliver it through a different channel."),
      emailTo: z.string().email().optional().describe("Email the link to this address. The service sees the link for that one request; add a passphrase for highly sensitive values."),
      emailNote: z.string().max(200).optional().describe("Short context for the email, e.g. 'Staging DB password'. Never include the secret."),
    },
  },
  async ({ secret, ttl_seconds, passphrase, emailTo, emailNote }) => {
    try {
      const r = await client.create(secret, { ttl: ttl_seconds, passphrase, emailTo, emailNote });
      return text({
        link: r.link,
        id: r.id,
        expiresAt: r.expiresAt,
        receiptToken: r.receiptToken,
        emailed: r.emailed,
        paymentTx: r.paymentTx,
        note: "The link can be opened once. Keep receiptToken to check status or burn it.",
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "ncrypted_read",
  {
    title: "Read one-time secret",
    description:
      "Open an ncrypted link (https://.../s/{id}#{key}), decrypt it locally and return the secret. This destroys the secret: " +
      "it can never be read again. Free. Use the value only for the task at hand and do not repeat it in chat.",
    inputSchema: {
      link: z.string().url().describe("The full ncrypted link including the #key fragment."),
      passphrase: z.string().optional().describe("Required only if the sender set a passphrase."),
    },
    annotations: { destructiveHint: true, idempotentHint: false },
  },
  async ({ link, passphrase }) => {
    try {
      return text(await client.read(link, passphrase));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "ncrypted_status",
  {
    title: "Check one-time secret status",
    description: "Check whether a secret you created has been read yet (pending, read, burned or expired). Free.",
    inputSchema: { id: z.string(), receiptToken: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ id, receiptToken }) => {
    try {
      return text(await client.status(id, receiptToken));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "ncrypted_burn",
  {
    title: "Burn one-time secret",
    description: "Destroy a secret you created before anyone reads it, e.g. if the link was sent to the wrong place. Free.",
    inputSchema: { id: z.string(), receiptToken: z.string() },
    annotations: { destructiveHint: true },
  },
  async ({ id, receiptToken }) => {
    try {
      await client.burn(id, receiptToken);
      return text({ burned: true });
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
