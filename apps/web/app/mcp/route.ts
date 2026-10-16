import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/mcp";
import { PAY_TO } from "@/lib/x402";
import { error, publicOrigin, rateLimit } from "@/lib/http";

export const maxDuration = 60;

/** Hosted MCP endpoint (Streamable HTTP, stateless). */
async function handle(req: NextRequest) {
  if (!PAY_TO) return error("Service is not configured", 503);
  const limited = await rateLimit(req, "mcp");
  if (limited) return limited;
  const server = await buildMcpServer(publicOrigin(req));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
