import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Activity = {
  key: string;
  kind: "contact" | "reply";
  contactMessageId: string;
  sender: string;
  email: string | null;
  preview: string;
  occurredAt: string;
};

function asTime(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const [contactResult, replyResult] = await Promise.all([
    auth.supabase
      .from("contact_messages")
      .select("id,name,email,message,created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    auth.supabase
      .from("contact_message_replies")
      .select("contact_message_id,provider_message_id,body,from_email,sent_at")
      .eq("direction", "inbound")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (contactResult.error) {
    return NextResponse.json({ ok: false, error: contactResult.error.message }, { status: 400 });
  }

  const latestContact = contactResult.data;
  const latestReply = replyResult.error ? null : replyResult.data;

  const contactActivity: Activity | null = latestContact?.id ? {
    key: `contact:${latestContact.id}`,
    kind: "contact",
    contactMessageId: String(latestContact.id),
    sender: clean(latestContact.name) || clean(latestContact.email) || "Yeni müşteri",
    email: clean(latestContact.email) || null,
    preview: clean(latestContact.message).slice(0, 180) || "Yeni bir iletişim mesajı geldi.",
    occurredAt: String(latestContact.created_at || new Date(0).toISOString()),
  } : null;

  const replyActivity: Activity | null = latestReply?.contact_message_id && latestReply?.provider_message_id ? {
    key: `reply:${latestReply.provider_message_id}`,
    kind: "reply",
    contactMessageId: String(latestReply.contact_message_id),
    sender: clean(latestReply.from_email) || "Müşteri",
    email: clean(latestReply.from_email) || null,
    preview: clean(latestReply.body).slice(0, 180) || "Müşteriden yeni bir e-posta cevabı geldi.",
    occurredAt: String(latestReply.sent_at || new Date(0).toISOString()),
  } : null;

  const activity = asTime(replyActivity?.occurredAt) > asTime(contactActivity?.occurredAt)
    ? replyActivity
    : contactActivity;

  return NextResponse.json(
    { ok: true, activity },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
