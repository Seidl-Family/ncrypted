import type { Metadata } from "next";
import Reveal from "./reveal";

export const metadata: Metadata = {
  title: "One-time secret · ncrypted",
  robots: { index: false, follow: false },
};

export default async function SecretPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="viewer">
      <p className="brand">ncrypted</p>
      <Reveal id={id} />
    </main>
  );
}
