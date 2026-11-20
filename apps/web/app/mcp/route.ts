import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/mcp";
import { PAY_TO } from "@/lib/x402";
import { error, publicOrigin, rateLimit } from "@/lib/http";
import { clientIp, clientName } from "@/lib/usage";

export const maxDuration = 60;

/** Hosted MCP endpoint (Streamable HTTP, stateless). */
async function handle(req: NextRequest) {
  if (!PAY_TO) return error("Service is not configured", 503);
  const limited = await rateLimit(req, "mcp");
  if (limited) return limited;
  const server = await buildMcpServer(publicOrigin(req), { ip: clientIp(req), client: clientName(req, "hosted-mcp") });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

/**
 * Stateless server: there is no session to stream to or terminate. The spec lets a server answer
 * GET (the standalone SSE stream) and DELETE (session end) with 405. Handing GET to the transport
 * instead opens an SSE stream that never closes, so every client that probes it hangs until the
 * 60s function timeout.
 */
function notAllowed() {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This MCP server is stateless; send JSON-RPC with POST." }, id: null }),
    { status: 405, headers: { Allow: "POST", "Content-Type": "application/json" } },
  );
}

export { handle as POST, notAllowed as GET, notAllowed as DELETE };
