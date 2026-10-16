// End-to-end test of the hosted MCP endpoint with an x402-paying MCP client. Pays real USDC on the server's network.
// Usage: node --env-file=.env.e2e --experimental-strip-types scripts/e2e-mcp.ts [mcpUrl]
import assert from "node:assert/strict";
import { createx402MCPClient } from "@x402/mcp";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { privateKeyToAccount } from "viem/accounts";

const url = new URL(process.argv[2] ?? `${process.env.NCRYPTED_URL}/mcp`);
const account = privateKeyToAccount(process.env.NCRYPTED_WALLET_PRIVATE_KEY as `0x${string}`);
const step = (s: string) => console.log(`✓ ${s}`);
const textOf = (r: { content?: unknown }) => ((r.content as { text: string }[])[0]?.text ?? "");

// A client without a wallet gets a payment-required result, not a secret.
const plain = new Client({ name: "e2e-plain", version: "1" });
await plain.connect(new StreamableHTTPClientTransport(url));
const tools = (await plain.listTools()).tools.map((t) => t.name).sort();
assert.deepEqual(tools, ["ncrypted_burn", "ncrypted_create", "ncrypted_read", "ncrypted_status"]);
step(`tools: ${tools.join(", ")}`);
// Unpaid calls use the free tier until it runs out, then get an x402 PaymentRequired.
let unpaid;
let freeUsed = 0;
for (let i = 0; i < 10; i++) {
  unpaid = await plain.callTool({ name: "ncrypted_create", arguments: { secret: "x", ttl_seconds: 300 } });
  if (unpaid.isError) break;
  assert.equal(JSON.parse(textOf(unpaid)).free, true);
  freeUsed++;
}
assert.equal(unpaid!.isError, true);
assert.match(textOf(unpaid!), /"accepts"/);
step(`unpaid creates: ${freeUsed} free, then x402 PaymentRequired`);

const client = createx402MCPClient({
  name: "e2e-paying",
  version: "1",
  schemes: [{ network: "eip155:*", client: new ExactEvmScheme(account) }],
  autoPayment: true,
  onPaymentRequested: async () => true,
});
await client.connect(new StreamableHTTPClientTransport(url));

const secret = `hosted mcp ${crypto.randomUUID()}`;
const created = await client.callTool("ncrypted_create", { secret, ttl_seconds: 600, passphrase: "pw" });
assert.ok(!created.isError, textOf(created));
const { link, id, receiptToken } = JSON.parse(textOf(created));
step(`created ${id} (tx ${created.paymentResponse?.transaction ?? "n/a"})`);

const wrong = await plain.callTool({ name: "ncrypted_read", arguments: { link, passphrase: "nope" } });
assert.equal(wrong.isError, true);
const still = await plain.callTool({ name: "ncrypted_status", arguments: { id, receiptToken } });
assert.equal(JSON.parse(textOf(still)).status, "pending");
step("wrong passphrase does not consume the secret");

const read = await plain.callTool({ name: "ncrypted_read", arguments: { link, passphrase: "pw" } });
assert.equal(textOf(read), secret);
step("read returns the plaintext");
const again = await plain.callTool({ name: "ncrypted_read", arguments: { link, passphrase: "pw" } });
assert.match(textOf(again), /already been read/);
step("second read is rejected");

const foreign = await plain.callTool({ name: "ncrypted_read", arguments: { link: "https://evil.example/s/AAAAAAAAAAAAAAAAAAAAAA#k" } });
assert.match(textOf(foreign), /only opens/);
step("links for other hosts are refused");

await client.close();
await plain.close();
console.log("\nAll hosted MCP checks passed (1 paid secret).");
