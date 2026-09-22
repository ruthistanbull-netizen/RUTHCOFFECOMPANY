import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  buildRuthieUnifiedContext,
  deleteRuthieConversation,
  ensureRuthieConversation,
  renameRuthieConversation,
} from "@/lib/ruthieConversationStore";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const { conversationId } = await context.params;
    const conversation = await ensureRuthieConversation({
      supabase: auth.supabase,
      profileId: String(auth.profile.id),
      conversationId,
      surface: "chat",
    });
    const unified = await buildRuthieUnifiedContext({
      supabase: auth.supabase,
      profileId: String(auth.profile.id),
      conversationId: String(conversation.id),
    });
    return NextResponse.json({
      ok: true,
      conversation: {
        id: String(conversation.id),
        title: String(conversation.title),
        lastSurface: conversation.last_surface,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        messages: unified.messages,
      },
      memories: unified.memories,
      context: unified.context,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const { conversationId } = await context.params;
    const body = await request.json().catch(() => ({})) as { title?: unknown };
    const conversation = await renameRuthieConversation({
      supabase: auth.supabase,
      profileId: String(auth.profile.id),
      conversationId,
      title: typeof body.title === "string" ? body.title : "",
    });
    return NextResponse.json({ ok: true, conversation }, { headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const { conversationId } = await context.params;
    await deleteRuthieConversation({
      supabase: auth.supabase,
      profileId: String(auth.profile.id),
      conversationId,
    });
    return NextResponse.json({ ok: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  return NextResponse.json({
    ok: false,
    error: { message: error instanceof Error ? error.message : "ROSTA Insight sohbeti işlenemedi." },
  }, { status: 400, headers: noStoreHeaders() });
}
