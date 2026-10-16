import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GUIDES, guideBySlug } from "@/lib/guides";

export const dynamicParams = false;
export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  return g ? { title: `${g.title} · ncrypted`, description: g.summary } : {};
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  return (
    <main>
      <p className="brand"><a href="/">ncrypted</a> / <a href="/guides">guides</a></p>
      <h1>{g.title}</h1>
      <p>{g.summary}</p>
      {g.sections.map((s, i) => (
        <section key={i}>
          {s.heading && <h2>{s.heading}</h2>}
          {s.text && <p>{s.text}</p>}
          {s.code && <pre>{s.code}</pre>}
        </section>
      ))}
    </main>
  );
}
