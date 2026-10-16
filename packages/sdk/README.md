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

See the [main README](https://github.com/Seidl-Family/ncrypted) for details.
