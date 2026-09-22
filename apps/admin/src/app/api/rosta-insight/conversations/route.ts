import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  appendRuthieMessage,
  ensureRuthieConversation,
  listRuthieConversations,
  type RuthieStoredRole,
  type RuthieSurface,
} from "@/lib/ruthieConversationStore";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const url = new URL(request.url);
    const includeMessages = url.searchParams.get("include_messages") !== "0";
    const conversations = await listRuthieConversations({
      supabase: auth.supabase,
      profileId: String(auth.profile.id),
      includeMessages,
      limit: 60,
    });
    return NextResponse.json({ ok: true, conversations }, { headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const surface: RuthieSurface = body.surface === "voice" ? "voice" : "chat";
    const conversation = await ensureRuthieConversation({
      supabase: auth.supabase,
      profileId: String(auth.profile.id),
      conversationId: typeof body.id === "string" ? body.id : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      surface,
    });

    const imported = [];
    const messages = Array.isArray(body.messages) ? body.messages.slice(-80) : [];
    for (const entry of messages) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const item = entry as Record<string, unknown>;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) continue;
      const role: RuthieStoredRole = item.role === "assistant" || item.role === "system" ? item.role : "user";
      imported.push(await appendRuthieMessage({
        supabase: auth.supabase,
        profileId: String(auth.profile.id),
        conversationId: String(conversation.id),
        role,
        surface: item.surface === "voice" ? "voice" : surface,
        text,
        clientMessageId: typeof item.id === "string" ? item.id : undefined,
        metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? item.metadata as Record<string, unknown>
          : {},
      }));
    }

    return NextResponse.json({
      ok: true,
      conversation: {
        id: String(conversation.id),
        title: String(conversation.title),
        lastSurface: conversation.last_surface,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        messages: imported,
      },
    }, { status: 201, headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  return NextResponse.json({
    ok: false,
    error: { message: error instanceof Error ? error.message : "ROSTA Insight sohbetleri işlenemedi." },
  }, { status: 400, headers: noStoreHeaders() });
}
