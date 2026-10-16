// Free-tier end-to-end test. Run against a server whose free quota for this IP is untouched today.
// Usage: NCRYPTED_URL=http://localhost:3403 node --experimental-strip-types scripts/e2e-free.ts
import assert from "node:assert/strict";
import { Ncrypted } from "../packages/sdk/dist/index.js";

delete process.env.NCRYPTED_WALLET_PRIVATE_KEY;
process.env.NCRYPTED_WALLET_FILE = "/nonexistent/ncrypted-wallet.key";
const nc = new Ncrypted({ client: "e2e" });
const step = (s: string) => console.log(`✓ ${s}`);

const q = await nc.quota();
assert.equal(q.freeRemaining, q.freePerDay);
step(`quota: ${q.freeRemaining}/${q.freePerDay} free today, then ${q.price} ${q.currency}`);

await assert.rejects(nc.create("x", { emailTo: "delivered@resend.dev" }), /Email delivery needs a paid secret/);
await assert.rejects(nc.create("x", { ttl: 3 * 86400 }), /at most 24h/);
step("email and >24h TTL require a wallet (no quota used)");

const made = [];
for (let i = 0; i < q.freePerDay; i++) {
  const s = await nc.create(`free secret ${i}`, { ttl: 600 });
  assert.equal(s.free, true);
  assert.equal(s.freeRemaining, q.freePerDay - i - 1);
  made.push(s);
}
step(`${q.freePerDay} free secrets created without a wallet`);

await assert.rejects(nc.create("one too many", { ttl: 600 }), /free secrets per day are used up/);
step("next create is refused with the wallet hint");

// Free secrets can't be emailed, even by the creator via the API.
const res = await fetch(`${nc.baseUrl}/api/v1/secrets/${made[0].id}/email`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${made[0].receiptToken}` },
  body: JSON.stringify({ to: "delivered@resend.dev", link: made[0].link }),
});
assert.ok(res.status === 402 || res.status === 503, `email status ${res.status}`);
step(`emailing a free secret is refused (${res.status})`);

assert.equal(await nc.read(made[0].link), "free secret 0");
await assert.rejects(nc.read(made[0].link), /already been read/);
step("free secrets read once like paid ones");

const stats = await fetch(`${nc.baseUrl}/api/v1/stats?days=1`);
assert.equal(stats.status, 401);
if (process.env.STATS_TOKEN) {
  const s = (await (await fetch(`${nc.baseUrl}/api/v1/stats?days=1`, { headers: { authorization: `Bearer ${process.env.STATS_TOKEN}` } })).json()) as Record<string, Record<string, number>>;
  const day = Object.values(s)[0];
  assert.ok(day.created_free >= q.freePerDay && day["client:e2e:created_free"] >= q.freePerDay, JSON.stringify(day));
  step(`stats: ${JSON.stringify(day)}`);
} else step("stats requires a token (set STATS_TOKEN to check counters)");

console.log("\nAll free-tier checks passed.");
