import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { requireRuthieOpenAIConfig, RuthieOpenAIError } from "@/lib/ruthieOpenAI";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_TIMEOUT_MS = 15_000;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let config;
  try {
    config = requireRuthieOpenAIConfig();
  } catch (error) {
    return providerError(error);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${config.baseUrl}/v1/models/${encodeURIComponent(config.chatModel)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...(config.project ? { "OpenAI-Project": config.project } : {}),
          ...(config.organization ? { "OpenAI-Organization": config.organization } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );

    const requestId = response.headers.get("x-request-id");
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: { message?: unknown } };
      const message = typeof payload.error?.message === "string"
        ? payload.error.message
        : `OpenAI model doğrulaması ${response.status} durumuyla başarısız oldu.`;
      return NextResponse.json({
        ok: false,
        provider: "openai",
        configured: true,
        reachable: response.status !== 401 && response.status !== 403,
        authorized: response.status !== 401 && response.status !== 403,
        modelAvailable: false,
        model: config.chatModel,
        error: message,
        requestId,
        secretExposed: false,
      }, { status: response.status === 429 ? 429 : 502, headers: noStoreHeaders() });
    }

    const payload = await response.json().catch(() => ({})) as { id?: unknown; owned_by?: unknown };
    return NextResponse.json({
      ok: true,
      provider: "openai",
      configured: true,
      reachable: true,
      authorized: true,
      modelAvailable: payload.id === config.chatModel,
      model: typeof payload.id === "string" ? payload.id : config.chatModel,
      ownedBy: typeof payload.owned_by === "string" ? payload.owned_by : null,
      requestId,
      secretExposed: false,
      checkedAt: new Date().toISOString(),
    }, { headers: noStoreHeaders() });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({
        ok: false,
        provider: "openai",
        configured: true,
        reachable: false,
        authorized: false,
        modelAvailable: false,
        model: config.chatModel,
        error: "OpenAI bağlantı doğrulaması zaman aşımına uğradı.",
        secretExposed: false,
      }, { status: 504, headers: noStoreHeaders() });
    }
    return NextResponse.json({
      ok: false,
      provider: "openai",
      configured: true,
      reachable: false,
      authorized: false,
      modelAvailable: false,
      model: config.chatModel,
      error: error instanceof Error ? error.message : "OpenAI bağlantısı doğrulanamadı.",
      secretExposed: false,
    }, { status: 502, headers: noStoreHeaders() });
  } finally {
    clearTimeout(timer);
  }
}

function providerError(error: unknown) {
  const normalized = error instanceof RuthieOpenAIError
    ? error
    : new RuthieOpenAIError({
        code: "ROSTA INSIGHT_OPENAI_VERIFY_FAILED",
        message: error instanceof Error ? error.message : "OpenAI yapılandırması doğrulanamadı.",
        status: 503,
      });

  return NextResponse.json({
    ok: false,
    provider: "openai",
    configured: false,
    reachable: false,
    authorized: false,
    modelAvailable: false,
    error: normalized.message,
    code: normalized.code,
    secretExposed: false,
  }, { status: normalized.status, headers: noStoreHeaders() });
}
