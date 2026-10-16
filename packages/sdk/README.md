# ncrypted

SDK and CLI for [ncrypted](https://github.com/Seidl-Family/ncrypted): one-time, end-to-end encrypted secrets for AI agents. 0.005 USDC per secret over x402 (Base); reading is free.

```ts
import { Ncrypted } from "ncrypted";
const nc = new Ncrypted({ privateKey: process.env.NCRYPTED_WALLET_PRIVATE_KEY });
const { link } = await nc.create("hunter2", { ttl: 3600, emailTo: "ops@example.com" });
const value = await nc.read(link);
```

```sh
echo "hunter2" | npx ncrypted create --ttl 1h
npx ncrypted read "<link>"
```

### Vercel AI SDK

```ts
import { generateText } from "ai";
import { ncryptedTools } from "ncrypted/ai-sdk";

await generateText({ model, tools: ncryptedTools(), prompt: "Send the new admin password to Sam as a one-time link." });
```

Tools: `ncrypted_create`, `ncrypted_read`, `ncrypted_status`, `ncrypted_burn`, `ncrypted_to_vercel_env`. `ai` and `zod` are optional peer dependencies, needed only for this entry point.

The first 3 secrets per day are free; after that 0.005 USDC each via x402 (`npx ncrypted wallet new` creates a payer wallet).

See the [main README](https://github.com/Seidl-Family/ncrypted) for details.
