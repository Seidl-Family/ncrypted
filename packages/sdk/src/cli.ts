#!/usr/bin/env node
import { parseArgs } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { Ncrypted } from "./client.js";
import { createWallet, normalizeKey, readWalletKey, usdcBalance, walletPath } from "./wallet.js";

const HELP = `ncrypted - one-time, end-to-end encrypted secrets for agents (0.005 USDC per secret, reads free)

Usage:
  ncrypted create [--ttl 1h] [--passphrase X] [--email to@x.com] [--note "..."] < secret.txt
  ncrypted create --text "secret value"
  ncrypted read <link> [--passphrase X]
  ncrypted status <id> --receipt <token>
  ncrypted burn <id> --receipt <token>
  ncrypted wallet new           create a payer wallet at ~/.config/ncrypted/wallet.key
  ncrypted wallet               show the payer address and its USDC balance on Base

The first 3 secrets per day are free (TTL up to 24h, no email). After that, creating a secret needs a Base
wallet holding a little USDC (no ETH needed). The key is read from
NCRYPTED_WALLET_PRIVATE_KEY, else NCRYPTED_WALLET_FILE, else ~/.config/ncrypted/wallet.key.
NCRYPTED_URL overrides the API origin.`;

function parseTtl(v?: string): number | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d+)([smhd]?)$/);
  if (!m) throw new Error(`Bad --ttl "${v}" (use e.g. 30m, 1h, 7d)`);
  return Number(m[1]) * ({ "": 1, s: 1, m: 60, h: 3600, d: 86400 } as Record<string, number>)[m[2]];
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\n$/, "");
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      ttl: { type: "string" },
      passphrase: { type: "string" },
      email: { type: "string" },
      note: { type: "string" },
      text: { type: "string" },
      receipt: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, arg] = positionals;
  const client = new Ncrypted({ client: "cli" });
  const out = (v: unknown) => console.log(values.json ? JSON.stringify(v) : typeof v === "string" ? v : JSON.stringify(v, null, 2));

  switch (values.help ? "help" : cmd) {
    case "create": {
      const text = values.text ?? (await readStdin());
      if (!text) throw new Error("Provide the secret on stdin or with --text");
      out(await client.create(text, { ttl: parseTtl(values.ttl), passphrase: values.passphrase, emailTo: values.email, emailNote: values.note }));
      break;
    }
    case "read":
      if (!arg) throw new Error("Usage: ncrypted read <link>");
      out(await client.read(arg, values.passphrase));
      break;
    case "status":
      if (!arg || !values.receipt) throw new Error("Usage: ncrypted status <id> --receipt <token>");
      out(await client.status(arg, values.receipt));
      break;
    case "burn":
      if (!arg || !values.receipt) throw new Error("Usage: ncrypted burn <id> --receipt <token>");
      await client.burn(arg, values.receipt);
      out({ burned: true });
      break;
    case "wallet": {
      if (arg === "new") {
        const { address, path } = await createWallet().catch((e: NodeJS.ErrnoException) => {
          if (e.code === "EEXIST") throw new Error(`A wallet already exists at ${walletPath()}`);
          throw e;
        });
        out({ address, path, next: "Send a little USDC on Base to this address. Each secret costs 0.005 USDC; no ETH needed." });
        break;
      }
      const key = normalizeKey(process.env.NCRYPTED_WALLET_PRIVATE_KEY) ?? (await readWalletKey());
      const { freeRemaining, freePerDay } = await client.quota();
      if (!key) {
        out({ wallet: null, freeRemainingToday: freeRemaining, freePerDay, next: "Run `npx ncrypted wallet new` to pay for more than the free tier." });
        break;
      }
      const address = privateKeyToAccount(key).address;
      const usdc = await usdcBalance(address);
      out({ address, usdc, paidSecretsAvailable: Math.floor(usdc / 0.005), freeRemainingToday: freeRemaining });
      break;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e: Error) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
