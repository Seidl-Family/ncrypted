import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createPaymentWrapper } from "@x402/mcp";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { z } from "zod";
import { encrypt, decrypt, parseLink } from "ncrypted/crypto";
import { resourceServer, NETWORK, PRICE, PAY_TO } from "./x402";
import { storeSecret, takeSecret, peekSecret, statusOf, burnSecret, metaForReceipt, GONE } from "./secrets";
import { claimFree, freeRemaining, track, FREE_MAX_TTL, FREE_PER_DAY } from "./usage";

const HOSTED_NOTE =
  "Hosted mode: this server encrypts the secret for you, so it sees the plaintext briefly over TLS (never stored or logged). " +
  "For end-to-end, zero-knowledge encryption run the local MCP server `npx -y @seidl-family/ncrypted-mcp` instead.";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (v: unknown): ToolResult => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (message: string): ToolResult => ({ ...text(`Error: ${message}`), isError: true });

const createInput = {
  secret: z.string().min(1).max(64 * 1024).describe("The sensitive value to share. Max 64 KB."),
  ttl_seconds: z.number().int().min(300).max(604800).optional().describe("Expiry if never read. Default 86400 (24h), max 7 days."),
  passphrase: z.string().optional().describe("Optional second factor the recipient also needs. Share it through a different channel."),
};

let paidWrapper: Promise<ReturnType<typeof createPaymentWrapper>> | undefined;
function getPaid() {
  return (paidWrapper ??= (async () => {
    await resourceServer.initialize();
    const accepts = await resourceServer.buildPaymentRequirements({ scheme: "exact", network: NETWORK, payTo: PAY_TO!, price: PRICE });
    return createPaymentWrapper(resourceServer, {
      accepts,
      resource: {
        url: `${(process.env.NCRYPTED_PUBLIC_URL ?? "https://ncrypted.ai").replace(/\/$/, "")}/mcp`,
        description: "ncrypted: create a one-time, self-destructing secret link (hosted MCP).",
        serviceName: "ncrypted",
        tags: ["secrets", "encryption", "one-time", "security", "agents"],
      },
      extensions: declareDiscoveryExtension({
        toolName: "ncrypted_create",
        description: "Create a one-time secret link for a password, API key or note. Self-destructs after one read.",
        inputSchema: {
          type: "object",
          properties: {
            secret: { type: "string" },
            ttl_seconds: { type: "number" },
            passphrase: { type: "string" },
          },
          required: ["secret"],
        },
        output: { example: { link: "https://ncrypted.ai/s/abc#key", expiresAt: "2026-10-17T12:00:00.000Z" } },
      }),
    });
  })().catch((e) => {
    paidWrapper = undefined; // retry initialization on the next request
    throw e;
  }));
}

/** Builds a fresh MCP server bound to this deployment's public origin. One per request (stateless). */
export interface McpCaller {
  ip: string;
  client: string;
}

/** Builds a fresh MCP server bound to this deployment's public origin. One per request (stateless). */
export async function buildMcpServer(origin: string, caller: McpCaller): Promise<McpServer> {
  const server = new McpServer({ name: "ncrypted", version: "0.1.2" });
  const paid = await getPaid();

  const create = async (args: Record<string, unknown>, free: boolean) => {
    const { secret, ttl_seconds, passphrase } = args as { secret: string; ttl_seconds?: number; passphrase?: string };
    const { payload, key } = await encrypt(secret, passphrase);
    const rec = await storeSecret(payload, ttl_seconds ?? 86400, origin, free);
    await track(free ? "created_free" : "created_paid", caller.client);
    return text({
      link: `${rec.url}#${key}`,
      id: rec.id,
      expiresAt: rec.expiresAt,
      receiptToken: rec.receiptToken,
      ...(free ? { free: true, freeRemaining: await freeRemaining(caller.ip) } : {}),
      note: "The link can be opened once. Keep receiptToken to check status or burn it.",
    });
  };
  const paidCreate = paid((args) => create(args, false));

  server.registerTool(
    "ncrypted_create",
    {
      title: "Create one-time secret",
      description:
        "Store a password, API key or sensitive note as a one-time link that self-destructs after a single read. " +
        `The first ${FREE_PER_DAY} per day are free (TTL up to 24h); after that each costs ${PRICE.replace("$", "")} USDC, paid via x402 on Base (your MCP client must support x402). ` +
        "Share the link with a person or another agent; never echo the secret in chat. " +
        HOSTED_NOTE,
      inputSchema: createInput,
    },
    (async (args: Record<string, unknown>, extra: { _meta?: Record<string, unknown> }) => {
      // Free tier first, unless the client is already paying.
      const paying = !!extra?._meta?.["x402/payment"];
      const ttl = (args.ttl_seconds as number | undefined) ?? 86400;
      if (!paying && ttl <= FREE_MAX_TTL && (await claimFree(caller.ip))) return create(args, true);
      return paidCreate(args, extra);
    }) as never,
  );

  server.registerTool(
    "ncrypted_read",
    {
      title: "Read one-time secret",
      description:
        "Open an ncrypted link (https://.../s/{id}#{key}) and return the secret. This destroys it permanently. Free. " +
        "Only use the value for the task at hand and do not repeat it in chat. " +
        HOSTED_NOTE.replace("encrypts the secret for you", "decrypts the secret for you"),
      inputSchema: {
        link: z.string().url().describe("The full ncrypted link including the #key fragment."),
        passphrase: z.string().optional().describe("Required only if the sender set a passphrase."),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ link, passphrase }) => {
      let parsed;
      try {
        parsed = parseLink(link);
      } catch (e) {
        return fail((e as Error).message);
      }
      if (parsed.origin !== origin) return fail(`This server only opens ${origin} links. Use the local MCP server for other hosts.`);
      // Decrypt from a non-destructive read first, so a wrong passphrase doesn't burn the secret.
      const peeked = await peekSecret(parsed.id);
      if (!peeked) return fail(GONE);
      let plaintext: string;
      try {
        plaintext = await decrypt(peeked, parsed.key, passphrase);
      } catch (e) {
        return fail(`${(e as Error).message}. The secret was not consumed; try again with the correct passphrase.`);
      }
      // Only one caller can win the atomic take; anyone racing us gets GONE.
      if (!(await takeSecret(parsed.id))) return fail(GONE);
      await track("read", caller.client);
      return text(plaintext);
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
      const meta = await metaForReceipt(id, receiptToken);
      return meta ? text(await statusOf(id, meta)) : fail("Not found");
    },
  );

  server.registerTool(
    "ncrypted_burn",
    {
      title: "Burn one-time secret",
      description: "Destroy a secret you created before anyone reads it. Free.",
      inputSchema: { id: z.string(), receiptToken: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ id, receiptToken }) => {
      if (!(await metaForReceipt(id, receiptToken))) return fail("Not found");
      await burnSecret(id);
      await track("burned", caller.client);
      return text({ burned: true });
    },
  );

  return server;
}
