import type { Metadata } from "next";
import Submit from "./submit";

export const metadata: Metadata = {
  title: "Secret request · ncrypted",
  robots: { index: false, follow: false },
};

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="viewer">
      <p className="brand"><a href="/">ncrypted</a></p>
      <Submit id={id} />
    </main>
  );
}
