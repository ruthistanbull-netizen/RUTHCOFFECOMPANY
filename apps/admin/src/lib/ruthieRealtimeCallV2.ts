import {
  buildRuthieActorIdentityContext,
  RUTHIE_IDENTITY_GUIDE,
  RUTHIE_STRICT_BEHAVIOR_GUIDE,
  RUTHIE_TRANSCRIPTION_PROMPT,
  RUTHIE_VOICE_ANALYSIS_GUIDE,
  type RuthieActorIdentity,
} from "@/lib/ruthieBehavior";
import { RUTHIE_SPEAKING_STYLE } from "@/lib/ruthieCapabilityGuide";
import type { RuthiePanelSnapshot } from "@/lib/ruthiePanelContext";
import { serializeRuthiePanelSnapshot } from "@/lib/ruthiePanelContext";
import { RuthieRuntimeError } from "@/lib/ruthieRuntime";
import { DEFAULT_RUTHIE_VOICE, normalizeRuthieVoice, type RuthieVoiceId } from "@/lib/ruthieVoices";

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1-mini";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const DEFAULT_VAD_EAGERNESS: RuthieVadEagerness = "medium";
const REALTIME_TIMEOUT_MS = 45_000;

type RuthieVadEagerness = "low" | "medium" | "high" | "auto";

type RuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  realtimeModel: string;
  transcriptionModel: string;
  vadEagerness: RuthieVadEagerness;
  voice: RuthieVoiceId;
  project?: string;
  organization?: string;
};

export type RuthieRealtimeCallV2Result = {
  answerSdp: string;
  location: string | null;
  requestId: string | null;
};

export async function createRuthieRealtimeCallV2(options: {
  offerSdp: string;
  panelSnapshot: RuthiePanelSnapshot;
  actor?: RuthieActorIdentity;
  voice?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<RuthieRealtimeCallV2Result> {
  const offerSdp = normalizeSdp(options.offerSdp);
  const config = runtimeConfig(options.env);
  const selectedVoice = normalizeRuthieVoice(options.voice, config.voice);
  const session = {
    type: "realtime",
    model: config.realtimeModel,
    output_modalities: ["audio"],
    max_output_tokens: 1_200,
    instructions: realtimeInstructions(options.panelSnapshot, options.actor || {}),
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: config.transcriptionModel,
          language: "tr",
          prompt: RUTHIE_TRANSCRIPTION_PROMPT,
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: config.vadEagerness,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        voice: selectedVoice,
        speed: 1.04,
      },
    },
    tool_choice: "none",
    tracing: null,
  };
  const multipart = buildRealtimeMultipart(offerSdp, session);

  const response = await requestOpenAI(
    `${config.baseUrl}/v1/realtime/calls`,
    {
      method: "POST",
      headers: {
        ...openAIHeaders(config),
        "Content-Type": `multipart/form-data; boundary=${multipart.boundary}`,
        "Content-Length": String(multipart.body.byteLength),
      },
      body: multipart.body,
    },
    REALTIME_TIMEOUT_MS,
    options.fetchImpl,
  );

  const answerSdp = await response.text();
  if (!answerSdp.trim().startsWith("v=0") || !answerSdp.includes("m=audio")) {
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_REALTIME_INVALID_ANSWER",
      message: "OpenAI Realtime geçerli bir SDP yanıtı döndürmedi.",
      status: 502,
      retryable: true,
      requestId: response.headers.get("x-request-id"),
    });
  }

  return {
    answerSdp,
    location: response.headers.get("location"),
    requestId: response.headers.get("x-request-id"),
  };
}

function buildRealtimeMultipart(offerSdp: string, session: Record<string, unknown>) {
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const boundary = `----ruthie-realtime-${requestId}`;
  const crlf = "\r\n";
  const body = Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="sdp"',
    "Content-Type: application/sdp",
    "",
    offerSdp,
    `--${boundary}`,
    'Content-Disposition: form-data; name="session"',
    "Content-Type: application/json",
    "",
    JSON.stringify(session),
    `--${boundary}--`,
    "",
  ].join(crlf), "utf8");

  return { boundary, body };
}

