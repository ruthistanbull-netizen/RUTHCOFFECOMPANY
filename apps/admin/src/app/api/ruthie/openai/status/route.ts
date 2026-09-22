import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const configured = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
  const model = String(process.env.ROSTA_CHAT_MODEL || process.env.RUTHIE_CHAT_MODEL || "gpt-5.6-luna").trim();

  return NextResponse.json({
    ok: true,
    configured,
    missing: configured ? [] : ["OPENAI_API_KEY"],
    models: { chat: configured ? model : null, image: "gpt-image-2" },
    capabilities: {
      chat: configured,
      vision: configured,
      files: configured,
      toolCalling: false,
      imageGeneration: configured,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
