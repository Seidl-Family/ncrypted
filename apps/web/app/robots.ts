import type { MetadataRoute } from "next";

const ORIGIN = (process.env.NCRYPTED_PUBLIC_URL ?? "https://ncrypted.ai").replace(/\/$/, "");

// Welcome search engines and AI crawlers to the docs; keep one-time secret, request and funding pages out.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/s/", "/r/", "/fund", "/api/"] },
      ...["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"].map(
        (userAgent) => ({ userAgent, allow: ["/", "/llms.txt", "/llms-full.txt", "/guides/", "/openapi.json"], disallow: ["/s/", "/r/", "/fund", "/api/"] }),
      ),
    ],
    sitemap: `${ORIGIN}/sitemap.xml`,
  };
}
