import type { Metadata } from "next";
import { GUIDES } from "@/lib/guides";

export const metadata: Metadata = { title: "Guides · ncrypted", description: "Use ncrypted with Claude Code, Vercel, AI SDK, OpenAI Agents, Mastra, LangChain and CrewAI." };

export default function Guides() {
  return (
    <main>
      <p className="brand"><a href="/">ncrypted</a></p>
      <h1>Guides</h1>
      <table>
        <tbody>
          {GUIDES.map((g) => (
            <tr key={g.slug}>
              <td><a href={`/guides/${g.slug}`}>{g.title}</a></td>
              <td>{g.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>All guides in one file for agents: <a href="/llms-full.txt">/llms-full.txt</a></p>
    </main>
  );
}
