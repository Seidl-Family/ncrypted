// End-to-end test against a running server. Pays real (testnet) USDC.
// Usage: npm run e2e   (reads .env.e2e: NCRYPTED_URL, NCRYPTED_WALLET_PRIVATE_KEY)
import assert from "node:assert/strict";
import { Ncrypted } from "../packages/sdk/dist/index.js";

const client = new Ncrypted();
const step = (s: string) => console.log(`✓ ${s}`);

// Unpaid create is rejected with x402 requirements.
const unpaid = await fetch(`${client.baseUrl}/api/v1/secrets`, { method: "POST", body: "{}" });
assert.equal(unpaid.status, 402);
step("unpaid create returns 402");

// Paid create, status, one read, second read fails.
const secret = `e2e secret ${crypto.randomUUID()}`;
const created = await client.create(secret, { ttl: 600 });
step(`created ${created.id} (payment tx ${created.paymentTx ?? "n/a"})`);
assert.match(created.link, /\/s\/[A-Za-z0-9_-]{22}#[A-Za-z0-9_-]{43}$/);
assert.equal((await client.status(created.id, created.receiptToken)).status, "pending");
step("status pending");

// A plain GET of the viewer page (what link previews do) must not consume it.
const preview = await fetch(created.link.split("#")[0]);
assert.equal(preview.status, 200);
assert.equal((await client.status(created.id, created.receiptToken)).status, "pending");
step("GET of the viewer page does not burn the secret");

assert.equal(await client.read(created.link), secret);
step("read returns the original plaintext");
await assert.rejects(client.read(created.link), /already been read/);
step("second read is rejected");
const after = await client.status(created.id, created.receiptToken);
assert.equal(after.status, "read");
assert.ok(after.readAt);
step("status read");

// Passphrase-protected secret.
const p = await client.create("with passphrase", { passphrase: "correct horse", ttl: 300 });
assert.equal(await client.read(p.link, "correct horse"), "with passphrase");
step("passphrase secret round-trips");

// Burn before reading.
const b = await client.create("burn me", { ttl: 300 });
await client.burn(b.id, b.receiptToken);
assert.equal((await client.status(b.id, b.receiptToken)).status, "burned");
await assert.rejects(client.read(b.link), /already been read/);
step("burned secret cannot be read");

// Wrong receipt token.
await assert.rejects(client.status(b.id, "nope"), /Not found/);
step("status rejects a wrong receipt token");

// Concurrent reads: exactly one wins.
const c = await client.create("race", { ttl: 300 });
const results = await Promise.allSettled(Array.from({ length: 5 }, () => client.read(c.link)));
assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
step("5 concurrent reads, exactly 1 succeeded");

console.log("\nAll e2e checks passed (4 paid secrets = 0.02 USDC).");
