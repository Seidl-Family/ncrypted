import { NextRequest } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { authorize, json, error, publicOrigin, rateLimit } from "@/lib/http";
import { clientName, track } from "@/lib/usage";

const Body = z.object({
  to: z.email(),
  link: z.string().max(300),
  note: z.string().max(200).optional(),
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Emails the share link once. Creator only, and only while the secret is unread.
 * The link (with key) passes through this request but is never stored or logged.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimit(req, "email");
  if (limited) return limited;
  const { id } = await params;
  const meta = await authorize(req, id);
  if (meta instanceof Response) return meta;

  if (meta.free) return error("Email delivery is only available for paid secrets (not the free tier)", 402);
  if (!process.env.RESEND_API_KEY) return error("Email delivery is not enabled on this server", 503);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request: expected {to, link, note?}", 400);
  const { to, link, note } = parsed.data;
  if (!new RegExp(`^${publicOrigin(req).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/s/${id}#[A-Za-z0-9_-]{43}$`).test(link)) {
    return error("link must be this secret's share link", 400);
  }

  const store = getStore();
  if (meta.status !== "pending" || !(await store.exists(id))) return error("Secret is no longer available", 410);
  if (!(await store.claimEmail(id))) return error("This secret has already been emailed", 409);

  const expires = new Date(meta.expiresAt).toUTCString();
  const { error: sendError } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM ?? "ncrypted <secrets@ncrypted.ai>",
    to,
    subject: "Someone shared a one-time secret with you",
    text: `${note ? `${note}\n\n` : ""}Open this link to view the secret. It can be viewed only once, then it is destroyed:\n\n${link}\n\nExpires ${expires}.\n\nSent with ncrypted (end-to-end encrypted, one-time secrets).`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
<h2 style="margin:0 0 12px">You've received a one-time secret</h2>
${note ? `<p style="padding:12px;background:#f4f4f5;border-radius:8px">${esc(note)}</p>` : ""}
<p>It can be viewed <b>only once</b>, then it is permanently destroyed.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">View secret</a></p>
<p style="color:#666;font-size:13px">Expires ${esc(expires)}. If you weren't expecting this, ignore it.</p>
<p style="color:#999;font-size:12px">Sent with ncrypted, end-to-end encrypted one-time secrets.</p></div>`,
  });
  if (sendError) return error(`Email failed: ${sendError.message}`, 502);
  await store.updateMeta(id, { emailed: true });
  await track("emailed", clientName(req));
  return json({ emailed: true });
}
