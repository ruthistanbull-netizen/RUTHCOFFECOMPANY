import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  ensureGmailAccessToken,
  getGmailThread,
  gmailHeader,
  gmailMessageText,
  makeMimeMessage,
  sendGmailMessage,
  type GmailMessage,
} from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTACT_REPLY_TEMPLATE_PREFIX = "contact_reply:";

type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  created_at: string | null;
  gmail_thread_id: string | null;
  gmail_last_message_id: string | null;
  gmail_synced_at: string | null;
};

type GmailIntegration = {
  id: string;
  provider: string;
  profile_id: string | null;
  email: string | null;
  sender_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  status: string | null;
};

type ConversationReply = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  fromEmail: string | null;
  toEmail: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return clean(value).toLocaleLowerCase("en-US");
}

function headerEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  const candidate = match?.[1] || value.split(",")[0] || "";
  return normalizeEmail(candidate.replace(/^mailto:/i, ""));
}

function safeDate(message: GmailMessage) {
  const internal = Number(message.internalDate || 0);
  if (Number.isFinite(internal) && internal > 0) return new Date(internal).toISOString();
  const header = gmailHeader(message.payload, "Date");
  const parsed = new Date(header);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function stripQuotedReply(value: string) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const marker = lines.findIndex((line) => {
    const text = line.trim();
    return /^On .+wrote:$/i.test(text)
      || /şunu yazdı:$/i.test(text)
      || /^-{2,}\s*Original Message\s*-{2,}$/i.test(text)
      || /^From:\s.+/i.test(text);
  });
  const body = (marker >= 0 ? lines.slice(0, marker) : lines).join("\n").trim();
  return body || String(value || "").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replyHtml(name: string | null, body: string) {
  const safeName = escapeHtml(clean(name) || "");
  const safeBody = escapeHtml(body).replace(/\n/g, "<br />");
  return `<div style="font-family:Arial,sans-serif;color:#2B2620;line-height:1.7;font-size:15px">
    <p>Merhaba${safeName ? ` ${safeName}` : ""},</p>
    <p>${safeBody}</p>
    <p>Sevgiler,<br/>ROSTA Coffee Co.</p>
    <p style="font-size:12px;color:#777">Bu e-posta rostacoffecompany.zeabur.app iletişim formunda bıraktığınız mesaja yanıt olarak gönderildi.</p>
  </div>`;
}

async function activeGmailIntegration(supabase: any, profileId: string) {
  const selection = "id,provider,profile_id,email,sender_name,access_token,refresh_token,expires_at,status,updated_at";
  const { data: own, error: ownError } = await supabase
    .from("email_integrations")
    .select(selection)
    .eq("profile_id", profileId)
    .eq("provider", "gmail")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ownError) throw new Error(ownError.message);
  if (own) return own as GmailIntegration;

  // Gmail is an operational panel connection, not a customer/account-specific
  // mailbox. If another admin connected the canonical Ruth Gmail, all admins may
  // use that same active connection from the protected admin routes.
  const { data: shared, error: sharedError } = await supabase
    .from("email_integrations")
    .select(selection)
    .eq("provider", "gmail")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sharedError) throw new Error(sharedError.message);
  return (shared || null) as GmailIntegration | null;
}

function isMissingGmailThreadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLocaleLowerCase("en-US");
  return normalized.includes("not found")
    || normalized.includes("requested entity was not found")
    || normalized.includes("404");
}

async function contactById(supabase: any, messageId: string) {
  const { data, error } = await supabase
    .from("contact_messages")
    .select("id,name,email,status,created_at,gmail_thread_id,gmail_last_message_id,gmail_synced_at")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data || null) as ContactRow | null;
}

async function storedReplies(supabase: any, messageId: string): Promise<ConversationReply[]> {
  const { data, error } = await supabase
    .from("contact_message_replies")
    .select("provider_message_id,direction,body,from_email,to_email,sent_at")
    .eq("contact_message_id", messageId)
    .order("sent_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    id: String(row.provider_message_id),
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    body: String(row.body || ""),
    createdAt: String(row.sent_at || new Date().toISOString()),
    fromEmail: row.from_email || null,
    toEmail: row.to_email || null,
  }));
}

function messageBelongsToContact(message: GmailMessage, gmailEmail: string, contactEmail: string) {
  const headers = [
    gmailHeader(message.payload, "From"),
    gmailHeader(message.payload, "To"),
    gmailHeader(message.payload, "Cc"),
  ].join(" ").toLocaleLowerCase("en-US");
  return headers.includes(gmailEmail) && headers.includes(contactEmail);
}

