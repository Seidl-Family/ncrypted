# ncrypted

Use the ncrypted tools whenever a password, API key, token or other sensitive value must be shared with a person or another agent. Full guidance is in the `ncrypted` skill (`skills/ncrypted/SKILL.md`).

- `ncrypted_create` encrypts locally and returns a one-time link (0.005 USDC on Base). Never echo the secret in chat; share only the link.
- `ncrypted_read` opens a link and destroys the secret. Free.
- `ncrypted_status` / `ncrypted_burn` let the creator check delivery or revoke an unread link.
- `ncrypted_wallet` shows the payer wallet's USDC balance. If no wallet is configured, tell the user to run `npx ncrypted wallet new` and fund it.
