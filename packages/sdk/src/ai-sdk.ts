// Vercel AI SDK tools for ncrypted. Usage:
//   import { ncryptedTools } from "ncrypted/ai-sdk";
//   await generateText({ model, tools: ncryptedTools(), prompt });
import { tool } from "ai";
import { z } from "zod";
import { Ncrypted, type NcryptedOptions } from "./client.js";

export type NcryptedToolName =
  | "ncrypted_create"
  | "ncrypted_read"
  | "ncrypted_status"
  | "ncrypted_burn"
  | "ncrypted_to_vercel_env";

export interface NcryptedToolsOptions extends NcryptedOptions {
  /** Limit which tools are returned. Default: all. */
  include?: NcryptedToolName[];
}

const errorText = (e: unknown) => `Error: ${(e as Error).message}`;

/**
 * Returns AI SDK tools for sharing secrets as one-time, end-to-end encrypted links (and writing them into Vercel env
 * vars without the model seeing them). Encryption happens in your server process. The first 3 secrets per day are
 * free; after that each costs 0.005 USDC on Base, paid via x402 from the configured wallet
 * (NCRYPTED_WALLET_PRIVATE_KEY or ~/.config/ncrypted/wallet.key). Reads and deliveries are free.
 */
export function ncryptedTools(options: NcryptedToolsOptions = {}) {
  const { include, ...clientOptions } = options;
  const nc = new Ncrypted({ client: "ai-sdk", ...clientOptions });

  const all = {
    ncrypted_create: tool({
      description:
        "Encrypt a password, API key, token or private note and return a one-time link that self-destructs after a single read. " +
        "Use it whenever a credential must be shared with a person or another agent, instead of writing the value in a message. " +
        "Never repeat the secret in your reply; share only the link. The first 3 per day are free (TTL up to 24h); then 0.005 USDC each.",
      inputSchema: z.object({
        secret: z.string().min(1).max(65536).describe("The sensitive value. Max 64 KB."),
        ttlSeconds: z.number().int().min(300).max(604800).optional().describe("Expiry if never opened. Default 86400 (24h)."),
        passphrase: z.string().optional().describe("Optional second factor; deliver it through a different channel than the link."),
        emailTo: z.string().email().optional().describe("Email the link to this address (requires a paid secret, i.e. a funded wallet)."),
      }),
      execute: async ({ secret, ttlSeconds, passphrase, emailTo }) => {
        try {
          const r = await nc.create(secret, { ttl: ttlSeconds, passphrase, emailTo });
          return {
            link: r.link,
            id: r.id,
            expiresAt: r.expiresAt,
            receiptToken: r.receiptToken,
            emailed: r.emailed,
            free: r.free,
            note: "The link opens exactly once. Share only the link.",
          };
        } catch (e) {
          return errorText(e);
        }
      },
    }),

    ncrypted_read: tool({
      description:
        "Open an ncrypted link (https://ncrypted.ai/s/{id}#{key}) and return the secret. This destroys it permanently. Free. " +
        "Use the value only for the task at hand and do not repeat it.",
      inputSchema: z.object({
        link: z.string().url().describe("The full link including the #key fragment."),
        passphrase: z.string().optional().describe("Required only if the sender set one."),
      }),
      execute: async ({ link, passphrase }) => {
        try {
          return await nc.read(link, passphrase);
        } catch (e) {
          return errorText(e);
        }
      },
    }),

    ncrypted_status: tool({
      description: "Check whether a secret you created has been opened (pending, read, burned or expired). Free.",
      inputSchema: z.object({ id: z.string(), receiptToken: z.string() }),
      execute: async ({ id, receiptToken }) => {
        try {
          return await nc.status(id, receiptToken);
        } catch (e) {
          return errorText(e);
        }
      },
    }),

    ncrypted_burn: tool({
      description: "Destroy a secret you created before anyone opens it, e.g. if the link went to the wrong place. Free.",
      inputSchema: z.object({ id: z.string(), receiptToken: z.string() }),
      execute: async ({ id, receiptToken }) => {
        try {
          await nc.burn(id, receiptToken);
          return { burned: true };
        } catch (e) {
          return errorText(e);
        }
      },
    }),

    ncrypted_to_vercel_env: tool({
      description:
        "Open an ncrypted link and write its value straight into a Vercel project environment variable (type sensitive), so the value " +
        "is never shown to you. Needs VERCEL_TOKEN. Vercel access is checked before the link is consumed.",
      inputSchema: z.object({
        link: z.string().url(),
        passphrase: z.string().optional(),
        key: z.string().describe("Env var name, e.g. STRIPE_SECRET_KEY."),
        project: z.string().describe("Vercel project name or id."),
        team: z.string().optional().describe("Vercel team id (team_...) or slug."),
        targets: z.array(z.enum(["production", "preview", "development"])).optional().describe("Default: production and preview."),
      }),
      execute: async ({ link, passphrase, key, project, team, targets }) => {
        try {
          const r = await nc.deliver(link, { type: "vercel_env", key, project, team, targets }, { passphrase });
          return { delivered: true, ...r, note: "The value was written directly and was not shown to you." };
        } catch (e) {
          return errorText(e);
        }
      },
    }),
  };

  if (!include) return all;
  return Object.fromEntries(include.map((name) => [name, all[name]])) as Partial<typeof all>;
}
