#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { Ncrypted, usdcBalance, walletPath } from "ncrypted";
import { normalizeKey, readWalletKey } from "ncrypted/wallet";

const client = new Ncrypted({ client: "mcp" });
const server = new McpServer({ name: "ncrypted", version: "0.2.0" });

const hasWallet = async () => !!(normalizeKey(process.env.NCRYPTED_WALLET_PRIVATE_KEY) ?? (await readWalletKey().catch(() => undefined)));
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, ...text(`Error: ${(e as Error).message}`) });

server.registerTool(
  "ncrypted_create",
  {
    title: "Create one-time secret",
    description:
      "Encrypt a password, API key, or sensitive note locally and store it as a one-time secret. Returns a link that " +
      "works exactly once, then self-destructs. The first 3 per day are free (TTL up to 24h, no email); after that each costs 0.005 USDC, paid automatically from the configured Base wallet via x402. " +
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
        free: r.free,
        ...(r.free ? { freeRemaining: r.freeRemaining } : { paymentTx: r.paymentTx }),
        ...(r.free && (r.freeRemaining ?? 0) <= 1 && !(await hasWallet())
          ? { hint: "Free secrets are almost used up for today and no wallet is set up. Offer the user ncrypted_wallet_setup." }
          : {}),
        note: "The link can be opened once. Keep receiptToken to check status or burn it.",
      });
    } catch (e) {
      if ((e as { status?: number }).status === 402 && !(await hasWallet())) {
        return fail(new Error(`${(e as Error).message} Or call ncrypted_wallet_setup to create a wallet and get a funding link for the user.`));
      }
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

const vercelFields = {
  key: z.string().describe("Env var name, e.g. STRIPE_SECRET_KEY."),
  project: z.string().optional().describe("Vercel project name or id. Default: the project linked in cwd's .vercel/project.json."),
  team: z.string().optional().describe("Vercel team id (team_...) or slug. Default: the linked project's team."),
  targets: z.array(z.enum(["production", "preview", "development"])).optional().describe("Default: production and preview."),
  cwd: z.string().optional().describe("Project directory containing .vercel/project.json. Default: the server's working directory."),
};

const deliveredText = (r: { destination: string; key: string; details: Record<string, unknown> }) =>
  text({ delivered: true, ...r, note: "The value was written directly and was not shown to you. Do not ask the user for it." });

server.registerTool(
  "ncrypted_to_vercel_env",
  {
    title: "Save one-time secret to a Vercel env var",
    description:
      "Open an ncrypted link and write its value straight into a Vercel project environment variable (type sensitive), " +
      "so the value never appears in this conversation. Uses the user's `vercel login` session or VERCEL_TOKEN. " +
      "Checks Vercel access before consuming the link. Prefer this over reading a secret and running `vercel env add`.",
    inputSchema: { link: z.string().url(), passphrase: z.string().optional(), ...vercelFields },
    annotations: { destructiveHint: true },
  },
  async ({ link, passphrase, key, project, team, targets, cwd }) => {
    try {
      return deliveredText(await client.deliver(link, { type: "vercel_env", key, project, team, targets, cwd }, { passphrase }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "ncrypted_to_dotenv",
  {
    title: "Save one-time secret to a .env file",
    description:
      "Open an ncrypted link and write its value into a local .env file (KEY=value, file mode 600) without showing it to you. " +
      "Warns if the file isn't git-ignored.",
    inputSchema: {
      link: z.string().url(),
      passphrase: z.string().optional(),
      key: z.string().describe("Variable name."),
      path: z.string().optional().describe("Path to the .env file. Default: ./.env"),
    },
    annotations: { destructiveHint: true },
  },
  async ({ link, passphrase, key, path }) => {
    try {
      return deliveredText(await client.deliver(link, { type: "dotenv", key, path }, { passphrase }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "ncrypted_request",
  {
    title: "Ask the user for a secret",
    description:
      "When you need a password, API key or token from the user, call this instead of asking them to paste it into chat. " +
      "Returns a link for the user; they paste the value on that page, where it's encrypted in their browser to a key that " +
      "only exists on this machine. Then call ncrypted_request_fulfill to deliver it (e.g. to a Vercel env var) without " +
      "ever seeing it. Free.",
    inputSchema: {
      label: z.string().min(1).max(120).describe("What you need and why, shown to the user, e.g. 'Stripe secret key for the billing project (Vercel production)'."),
      ttl_minutes: z.number().int().min(5).max(1440).optional().describe("How long the request stays open. Default 60."),
    },
  },
  async ({ label, ttl_minutes }) => {
    try {
      const r = await client.requestSecret(label, { ttl: (ttl_minutes ?? 60) * 60 });
      return text({
        ...r,
        next: "Send `url` to the user and ask them to open it and paste the value. Then call ncrypted_request_fulfill with this id.",
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "ncrypted_request_fulfill",
  {
    title: "Receive a requested secret",
    description:
      "Wait for the user to answer an ncrypted_request, then deliver the value. destination 'vercel_env' or 'dotenv' writes it " +
      "without showing it to you (preferred). 'return' gives you the value; use it only when you must use it directly, and never repeat it. " +
      "Returns status 'pending' if the user hasn't answered within wait_seconds; call again later.",
    inputSchema: {
      id: z.string().describe("The request id from ncrypted_request."),
      destination: z.enum(["vercel_env", "dotenv", "return"]),
      wait_seconds: z.number().int().min(0).max(120).optional().describe("How long to wait for the user. Default 60."),
      path: z.string().optional().describe("dotenv only: path to the .env file. Default ./.env"),
      ...vercelFields,
      key: z.string().optional().describe("Variable name (required for vercel_env and dotenv)."),
    },
  },
  async ({ id, destination, wait_seconds, path, key, project, team, targets, cwd }) => {
    try {
      if (destination !== "return" && !key) throw new Error("key is required for vercel_env and dotenv");
      const dest =
        destination === "vercel_env"
          ? ({ type: "vercel_env", key: key!, project, team, targets, cwd } as const)
          : destination === "dotenv"
            ? ({ type: "dotenv", key: key!, path } as const)
            : undefined;
      const r = await client.fulfillRequest(id, { destination: dest, waitSeconds: wait_seconds ?? 60 });
      if (r.status === "pending") return text({ ...r, next: "The user hasn't submitted yet. Call ncrypted_request_fulfill again shortly." });
      if (r.status === "delivered") return deliveredText(r.result);
      return text(r.value);
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "ncrypted_wallet_setup",
  {
    title: "Set up a payer wallet",
    description:
      "Create the local wallet that pays for secrets beyond the free tier (0.005 USDC each on Base), if none exists, and get a " +
      "funding link for its owner. Funding needs only the address; send the user `fundUrl` and ask them to send a little USDC " +
      "on Base (1 USDC = 200 secrets). The private key stays in a local file and is never shown to you. Set backup_to_owner " +
      "only if the user wants a copy of the key: it's placed in a one-time link for them.",
    inputSchema: {
      amount_usdc: z.number().min(0.01).max(100).optional().describe("Suggested funding amount. Default 1."),
      backup_to_owner: z.boolean().optional().describe("Also create a one-time link containing the private key for the owner. Default false."),
    },
  },
  async ({ amount_usdc, backup_to_owner }) => {
    try {
      const w = await client.setupWallet({ amountUsdc: amount_usdc, backupToOwner: backup_to_owner });
      return text({
        ...w,
        next: w.backupLink
          ? "Give the user fundUrl to fund the wallet, and backupLink (one-time, 24h) to save the key. Don't open backupLink yourself."
          : "Give the user fundUrl and ask them to send USDC on Base. Check progress with ncrypted_wallet.",
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "ncrypted_wallet",
  {
    title: "Show payer wallet",
    description: "Show today's remaining free secrets, plus the address and USDC balance (Base) of the wallet that pays for more. Free.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const key = normalizeKey(process.env.NCRYPTED_WALLET_PRIVATE_KEY) ?? (await readWalletKey());
      const { freeRemaining } = await client.quota().catch(() => ({ freeRemaining: undefined }));
      if (!key) {
        return text({
          configured: false,
          freeRemainingToday: freeRemaining,
          keyFile: walletPath(),
          fix: "Free secrets work without a wallet. For more, call ncrypted_wallet_setup and send the user the funding link.",
        });
      }
      const address = privateKeyToAccount(key).address;
      const usdc = await usdcBalance(address);
      return text({ configured: true, address, usdc, paidSecretsAvailable: Math.floor(usdc / 0.005), freeRemainingToday: freeRemaining });
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
