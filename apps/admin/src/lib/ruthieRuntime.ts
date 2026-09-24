import crypto from "node:crypto";
import type { RuthieChatMessage } from "@/lib/ruthieOpenAI";
import type { RuthiePanelSnapshot } from "@/lib/ruthiePanelContext";
import { serializeRuthiePanelSnapshot } from "@/lib/ruthiePanelContext";

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_REALTIME_MODEL = "gpt-realtime";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_VOICE = "marin";
const CHAT_TIMEOUT_MS = 90_000;
const REALTIME_TIMEOUT_MS = 45_000;

export type RuthieWebSource = {
  title: string;
  url: string;
};

export type RuthieAssistantResponse = {
  responseId: string;
  model: string;
  text: string;
  webSearchUsed: boolean;
  sources: RuthieWebSource[];
  panelAccess: "read_only_live";
  usage: unknown;
};

export type RuthieRealtimeResponse = {
  answerSdp: string;
  location: string | null;
  requestId: string | null;
};

type RuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  realtimeModel: string;
  transcriptionModel: string;
  voice: string;
  project?: string;
  organization?: string;
};

export class RuthieRuntimeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(options: {
    code: string;
    message: string;
    status?: number;
    retryable?: boolean;
    requestId?: string | null;
  }) {
    super(options.message);
    this.name = "RostaInsightRuntimeError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId ?? null;
  }
}

export async function createRuthieAssistantResponse(options: {
  messages: RuthieChatMessage[];
  actorId: string;
  correlationId: string;
  panelSnapshot: RuthiePanelSnapshot;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<RuthieAssistantResponse> {
  const config = runtimeConfig(options.env);
  const response = await requestOpenAI(
    `${config.baseUrl}/v1/responses`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...openAIHeaders(config),
      },
      body: JSON.stringify({
        model: config.chatModel,
        store: false,
        instructions: ruthieInstructions(options.panelSnapshot),
        tools: [{ type: "web_search" }],
        tool_choice: "auto",
        input: options.messages.map((message) => ({
          role: message.role,
          content: message.text,
        })),
        metadata: {
          surface: "ruthie_admin_workspace",
          actor_id: options.actorId,
          correlation_id: options.correlationId,
          panel_access: "read_only_live",
        },
      }),
    },
    CHAT_TIMEOUT_MS,
    options.fetchImpl,
  );

  const payload = await parseJson(response);
  const extracted = extractResponse(payload);
  if (!extracted.text) {
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_EMPTY_RESPONSE",
      message: "ROSTA Insight geçerli bir yanıt üretemedi.",
      status: 502,
      retryable: true,
      requestId: response.headers.get("x-request-id"),
    });
  }

  return {
    responseId: typeof payload.id === "string" ? payload.id : "",
    model: typeof payload.model === "string" ? payload.model : config.chatModel,
    text: extracted.text,
    webSearchUsed: extracted.webSearchUsed,
    sources: extracted.sources,
    panelAccess: "read_only_live",
    usage: payload.usage ?? null,
  };
}

