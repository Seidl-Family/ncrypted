import { NextRequest } from "next/server";
import { llmsTxt } from "@/lib/docs";
import { GUIDES, guideMarkdown } from "@/lib/guides";
import { publicOrigin } from "@/lib/http";

export function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const body = `${llmsTxt(origin)}\n# Guides\n\n${GUIDES.map((g) => guideMarkdown(g, origin)).join("\n\n---\n\n")}\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
