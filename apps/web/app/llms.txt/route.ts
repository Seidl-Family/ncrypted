import { NextRequest } from "next/server";
import { llmsTxt } from "@/lib/docs";
import { publicOrigin } from "@/lib/http";

export function GET(req: NextRequest) {
  return new Response(llmsTxt(publicOrigin(req)), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
