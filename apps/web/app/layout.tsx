import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ncrypted",
  description: "One-time, end-to-end encrypted secrets for AI agents. 0.005 USDC per secret via x402.",
  metadataBase: new URL(process.env.NCRYPTED_PUBLIC_URL ?? "https://ncrypted-ai.vercel.app"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
