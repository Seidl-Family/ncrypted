import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";

const ORIGIN = (process.env.NCRYPTED_PUBLIC_URL ?? "https://ncrypted.ai").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/guides", ...GUIDES.map((g) => `/guides/${g.slug}`), "/llms.txt", "/llms-full.txt", "/openapi.json", "/privacy", "/terms"];
  return paths.map((p) => ({ url: `${ORIGIN}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.6 }));
}
