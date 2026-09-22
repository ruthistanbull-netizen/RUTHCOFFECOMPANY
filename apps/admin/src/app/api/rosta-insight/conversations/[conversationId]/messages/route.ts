import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  appendRuthieMessage,
  loadRuthieMessages,
  type RuthieStoredRole,
  type RuthieSurface,
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
    const messages = await loadRuthieMessages({
      supabase: auth.supabase,
      profileId: String(auth.profile.id),
      conversationId,
      limit: 120,
    });
    return NextResponse.json({ ok: true, messages }, { headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const { conversationId } = await context.params;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const role: RuthieStoredRole = body.role === "assistant" || body.role === "system" ? body.role : "user";
    const surface: RuthieSurface = body.surface === "voice" ? "voice" : "chat";
    const message = await appendRuthieMessage({
      supabase: auth.supabase,
      profileId: String(auth.profile.id),
      conversationId,
      role,
      surface,
      text: typeof body.text === "string" ? body.text : "",
      clientMessageId: typeof body.clientMessageId === "string" ? body.clientMessageId : undefined,
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : {},
    });
    return NextResponse.json({ ok: true, message }, { status: 201, headers: noStoreHeaders() });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  return NextResponse.json({
    ok: false,
    error: { message: error instanceof Error ? error.message : "ROSTA Insight mesajı işlenemedi." },
  }, { status: 400, headers: noStoreHeaders() });
}