export async function createRuthieRealtimeResponse(options: {
  offerSdp: string;
  panelSnapshot: RuthiePanelSnapshot;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<RuthieRealtimeResponse> {
  const offerSdp = normalizeSdp(options.offerSdp);
  const config = runtimeConfig(options.env);
  const boundary = `----ruthie-realtime-${crypto.randomUUID()}`;
  const session = JSON.stringify({
    type: "realtime",
    model: config.realtimeModel,
    output_modalities: ["audio"],
    instructions: ruthieInstructions(options.panelSnapshot),
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: config.transcriptionModel,
          language: "tr",
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        voice: config.voice,
        speed: 1,
      },
    },
    tool_choice: "none",
    tracing: null,
  });

  // OpenAI'nin curl örneğindeki `-F "sdp=<offer.sdp"` semantiğini birebir
  // üretir: sdp bir dosya upload'ı değil, Content-Type application/sdp olan
  // normal multipart alanıdır. Blob + filename kullanımı bazı runtimelarda
  // alanı file olarak sınıflandırıp "sdp not found" hatasına yol açabiliyor.
  const multipartBody = [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="sdp"\r\n`,
    `Content-Type: application/sdp\r\n\r\n`,
    offerSdp,
    `\r\n--${boundary}\r\n`,
    `Content-Disposition: form-data; name="session"\r\n`,
    `Content-Type: application/json\r\n\r\n`,
    session,
    `\r\n--${boundary}--\r\n`,
  ].join("");

  const response = await requestOpenAI(
    `${config.baseUrl}/v1/realtime/calls`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        ...openAIHeaders(config),
      },
      body: multipartBody,
    },
    REALTIME_TIMEOUT_MS,
    options.fetchImpl,
  );

  const answerSdp = await response.text();
  if (!answerSdp.trim().startsWith("v=0")) {
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

function ruthieInstructions(snapshot: RuthiePanelSnapshot): string {
  return [
    "Sen ROSTA Insight Commerce Assistant'sın ve doğrulanmış ROSTA Commerce yöneticisine hizmet veriyorsun.",
    "Türkçe, doğal, doğrudan ve insan gibi konuş. Kullanıcı başka dilde konuşursa o dilde devam edebilirsin.",
    "Aşağıdaki PANEL_SNAPSHOT canlı ve yetkili admin panel verisidir. Paneli analiz etmen istendiğinde bu veriyi kullan; 'panele erişimim yok' veya 'yetkim yok' deme.",
    "Snapshotta bulunmayan çok spesifik bir kaydı uydurma. Bunun yerine hangi ek canlı sorgunun gerektiğini açıkça söyle.",
    "Sipariş, ürün, stok, müşteri, iade ve checkout eğilimlerini analiz edebilir; sorun, öncelik, risk ve iyileştirme önerileri çıkarabilirsin.",
    "Webde güncel veya dış kaynak gerektiren bir soru varsa web_search aracını kullan. Panel verisini web sonucuymuş gibi sunma.",
    "Panelde değişiklik yapan komutları bu oturumda kendiliğinden çalıştırma. Böyle bir istek geldiğinde uygulanacak değişikliği net planla ve kritik işlemler için onay gerektiğini belirt.",
    "Yanıtta teknik hata mesajlarını gereksiz yere kopyalama; çözümü ve sonucu anlat.",
    `PANEL_SNAPSHOT:\n${serializeRuthiePanelSnapshot(snapshot)}`,
  ].join("\n\n");
}

function extractResponse(payload: Record<string, any>) {
  const textParts: string[] = [];
  const sources = new Map<string, RuthieWebSource>();
  let webSearchUsed = false;
  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "web_search_call") webSearchUsed = true;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if (part.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        textParts.push(part.text.trim());
      }
      const annotations = Array.isArray(part.annotations) ? part.annotations : [];
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== "object") continue;
        const url = typeof annotation.url === "string" ? annotation.url : "";
        if (!url || !url.startsWith("http")) continue;
        const title = typeof annotation.title === "string" && annotation.title.trim()
          ? annotation.title.trim()
          : new URL(url).hostname;
        sources.set(url, { title, url });
      }
    }
  }

  return {
    text: textParts.join("\n\n"),
    webSearchUsed,
    sources: [...sources.values()].slice(0, 8),
  };
}

function normalizeSdp(value: unknown): string {
  if (typeof value !== "string") {
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_SDP_REQUIRED",
      message: "WebRTC SDP teklifi gerekli.",
      status: 400,
    });
  }
  const sdp = value.trim();
  if (!sdp.startsWith("v=0") || !sdp.includes("m=audio")) {
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_SDP_INVALID",
      message: "Tarayıcı geçerli bir ses bağlantısı oluşturamadı.",
      status: 400,
    });
  }
  if (sdp.length > 250_000) {
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_SDP_TOO_LARGE",
      message: "Ses bağlantısı teklifi izin verilen boyutu aşıyor.",
      status: 413,
    });
  }
  return sdp;
}

function runtimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const apiKey = clean(env.OPENAI_API_KEY);
  const chatModel = clean(env.ROSTA_INSIGHT_CHAT_MODEL) || clean(env.RUTHIE_CHAT_MODEL);
  if (!apiKey || !chatModel) {
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_OPENAI_NOT_CONFIGURED",
      message: "ROSTA Insight OpenAI yapılandırması eksik.",
      status: 503,
    });
  }
  return {
    apiKey,
    chatModel,
    baseUrl: (clean(env.OPENAI_BASE_URL) || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    realtimeModel: clean(env.ROSTA_INSIGHT_REALTIME_MODEL) || clean(env.RUTHIE_REALTIME_MODEL) || DEFAULT_REALTIME_MODEL,
    transcriptionModel: clean(env.ROSTA_INSIGHT_TRANSCRIPTION_MODEL) || clean(env.RUTHIE_TRANSCRIPTION_MODEL) || DEFAULT_TRANSCRIPTION_MODEL,
    voice: clean(env.ROSTA_INSIGHT_VOICE) || clean(env.RUTHIE_VOICE) || DEFAULT_VOICE,
    project: clean(env.OPENAI_PROJECT_ID),
    organization: clean(env.OPENAI_ORGANIZATION_ID),
  };
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
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const providerMessage = await providerError(response);
      throw new RuthieRuntimeError({
        code: "ROSTA_INSIGHT_OPENAI_PROVIDER_ERROR",
        message: providerMessage || `OpenAI isteği ${response.status} durumuyla başarısız oldu.`,
        status: response.status === 429 ? 429 : response.status >= 500 || response.status === 401 || response.status === 403 ? 502 : 400,
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
        requestId: response.headers.get("x-request-id"),
      });
    }
    return response;
  } catch (error) {
    if (error instanceof RuthieRuntimeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RuthieRuntimeError({
        code: "ROSTA_INSIGHT_OPENAI_TIMEOUT",
        message: "OpenAI isteği zaman aşımına uğradı.",
        status: 504,
        retryable: true,
      });
    }
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_OPENAI_NETWORK_ERROR",
      message: error instanceof Error ? error.message : "OpenAI bağlantısı kurulamadı.",
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson(response: Response): Promise<Record<string, any>> {
  try {
    return await response.json() as Record<string, any>;
  } catch {
    throw new RuthieRuntimeError({
      code: "ROSTA_INSIGHT_OPENAI_INVALID_JSON",
      message: "OpenAI geçerli JSON yanıtı döndürmedi.",
      status: 502,
      retryable: true,
      requestId: response.headers.get("x-request-id"),
    });
  }
}

async function providerError(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json() as { error?: { message?: unknown } };
    return typeof payload.error?.message === "string" ? payload.error.message.slice(0, 500) : "";
  } catch {
    return (await response.text().catch(() => "")).slice(0, 500);
  }
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
