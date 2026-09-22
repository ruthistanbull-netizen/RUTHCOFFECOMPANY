import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isRuthieVoiceId } from "@/lib/ruthieVoices";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_TEXT = "Merhaba, ben ROSTA Insight. Bugün sana nasıl yardımcı olabilirim?";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => null) as { voice?: unknown } | null;
  if (!isRuthieVoiceId(body?.voice)) {
    return NextResponse.json({ ok: false, error: { message: "Geçerli bir ROSTA Insight sesi seç." } }, {
      status: 400,
      headers: noStoreHeaders(),
    });
  }

  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: { message: "OpenAI ses servisi yapılandırılmamış." } }, {
      status: 503,
      headers: noStoreHeaders(),
    });
  }

  const baseUrl = (clean(process.env.OPENAI_BASE_URL) || "https://api.openai.com").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(clean(process.env.OPENAI_PROJECT_ID) ? { "OpenAI-Project": clean(process.env.OPENAI_PROJECT_ID)! } : {}),
        ...(clean(process.env.OPENAI_ORGANIZATION_ID) ? { "OpenAI-Organization": clean(process.env.OPENAI_ORGANIZATION_ID)! } : {}),
      },
      body: JSON.stringify({
        model: clean(process.env.ROSTA_INSIGHT_TTS_MODEL) || "gpt-4o-mini-tts",
        voice: body.voice,
        input: PREVIEW_TEXT,
        response_format: "mp3",
        instructions: "Türkçe konuş. Sıcak, doğal, zarif ve profesyonel bir kadın asistan tonuyla söyle.",
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      return NextResponse.json({
        ok: false,
        error: { message: payload?.error?.message || "Ses örneği oluşturulamadı." },
      }, { status: response.status === 429 ? 429 : 502, headers: noStoreHeaders() });
    }

    const audio = await response.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        ...noStoreHeaders(),
        "Content-Type": response.headers.get("content-type") || "audio/mpeg",
        "Content-Length": String(audio.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: {
        message: error instanceof Error && error.name === "AbortError"
          ? "Ses örneği zaman aşımına uğradı."
          : error instanceof Error ? error.message : "Ses örneği oluşturulamadı.",
      },
    }, { status: 502, headers: noStoreHeaders() });
  } finally {
    clearTimeout(timeout);
  }
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
