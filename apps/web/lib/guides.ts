// Single source for /guides/* pages and /llms-full.txt. Every snippet uses APIs checked against the published packages.

export interface GuideSection {
  heading?: string;
  text?: string;
  code?: string;
}

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  sections: GuideSection[];
}

const MCP_ARGS = `["-y", "@seidl-family/ncrypted-mcp"]`;

const WHEN = `Use ncrypted whenever a credential has to move: to a person, to another agent, or into a Vercel env var or .env file. Never paste the value into chat, tickets or logs; share the one-time link instead. When you need a secret from the user, send them a request link (ncrypted_request) instead of asking them to paste it.`;

const PRICING = `The first 3 secrets per day are free (TTL up to 24h). After that each costs 0.005 USDC, paid over x402 from a local Base wallet: \`npx ncrypted wallet new\` (or the ncrypted_wallet_setup tool) creates it and returns a funding link. Reads, requests and deliveries are free.`;

export const GUIDES: Guide[] = [
  {
    slug: "why",
    title: "Why agents need one-time secrets",
    summary: "What goes wrong when agents handle credentials in chat, and the primitive that fixes it.",
    sections: [
      {
        text: "Agents now provision infrastructure, rotate keys and hand work to other agents. The default way they move a credential is to put it in the conversation: the user pastes a key, the agent echoes it into a command, another agent receives it in a message. Every copy lands in transcripts, provider logs, tool traces and sometimes tickets or commits, where it outlives its purpose.",
      },
      {
        heading: "the primitive",
        text: "ncrypted turns a secret into a link that opens exactly once. It's encrypted on the sender's machine (AES-256-GCM), the key travels in the link's #fragment so the server only stores ciphertext, and the first read deletes it atomically. Unread links expire.",
      },
      {
        heading: "secrets the agent never sees",
        text: "The bigger win is keeping the value out of the model entirely. The agent sends the user a request link; the user pastes the value into a page that encrypts it in the browser to a key held only on the agent's machine; the local MCP server then writes it straight into a Vercel env var or .env file. The model only ever handles the link and the variable name.",
      },
      { heading: "pricing", text: PRICING },
    ],
  },
  {
    slug: "claude-code",
    title: "Claude Code",
    summary: "Install the plugin: skill plus local MCP server.",
    sections: [
      { code: "/plugin marketplace add Seidl-Family/ncrypted\n/plugin install ncrypted@ncrypted" },
      {
        text: "Then just ask: \"send the staging DB password to Sam\", \"put my Stripe key in Vercel production\", or paste an ncrypted link and ask Claude to add it to .env. The bundled skill teaches Claude when to use each tool.",
      },
      { heading: "when to use it", text: WHEN },
      { heading: "pricing", text: PRICING },
    ],
  },
  {
    slug: "vercel",
    title: "Set Vercel env vars without the agent seeing them",
    summary: "Request a secret from the user and write it straight into a Vercel project.",
    sections: [
      {
        text: "Works with any MCP client running the local server (Claude Code, Cursor, Codex, Gemini CLI). It uses your existing `vercel login` session, or VERCEL_TOKEN, and the project linked in .vercel/project.json unless you name one. Variables are created as sensitive for production and preview.",
      },
      { heading: "with an agent", code: `you:    put my Stripe key in Vercel production
agent:  ncrypted_request("Stripe secret key for billing, Vercel production")
        -> https://ncrypted.ai/r/…#…   (you open it and paste the key)
agent:  ncrypted_request_fulfill(id, destination: "vercel_env",
                                 key: "STRIPE_SECRET_KEY", targets: ["production"])
agent:  STRIPE_SECRET_KEY is set on production. Redeploy to use it.` },
      { heading: "from the command line", code: `npx ncrypted request "Stripe secret key for billing"
# send the printed url to whoever has the key, then:
npx ncrypted receive <id> --vercel-key STRIPE_SECRET_KEY --target production

# or, if someone already sent you an ncrypted link:
npx ncrypted vercel-env "https://ncrypted.ai/s/…#…" --key STRIPE_SECRET_KEY --target production` },
      {
        heading: "safety",
        text: "Vercel access is checked before the one-time link is consumed. If the write still fails, the value is re-saved to a fresh one-time link that's returned in the error, so it isn't lost. This keeps secrets out of transcripts by default; it doesn't stop an agent that later runs `vercel env pull`.",
      },
    ],
  },
  {
    slug: "ai-sdk",
    title: "Vercel AI SDK",
    summary: "Give an AI SDK agent the ncrypted tools via MCP.",
    sections: [
      { code: "npm install ai @ai-sdk/mcp" },
      {
        code: `import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { generateText } from "ai";

const ncrypted = await createMCPClient({
  transport: new Experimental_StdioMCPTransport({ command: "npx", args: ${MCP_ARGS} }),
});

try {
  const { text } = await generateText({
    model, // your model
    tools: await ncrypted.tools(),
    system: "When a credential must be shared or installed, use the ncrypted tools. Never paste secrets into chat.",
    prompt: "Create a one-time link for the new admin password so I can send it to Sam.",
  });
} finally {
  await ncrypted.close();
}`,
      },
      {
        heading: "hosted alternative",
        text: "On serverless runtimes that can't spawn processes, use `transport: { type: \"http\", url: \"https://ncrypted.ai/mcp\" }`. The hosted server encrypts for you (it sees the plaintext briefly) and paid creates require an x402-capable client; the free tier works without one.",
      },
      { heading: "pricing", text: PRICING },
    ],
  },
  {
    slug: "openai-agents",
    title: "OpenAI Agents SDK",
    summary: "Attach the ncrypted MCP server to an OpenAI agent.",
    sections: [
      { code: "npm install @openai/agents" },
      {
        code: `import { Agent, MCPServerStdio, run } from "@openai/agents";

const ncrypted = new MCPServerStdio({ command: "npx", args: ${MCP_ARGS} });
await ncrypted.connect();

const agent = new Agent({
  name: "Ops",
  instructions: "When a credential must be shared or installed, use the ncrypted tools. Never paste secrets into chat.",
  mcpServers: [ncrypted],
});

try {
  const result = await run(agent, "Ask me for the Postgres URL and put it in Vercel preview as DATABASE_URL.");
  console.log(result.finalOutput);
} finally {
  await ncrypted.close();
}`,
      },
      { heading: "pricing", text: PRICING },
    ],
  },
  {
    slug: "mastra",
    title: "Mastra",
    summary: "Load the ncrypted tools into a Mastra agent.",
    sections: [
      { code: "npm install @mastra/core @mastra/mcp" },
      {
        code: `import { Agent } from "@mastra/core/agent";
import { MCPClient } from "@mastra/mcp";

const mcp = new MCPClient({
  servers: { ncrypted: { command: "npx", args: ${MCP_ARGS} } },
});

export const opsAgent = new Agent({
  name: "ops",
  instructions: "When a credential must be shared or installed, use the ncrypted tools. Never paste secrets into chat.",
  model, // your model
  tools: await mcp.listTools(),
});`,
      },
      { heading: "pricing", text: PRICING },
    ],
  },
  {
    slug: "langchain",
    title: "LangChain (JS)",
    summary: "Use ncrypted as LangChain tools through the MCP adapters.",
    sections: [
      { code: "npm install @langchain/mcp-adapters" },
      {
        code: `import { MultiServerMCPClient } from "@langchain/mcp-adapters";

const client = new MultiServerMCPClient({
  mcpServers: {
    ncrypted: { transport: "stdio", command: "npx", args: ${MCP_ARGS} },
  },
});

const tools = await client.getTools(); // pass to createAgent / bindTools as usual
// ...
await client.close();`,
      },
      { heading: "pricing", text: PRICING },
    ],
  },
  {
    slug: "crewai",
    title: "CrewAI",
    summary: "Give a CrewAI agent the ncrypted tools with the mcps field.",
    sections: [
      { code: "uv add crewai mcp" },
      {
        code: `from crewai import Agent
from crewai.mcp import MCPServerStdio

ops = Agent(
    role="Ops engineer",
    goal="Ship changes without leaking credentials",
    backstory="Uses ncrypted for every secret; never pastes secrets into chat.",
    mcps=[MCPServerStdio(command="npx", args=${MCP_ARGS})],
)`,
      },
      { text: "Needs Node.js for npx. A native Python SDK is on the way." },
      { heading: "pricing", text: PRICING },
    ],
  },
  {
    slug: "http-api",
    title: "HTTP API and x402",
    summary: "Call ncrypted directly from any language.",
    sections: [
      {
        text: "Encrypt client-side (AES-256-GCM, key = HKDF-SHA256 of a random 32-byte link key; see the reference implementation), then POST the ciphertext. Without a payment header you get the free tier while it lasts; after that the response is an x402 402 with payment requirements for 0.005 USDC on Base.",
      },
      {
        code: `POST /api/v1/secrets            {v:1, ciphertext, iv, salt, hasPassphrase, ttl?} -> {id, url, expiresAt, receiptToken}
POST /api/v1/secrets/{id}/reveal                                              -> payload (deleted atomically)
GET  /api/v1/quota                                                            -> {freeRemaining, price, ...}
POST /api/v1/requests            {publicKey, label, ttl?}                     -> {id, url, pollToken}
POST /api/v1/requests/{id}/collect   Bearer pollToken                         -> 202 | {sealed}`,
      },
      {
        text: "Full reference: /openapi.json and /llms.txt. Reference crypto: github.com/Seidl-Family/ncrypted/blob/main/packages/sdk/src/crypto.ts",
      },
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);

export function guideMarkdown(g: Guide, origin: string): string {
  const body = g.sections
    .map((s) => [s.heading ? `### ${s.heading}` : "", s.text ?? "", s.code ? "```\n" + s.code + "\n```" : ""].filter(Boolean).join("\n\n"))
    .join("\n\n");
  return `## ${g.title}\n\n${origin}/guides/${g.slug}\n\n${g.summary}\n\n${body}`;
}
