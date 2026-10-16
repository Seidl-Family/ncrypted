// End-to-end test for delivery destinations and secret requests.
// Usage: NCRYPTED_URL=... node --env-file=.env.e2e --experimental-strip-types scripts/e2e-deliver.ts
// Needs a `vercel login` session with access to the linked project in the repo root; writes and then removes
// the env var NCRYPTED_E2E_TEST (Preview only).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ncrypted, sealToPublicKey, parseRequestLink } from "../packages/sdk/dist/index.js";

const nc = new Ncrypted({ client: "e2e" });
const step = (s: string) => console.log(`✓ ${s}`);
const dir = mkdtempSync(join(tmpdir(), "ncrypted-e2e-"));
process.env.NCRYPTED_REQUESTS_DIR = join(dir, "requests");
const repoRoot = new URL("..", import.meta.url).pathname;

// 1. link -> .env
const envPath = join(dir, ".env");
const s1 = await nc.create("value with spaces & \"quotes\"", { ttl: 300 });
const r1 = await nc.deliver(s1.link, { type: "dotenv", key: "API_TOKEN", path: envPath });
assert.equal(r1.destination, "dotenv");
assert.equal(readFileSync(envPath, "utf8"), 'API_TOKEN="value with spaces & \\"quotes\\""\n');
assert.equal(statSync(envPath).mode & 0o777, 0o600);
await assert.rejects(nc.read(s1.link), /already been read/);
step("link -> .env (quoted, mode 600, link consumed)");

// 2. A bad destination fails before the secret is consumed.
const s2 = await nc.create("still here", { ttl: 300 });
await assert.rejects(nc.deliver(s2.link, { type: "vercel_env", key: "X", project: "definitely-not-a-real-project-ncrypted" }), /Vercel API 404/);
assert.equal(await nc.read(s2.link), "still here");
step("invalid Vercel project is rejected before the link is consumed");

// 3. link -> Vercel env var (Preview), verified via the CLI without printing the value, then removed.
const s3 = await nc.create(`e2e-${crypto.randomUUID()}`, { ttl: 300 });
const r3 = await nc.deliver(s3.link, { type: "vercel_env", key: "NCRYPTED_E2E_TEST", targets: ["preview"], cwd: repoRoot });
assert.equal(r3.details.type, "sensitive");
const ls = execFileSync("vercel", ["env", "ls", "preview"], { cwd: repoRoot, encoding: "utf8" });
assert.match(ls, /NCRYPTED_E2E_TEST/);
execFileSync("vercel", ["env", "rm", "NCRYPTED_E2E_TEST", "preview", "--yes"], { cwd: repoRoot, stdio: "ignore" });
step("link -> Vercel env var (sensitive, Preview), then removed");

// 4. Request flow: agent asks, "human" answers via the page's API, agent delivers to .env.
const req = await nc.requestSecret("E2E test: please paste a value", { ttl: 600 });
const pending = await nc.fulfillRequest(req.id, { destination: { type: "dotenv", key: "REQUESTED", path: envPath }, waitSeconds: 0 });
assert.equal(pending.status, "pending");
const { origin, id, publicKey } = parseRequestLink(req.url);
const info = (await (await fetch(`${origin}/api/v1/requests/${id}`)).json()) as { label: string; status: string };
assert.equal(info.status, "open");
assert.equal(JSON.stringify(info).includes(publicKey), false);
const fulfil = await fetch(`${origin}/api/v1/requests/${id}/fulfill`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(await sealToPublicKey("from-the-human", publicKey)),
});
assert.equal(fulfil.status, 200);
const again = await fetch(`${origin}/api/v1/requests/${id}/fulfill`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(await sealToPublicKey("second try", publicKey)),
});
assert.equal(again.status, 409);
const done = await nc.fulfillRequest(req.id, { destination: { type: "dotenv", key: "REQUESTED", path: envPath }, waitSeconds: 10 });
assert.equal(done.status, "delivered");
assert.match(readFileSync(envPath, "utf8"), /^REQUESTED=from-the-human$/m);
await assert.rejects(nc.fulfillRequest(req.id), /No pending request|expired or was already collected/);
step("request -> human submits (once) -> delivered to .env; request can't be reused");

console.log("\nAll delivery checks passed.");
