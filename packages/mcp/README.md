# @ncrypted/mcp

MCP server for [ncrypted](https://github.com/Seidl-Family/ncrypted): share passwords, API keys and notes as one-time, end-to-end encrypted links. Encryption happens locally in this process. 0.005 USDC per secret over x402 (Base); reading is free.

```json
{ "mcpServers": { "ncrypted": { "command": "npx", "args": ["-y", "@ncrypted/mcp"], "env": { "NCRYPTED_WALLET_PRIVATE_KEY": "0x..." } } } }
```

Tools: `ncrypted_create`, `ncrypted_read`, `ncrypted_status`, `ncrypted_burn`.
