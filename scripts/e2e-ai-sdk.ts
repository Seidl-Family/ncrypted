// Checks ncrypted/ai-sdk tools: schemas convert for the AI SDK, and execute() works against a server.
// Usage: NCRYPTED_URL=http://localhost:3403 node --env-file=.env.e2e --experimental-strip-types scripts/e2e-ai-sdk.ts
import assert from "node:assert/strict";
import { asSchema } from "ai";
import { ncryptedTools } from "../packages/sdk/dist/ai-sdk.js";

const step = (s: string) => console.log(`✓ ${s}`);
const tools = ncryptedTools();
const opts = { toolCallId: "t1", messages: [] } as never;

for (const [name, t] of Object.entries(tools)) {
  const schema = (await asSchema(t.inputSchema).jsonSchema) as { type: string; properties: object };
  assert.equal(schema.type, "object", name);
  assert.ok(Object.keys(schema.properties).length > 0, name);
}
step(`${Object.keys(tools).length} tools with valid JSON schemas: ${Object.keys(tools).join(", ")}`);

const created = (await tools.ncrypted_create.execute!({ secret: "ai-sdk e2e", ttlSeconds: 300 }, opts)) as { link: string; id: string; receiptToken: string };
assert.ok(created.link, JSON.stringify(created));
step(`ncrypted_create -> ${created.link.split("#")[0]}`);
assert.equal(((await tools.ncrypted_status.execute!({ id: created.id, receiptToken: created.receiptToken }, opts)) as { status: string }).status, "pending");
assert.equal(await tools.ncrypted_read.execute!({ link: created.link }, opts), "ai-sdk e2e");
assert.match(String(await tools.ncrypted_read.execute!({ link: created.link }, opts)), /^Error: .*already been read/);
step("status, read once, second read returns an error string (no throw)");

const only = ncryptedTools({ include: ["ncrypted_read"] });
assert.deepEqual(Object.keys(only), ["ncrypted_read"]);
step("include filter works");
console.log("\nAll AI SDK tool checks passed.");