async function clearStaleThread(supabase: any, contactId: string) {
  const now = new Date().toISOString();
  await supabase
    .from("contact_messages")
    .update({ gmail_thread_id: null, gmail_last_message_id: null, gmail_synced_at: now, updated_at: now })
    .eq("id", contactId);
}

async function syncContactThread(
  supabase: any,
  contact: ContactRow,
  integration: GmailIntegration,
  accessToken: string,
) {
  const threadId = clean(contact.gmail_thread_id);
  if (!threadId) {
    return { replies: await storedReplies(supabase, contact.id), status: contact.status || "read", newInbound: false };
  }

  const gmailEmail = normalizeEmail(integration.email);
  const contactEmail = normalizeEmail(contact.email);
  let thread;
  try {
    thread = await getGmailThread(accessToken, threadId);
  } catch (error) {
    if (!isMissingGmailThreadError(error)) throw error;
    await clearStaleThread(supabase, contact.id);
    return { replies: await storedReplies(supabase, contact.id), status: contact.status || "read", newInbound: false };
  }

  const messages = [...(thread.messages || [])]
    .filter((message) => messageBelongsToContact(message, gmailEmail, contactEmail))
    .sort((left, right) => Number(left.internalDate || 0) - Number(right.internalDate || 0));

  const rows = messages.map((message) => {
    const fromHeader = gmailHeader(message.payload, "From");
    const toHeader = gmailHeader(message.payload, "To");
    const fromEmail = headerEmail(fromHeader);
    const direction = fromEmail === gmailEmail ? "outbound" : "inbound";
    return {
      contact_message_id: contact.id,
      direction,
      provider: "gmail",
      provider_message_id: message.id,
      provider_thread_id: message.threadId || threadId,
      from_email: fromEmail || null,
      to_email: headerEmail(toHeader) || null,
      body: stripQuotedReply(gmailMessageText(message)).slice(0, 12000) || "(Mesaj içeriği görüntülenemedi)",
      sent_at: safeDate(message),
    };
  });

  if (rows.length) {
    const { error } = await supabase
      .from("contact_message_replies")
      .upsert(rows, { onConflict: "provider,provider_message_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const latest = rows.at(-1) || null;
  const newInbound = Boolean(
    latest
    && latest.direction === "inbound"
    && latest.provider_message_id !== clean(contact.gmail_last_message_id)
  );
  const nextStatus = newInbound && clean(contact.status) !== "spam" ? "new" : (contact.status || "read");
  const update: Record<string, unknown> = {
    gmail_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (latest) update.gmail_last_message_id = latest.provider_message_id;
  if (nextStatus !== contact.status) update.status = nextStatus;

  const { error: updateError } = await supabase
    .from("contact_messages")
    .update(update)
    .eq("id", contact.id);
  if (updateError) throw new Error(updateError.message);

  return {
    replies: await storedReplies(supabase, contact.id),
    status: nextStatus,
    newInbound,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const messageId = clean(new URL(request.url).searchParams.get("message_id"));
  if (!messageId) return NextResponse.json({ ok: false, error: "Mesaj kimliği gerekli." }, { status: 400 });

  try {
    const contact = await contactById(auth.supabase, messageId);
    if (!contact) return NextResponse.json({ ok: false, error: "İletişim mesajı bulunamadı." }, { status: 404 });
    const integration = await activeGmailIntegration(auth.supabase, auth.profile.id);
    if (!integration) {
      return NextResponse.json({ ok: true, connected: false, replies: await storedReplies(auth.supabase, messageId), status: contact.status }, { headers: { "Cache-Control": "no-store" } });
    }
    const accessToken = await ensureGmailAccessToken(auth.supabase, integration);
    const synced = await syncContactThread(auth.supabase, contact, integration, accessToken);
    return NextResponse.json({ ok: true, connected: true, ...synced }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Gmail konuşması alınamadı." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const messageId = clean(body.message_id);
  const reply = clean(body.body).slice(0, 4000);
  if (!messageId || !reply) return NextResponse.json({ ok: false, error: "Mesaj ve yanıt metni gerekli." }, { status: 400 });

  try {
    const contact = await contactById(auth.supabase, messageId);
    if (!contact?.email) return NextResponse.json({ ok: false, error: "Müşteri e-posta adresi bulunamadı." }, { status: 404 });
    const integration = await activeGmailIntegration(auth.supabase, auth.profile.id);
    if (!integration?.email) return NextResponse.json({ ok: false, error: "Panelde aktif Gmail bağlantısı bulunamadı." }, { status: 400 });

    const accessToken = await ensureGmailAccessToken(auth.supabase, integration);
    let threadId = clean(contact.gmail_thread_id) || null;
    let inReplyTo = "";
    let references = "";
    if (threadId) {
      try {
        const thread = await getGmailThread(accessToken, threadId);
        const last = [...(thread.messages || [])].sort((left, right) => Number(left.internalDate || 0) - Number(right.internalDate || 0)).at(-1);
        if (last) {
          inReplyTo = gmailHeader(last.payload, "Message-ID");
          const previousReferences = gmailHeader(last.payload, "References");
          references = [previousReferences, inReplyTo].filter(Boolean).join(" ");
        }
      } catch (error) {
        if (!isMissingGmailThreadError(error)) throw error;
        // A thread id belongs to the Gmail account that created it. If the panel
        // Gmail was reconnected/replaced, start a fresh Gmail thread instead of
        // making the admin unable to reply to this customer forever.
        await clearStaleThread(auth.supabase, contact.id);
        threadId = null;
        inReplyTo = "";
        references = "";
      }
    }

    const subject = "Re: ROSTA Coffee Co. iletişim mesajınız";
    const mime = makeMimeMessage({
      fromEmail: integration.email,
      fromName: integration.sender_name || "ROSTA Coffee Co.",
      to: contact.email,
      subject,
      html: replyHtml(contact.name, reply),
      inReplyTo,
      references,
    });
    const sent = await sendGmailMessage(accessToken, mime, threadId);
    const sentAt = new Date().toISOString();

    const { error: contactError } = await auth.supabase
      .from("contact_messages")
      .update({
        gmail_thread_id: sent.threadId,
        gmail_last_message_id: sent.id,
        gmail_synced_at: sentAt,
        status: clean(contact.status) === "spam" ? "spam" : "read",
        updated_at: sentAt,
      })
      .eq("id", contact.id);
    if (contactError) throw new Error(contactError.message);

    const { error: replyError } = await auth.supabase.from("contact_message_replies").upsert({
      contact_message_id: contact.id,
      direction: "outbound",
      provider: "gmail",
      provider_message_id: sent.id,
      provider_thread_id: sent.threadId,
      from_email: integration.email,
      to_email: contact.email,
      body: reply,
      sent_at: sentAt,
    }, { onConflict: "provider,provider_message_id", ignoreDuplicates: true });
    if (replyError) throw new Error(replyError.message);

    await auth.supabase.from("email_logs").insert({
      provider: "gmail",
      profile_id: auth.profile.id,
      to_email: contact.email,
      subject,
      template_key: `${CONTACT_REPLY_TEMPLATE_PREFIX}${contact.id}`,
      status: "sent",
      gmail_message_id: sent.id,
      sent_at: sentAt,
    });

    const refreshed = await contactById(auth.supabase, contact.id);
    const synced = refreshed
      ? await syncContactThread(auth.supabase, refreshed, integration, accessToken).catch(async () => ({ replies: await storedReplies(auth.supabase, contact.id), status: "read", newInbound: false }))
      : { replies: await storedReplies(auth.supabase, contact.id), status: "read", newInbound: false };

    return NextResponse.json({ ok: true, sent: true, provider: "gmail", threadId: sent.threadId, ...synced }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Gmail yanıtı gönderilemedi." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const integration = await activeGmailIntegration(auth.supabase, auth.profile.id);
    if (!integration) return NextResponse.json({ ok: true, connected: false, synced: 0, newReplies: 0 });
    const accessToken = await ensureGmailAccessToken(auth.supabase, integration);
    const { data, error } = await auth.supabase
      .from("contact_messages")
      .select("id,name,email,status,created_at,gmail_thread_id,gmail_last_message_id,gmail_synced_at")
      .not("gmail_thread_id", "is", null)
      .order("gmail_synced_at", { ascending: true, nullsFirst: true })
      .limit(30);
    if (error) throw new Error(error.message);

    const contacts = (data || []) as ContactRow[];
    let synced = 0;
    let newReplies = 0;
    for (let index = 0; index < contacts.length; index += 5) {
      const chunk = contacts.slice(index, index + 5);
      const results = await Promise.allSettled(chunk.map((contact) => syncContactThread(auth.supabase, contact, integration, accessToken)));
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        synced += 1;
        if (result.value.newInbound) newReplies += 1;
      }
    }

    return NextResponse.json({ ok: true, connected: true, synced, newReplies }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Gmail cevapları senkronlanamadı." }, { status: 400 });
  }
}
