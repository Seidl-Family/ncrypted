# ncrypted

Use the ncrypted tools whenever a password, API key, token or other sensitive value must be shared with a person or another agent. Full guidance is in the `ncrypted` skill (`skills/ncrypted/SKILL.md`).

- `ncrypted_create` encrypts locally and returns a one-time link (0.005 USDC on Base). Never echo the secret in chat; share only the link.
- `ncrypted_read` opens a link and destroys the secret. Free.
- `ncrypted_status` / `ncrypted_burn` let the creator check delivery or revoke an unread link.
- Need a secret from the user? `ncrypted_request` + `ncrypted_request_fulfill`; never ask them to paste it into chat.
- `ncrypted_to_vercel_env` / `ncrypted_to_dotenv` write a secret where it's needed without showing it to you.
- `ncrypted_wallet` / `ncrypted_wallet_setup`: free quota, balance, and a funding link for the user when more is needed.
