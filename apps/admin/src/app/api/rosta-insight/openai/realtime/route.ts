import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { RuthieOpenAIError } from "@/lib/ruthieOpenAI";
import { buildRuthiePanelSnapshot } from "@/lib/ruthiePanelContext";
import { createRuthieRealtimeCallV2 } from "@/lib/ruthieRealtimeCallV2";
import { RuthieRuntimeError } from "@/lib/ruthieRuntime";
import { normalizeRuthieVoice, RUTHIE_VOICE_COOKIE } from "@/lib/ruthieVoices";
import { noStoreHeaders } from "@/lib/websiteRevalidate";
import { consumeRuthieProviderUsage } from "@/lib/ruthieUsageGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const correlationId = normalizeCorrelationId(request.headers.get("x-correlation-id"));
  const usage = consumeRuthieProviderUsage({ actorId: String(auth.profile.id), kind: "realtime" });
  if (!usage.allowed) {
    return NextResponse.json({
      ok: false,
      error: {
        code: usage.limit === "daily" ? "ROSTA_INSIGHT_DAILY_USAGE_LIMIT" : "ROSTA_INSIGHT_RATE_LIMIT",
        message: usage.limit === "daily"
          ? "ROSTA Insight için günlük sesli bağlantı sınırına ulaşıldı."
          : "Çok sık sesli bağlantı başlatıldı. Kısa süre sonra yeniden dene.",
        retryable: true,
        correlationId,
        retryAfterSeconds: usage.retryAfterSeconds,
      },
    }, {
      status: 429,
      headers: { ...noStoreHeaders(), "Retry-After": String(usage.retryAfterSeconds) },
    });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/sdp")) {
      throw new RuthieRuntimeError({
        code: "ROSTA_INSIGHT_REALTIME_CONTENT_TYPE_REQUIRED",
        message: "Realtime bağlantısı application/sdp içeriğiyle başlatılmalıdır.",
        status: 415,
      });
    }

    const offerSdp = await request.text();
    const panelSnapshot = await buildRuthiePanelSnapshot(auth.supabase);
    const requestedVoice = (request.headers.get("x-rosta-insight-voice") || request.headers.get("x-ruthie-voice")) || cookieValue(request.headers.get("cookie"), RUTHIE_VOICE_COOKIE);
    const call = await createRuthieRealtimeCallV2({
      offerSdp,
      panelSnapshot,
      voice: normalizeRuthieVoice(requestedVoice),
      actor: {
        profileId: String(auth.profile.id),
        fullName: auth.profile.full_name,
        email: auth.profile.email,
      },
    });
    const headers = new Headers({
      ...noStoreHeaders(),
      "Content-Type": "application/sdp",
      "X-Correlation-Id": correlationId,
      "X-ROSTA-Insight-Actor-Id": String(auth.profile.id),
      "X-ROSTA-Insight-Actor-Name": encodeURIComponent(String(auth.profile.full_name || "Admin")),
      "X-ROSTA-Insight-Actor-Email": encodeURIComponent(String(auth.profile.email || "")),
      "X-ROSTA-Insight-Voice": normalizeRuthieVoice(requestedVoice),
    });
    if (call.location) headers.set("X-ROSTA-Insight-Realtime-Location", call.location);
    if (call.requestId) headers.set("X-OpenAI-Request-Id", call.requestId);

    return new Response(call.answerSdp, { status: 201, headers });
  } catch (error) {
    return runtimeErrorResponse(error, correlationId);
  }
}

function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of cookieHeader.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return "";
}

function runtimeErrorResponse(error: unknown, correlationId: string) {
  if (error instanceof RuthieRuntimeError || error instanceof RuthieOpenAIError) {
    return NextResponse.json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        correlationId,
        requestId: error.requestId,
      },
    }, { status: error.status, headers: noStoreHeaders() });
  }

  return NextResponse.json({
    ok: false,
    error: {
      code: "ROSTA_INSIGHT_REALTIME_UNEXPECTED_ERROR",
      message: error instanceof Error ? error.message : "ROSTA Insight sesli bağlantısı başlatılamadı.",
      retryable: false,
      correlationId,
    },
  }, { status: 500, headers: noStoreHeaders() });
}

function normalizeCorrelationId(value: string | null): string {
  const normalized = value?.trim().slice(0, 128);
  return normalized || crypto.randomUUID();
}