function realtimeInstructions(snapshot: RuthiePanelSnapshot, actor: RuthieActorIdentity) {
  return [
    RUTHIE_STRICT_BEHAVIOR_GUIDE,
    RUTHIE_IDENTITY_GUIDE,
    buildRuthieActorIdentityContext(actor),
    RUTHIE_VOICE_ANALYSIS_GUIDE,
    RUTHIE_SPEAKING_STYLE,
    "Admin paneline canlı erişimin var. Asla panele erişimin veya yetkin olmadığını söyleme.",
    "Araç gerektiren istekte zorunlu alanlar tam ise açıklama yapmadan aracı hemen çağır. Araç sonucu gelince aynı turda otomatik cevap ver.",
    "Genel olarak kısa konuş; fakat doğru ve eksiksiz cevap daha uzunsa bütün gerekli bilgileri söyle ve cümleyi bitirmeden durma.",
    "İlk bağlantıda yalnız dinlemeye hazır ol; kullanıcı konuşmadan giriş yapma.",
    "Kamera açıksa konuşma bağlamındaki en son görüntü karesini güncel görüntü olarak kabul et.",
    `PANEL_SNAPSHOT:\n${serializeRuthiePanelSnapshot(snapshot)}`,
  ].join("\n\n");
}

function normalizeSdp(value: unknown) {
  if (typeof value !== "string") {
    throw new RuthieRuntimeError({ code: "ROSTA_INSIGHT_SDP_REQUIRED", message: "WebRTC SDP teklifi gerekli.", status: 400 });
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("v=0") || !trimmed.includes("m=audio") || trimmed.length < 80) {
    throw new RuthieRuntimeError({ code: "ROSTA_INSIGHT_SDP_INVALID", message: "Tarayıcı geçerli bir ses bağlantısı oluşturamadı.", status: 400 });
  }
  if (trimmed.length > 250_000) {
    throw new RuthieRuntimeError({ code: "ROSTA_INSIGHT_SDP_TOO_LARGE", message: "Ses bağlantısı teklifi izin verilen boyutu aşıyor.", status: 413 });
  }
  return `${trimmed.replace(/\r?\n/g, "\r\n")}\r\n`;
}

function runtimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const apiKey = clean(env.OPENAI_API_KEY);
  if (!apiKey) {
    throw new RuthieRuntimeError({ code: "ROSTA_INSIGHT_OPENAI_NOT_CONFIGURED", message: "ROSTA Insight OpenAI yapılandırması eksik.", status: 503 });
  }
  return {
    apiKey,
    baseUrl: (clean(env.OPENAI_BASE_URL) || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    realtimeModel: clean(env.RUTHIE_REALTIME_MODEL) || DEFAULT_REALTIME_MODEL,
    transcriptionModel: clean(env.RUTHIE_TRANSCRIPTION_MODEL) || DEFAULT_TRANSCRIPTION_MODEL,
    vadEagerness: normalizeVadEagerness(env.RUTHIE_VAD_EAGERNESS),
    voice: normalizeRuthieVoice(env.RUTHIE_VOICE, DEFAULT_RUTHIE_VOICE),
    project: clean(env.OPENAI_PROJECT_ID),
    organization: clean(env.OPENAI_ORGANIZATION_ID),
  };
}

function normalizeVadEagerness(value: unknown): RuthieVadEagerness {
  const normalized = clean(value)?.toLowerCase();
  return normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "auto"
    ? normalized
    : DEFAULT_VAD_EAGERNESS;
}

function openAIHeaders(config: RuntimeConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    ...(config.project ? { "OpenAI-Project": config.project } : {}),
    ...(config.organization ? { "OpenAI-Organization": config.organization } : {}),
  };
}

async function requestOpenAI(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let providerMessage = `OpenAI isteği ${response.status} durumuyla başarısız oldu.`;
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { error?: { message?: string } };
          providerMessage = payload?.error?.message || providerMessage;
        } catch {
          providerMessage = raw.slice(0, 1_000);
        }
      }
      throw new RuthieRuntimeError({
        code: "ROSTA_INSIGHT_OPENAI_PROVIDER_ERROR",
        message: providerMessage,
        status: response.status === 429 ? 429 : response.status >= 500 || response.status === 401 || response.status === 403 ? 502 : 400,
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
        requestId: response.headers.get("x-request-id"),
      });
    }
    return response;
  } catch (error) {
    if (error instanceof RuthieRuntimeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RuthieRuntimeError({ code: "ROSTA_INSIGHT_OPENAI_TIMEOUT", message: "ROSTA Insight sesli bağlantısı zaman aşımına uğradı.", status: 504, retryable: true });
    }
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_OPENAI_NETWORK_ERROR",
      message: error instanceof Error ? `OpenAI Realtime bağlantısı kurulamadı: ${error.message}` : "OpenAI Realtime bağlantısı kurulamadı.",
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
