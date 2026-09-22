const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com";
const DEFAULT_REALTIME_MODEL = "gpt-realtime";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_VOICE = "marin";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_CHAT_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 24_000;
const MAX_TOTAL_CHAT_CHARS = 80_000;
const MAX_SDP_CHARS = 250_000;

export type RuthieChatRole = "user" | "assistant";

export type RuthieChatMessage = {
  role: RuthieChatRole;
  text: string;
};

export type RuthieOpenAIConfig = {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  realtimeModel: string;
  transcriptionModel: string;
  voice: string;
  project?: string;
  organization?: string;
};

export type RuthieOpenAIStatus = {
  configured: boolean;
  missing: string[];
  models: {
    chat: string | null;
    realtime: string;
    transcription: string;
    voice: string;
  };
  capabilities: {
    chat: boolean;
    realtimeVoice: boolean;
    vision: boolean;
    files: boolean;
    toolCalling: boolean;
  };
};

export type RuthieChatResponse = {
  responseId: string;
  model: string;
  text: string;
  usage: unknown;
  rawStatus: string | null;
};

export type RuthieRealtimeCall = {
  answerSdp: string;
  location: string | null;
  requestId: string | null;
};

export class RuthieOpenAIError extends Error {
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
    this.name = "RuthieOpenAIError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId ?? null;
  }
}

export function getRuthieOpenAIStatus(
  env: NodeJS.ProcessEnv = process.env,
): RuthieOpenAIStatus {
  const apiKey = clean(env.OPENAI_API_KEY);
  const chatModel = clean(env.ROSTA_INSIGHT_CHAT_MODEL) || clean(env.RUTHIE_CHAT_MODEL);
  const realtimeModel = clean(env.ROSTA_INSIGHT_REALTIME_MODEL) || clean(env.RUTHIE_REALTIME_MODEL) || DEFAULT_REALTIME_MODEL;
  const transcriptionModel = clean(env.ROSTA_INSIGHT_TRANSCRIPTION_MODEL) || clean(env.RUTHIE_TRANSCRIPTION_MODEL) || DEFAULT_TRANSCRIPTION_MODEL;
  const voice = clean(env.ROSTA_INSIGHT_VOICE) || clean(env.RUTHIE_VOICE) || DEFAULT_VOICE;
  const missing = [
    !apiKey ? "OPENAI_API_KEY" : null,
    !chatModel ? "ROSTA_INSIGHT_CHAT_MODEL" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    configured: missing.length === 0,
    missing,
    models: {
      chat: chatModel || null,
      realtime: realtimeModel,
      transcription: transcriptionModel,
      voice,
    },
    capabilities: {
      chat: Boolean(apiKey && chatModel),
      realtimeVoice: Boolean(apiKey && realtimeModel),
      vision: Boolean(apiKey && chatModel),
      files: Boolean(apiKey && chatModel),
      toolCalling: Boolean(apiKey && chatModel),
    },
  };
}

export function requireRuthieOpenAIConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuthieOpenAIConfig {
  const status = getRuthieOpenAIStatus(env);
  if (!status.configured) {
    throw new RuthieOpenAIError({
      code: "RUTHIE_OPENAI_NOT_CONFIGURED",
      message: `ROSTA Insight OpenAI yapılandırması eksik: ${status.missing.join(", ")}.`,
      status: 503,
      retryable: false,
    });
  }

  return {
    apiKey: clean(env.OPENAI_API_KEY)!,
    baseUrl: normalizeBaseUrl(clean(env.OPENAI_BASE_URL) || DEFAULT_OPENAI_BASE_URL),
    chatModel: status.models.chat!,
    realtimeModel: status.models.realtime,
    transcriptionModel: status.models.transcription,
    voice: status.models.voice,
    project: clean(env.OPENAI_PROJECT_ID),
    organization: clean(env.OPENAI_ORGANIZATION_ID),
  };
}

export function normalizeRuthieChatMessages(input: unknown): RuthieChatMessage[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new RuthieOpenAIError({
      code: "RUTHIE_CHAT_MESSAGES_REQUIRED",
      message: "En az bir sohbet mesajı gerekli.",
      status: 400,
    });
  }
  if (input.length > MAX_CHAT_MESSAGES) {
    throw new RuthieOpenAIError({
      code: "RUTHIE_CHAT_TOO_MANY_MESSAGES",
      message: `Tek istekte en fazla ${MAX_CHAT_MESSAGES} mesaj gönderilebilir.`,
      status: 400,
    });
  }

  let totalChars = 0;
  const messages = input.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw invalidMessage(index);
    }
    const role = (entry as { role?: unknown }).role;
    const text = typeof (entry as { text?: unknown }).text === "string"
      ? (entry as { text: string }).text.trim()
      : "";
    if ((role !== "user" && role !== "assistant") || !text) {
      throw invalidMessage(index);
    }
    if (text.length > MAX_MESSAGE_CHARS) {
      throw new RuthieOpenAIError({
        code: "RUTHIE_CHAT_MESSAGE_TOO_LONG",
        message: `${index + 1}. mesaj ${MAX_MESSAGE_CHARS} karakter sınırını aşıyor.`,
        status: 400,
      });
    }
    totalChars += text.length;
    return { role, text } satisfies RuthieChatMessage;
  });

  if (totalChars > MAX_TOTAL_CHAT_CHARS) {
    throw new RuthieOpenAIError({
      code: "RUTHIE_CHAT_CONTEXT_TOO_LARGE",
      message: `Sohbet bağlamı ${MAX_TOTAL_CHAT_CHARS} karakter sınırını aşıyor.`,
      status: 400,
    });
  }
  if (messages.at(-1)?.role !== "user") {
    throw new RuthieOpenAIError({
      code: "RUTHIE_CHAT_LAST_MESSAGE_MUST_BE_USER",
      message: "Son mesaj kullanıcı mesajı olmalıdır.",
      status: 400,
    });
  }
  return messages;
}

export function buildRuthieChatRequest(options: {
  config: RuthieOpenAIConfig;
  messages: RuthieChatMessage[];
  actorId: string;
  correlationId: string;
}) {
  return {
    model: options.config.chatModel,
    store: false,
    instructions: ruthieConversationInstructions(),
    input: options.messages.map((message) => ({
      role: message.role,
      content: message.text,
    })),
    metadata: {
      surface: "rosta_insight_chat",
      actor_id: options.actorId,
      correlation_id: options.correlationId,
    },
  };
}

export function buildRuthieRealtimeSession(config: RuthieOpenAIConfig) {
  return {
    type: "realtime",
    model: config.realtimeModel,
    output_modalities: ["audio"],
    instructions: ruthieConversationInstructions(),
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
  };
}

export async function createRuthieChatResponse(options: {
  messages: RuthieChatMessage[];
  actorId: string;
  correlationId: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<RuthieChatResponse> {
  const config = requireRuthieOpenAIConfig(options.env);
  const body = buildRuthieChatRequest({
    config,
    messages: options.messages,
    actorId: options.actorId,
    correlationId: options.correlationId,
  });
  const response = await openAIRequest(`${config.baseUrl}/v1/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...openAIHeaders(config),
    },
    body: JSON.stringify(body),
  }, options.fetchImpl);
  const payload = await parseJsonResponse(response);
  const text = extractRuthieResponseText(payload);
  if (!text) {
    throw new RuthieOpenAIError({
      code: "RUTHIE_OPENAI_EMPTY_RESPONSE",
      message: "OpenAI yanıtı metin içermiyor.",
      status: 502,
      retryable: true,
      requestId: response.headers.get("x-request-id"),
    });
  }
  return {
    responseId: typeof payload.id === "string" ? payload.id : "",
    model: typeof payload.model === "string" ? payload.model : config.chatModel,
    text,
    usage: payload.usage ?? null,
    rawStatus: typeof payload.status === "string" ? payload.status : null,
  };
}

export async function createRuthieRealtimeCall(options: {
  offerSdp: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<RuthieRealtimeCall> {
  const offerSdp = normalizeOfferSdp(options.offerSdp);
  const config = requireRuthieOpenAIConfig(options.env);
  const form = new FormData();
  form.append("sdp", new Blob([offerSdp], { type: "application/sdp" }), "offer.sdp");
  form.append(
    "session",
    new Blob([JSON.stringify(buildRuthieRealtimeSession(config))], { type: "application/json" }),
    "session.json",
  );

  const response = await openAIRequest(`${config.baseUrl}/v1/realtime/calls`, {
    method: "POST",
    headers: openAIHeaders(config),
    body: form,
  }, options.fetchImpl);
  const answerSdp = await response.text();
  if (!answerSdp.trim()) {
    throw new RuthieOpenAIError({
      code: "RUTHIE_REALTIME_EMPTY_SDP",
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

export function extractRuthieResponseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const type = (part as { type?: unknown }).type;
      const text = (part as { text?: unknown }).text;
      if (type === "output_text" && typeof text === "string" && text.trim()) {
        parts.push(text.trim());
      }
    }
  }
  return parts.join("\n\n");
}

export function normalizeOfferSdp(value: unknown): string {
  if (typeof value !== "string") {
    throw new RuthieOpenAIError({
      code: "RUTHIE_REALTIME_SDP_REQUIRED",
      message: "WebRTC SDP teklifi gerekli.",
      status: 400,
    });
  }
  const sdp = value.trim();
  if (!sdp.startsWith("v=0") || !sdp.includes("m=audio")) {
    throw new RuthieOpenAIError({
      code: "RUTHIE_REALTIME_INVALID_SDP",
      message: "Geçerli bir ses WebRTC SDP teklifi gönderilmedi.",
      status: 400,
    });
  }
  if (sdp.length > MAX_SDP_CHARS) {
    throw new RuthieOpenAIError({
      code: "RUTHIE_REALTIME_SDP_TOO_LARGE",
      message: "WebRTC SDP teklifi izin verilen boyutu aşıyor.",
      status: 413,
    });
  }
  return sdp;
}

function ruthieConversationInstructions(): string {
  return [
    "Sen ROSTA Insight Commerce Assistant'sın.",
    "Türkçe konuş; kullanıcı başka dilde konuşursa o dilde devam edebilirsin.",
    "Kullanıcıyla genel konularda doğal biçimde sohbet edebilirsin.",
    "Bu oturumda panel aracı verilmediyse sipariş, ürün, stok, ödeme veya mesaj üzerinde işlem yaptığını iddia etme.",
    "Panel verisi görmediğinde tahmin yürütme; erişimin olmadığını açıkça söyle.",
    "Yanıtlarını sade, doğrudan ve insan gibi tut.",
  ].join(" ");
}

async function openAIRequest(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const requestId = response.headers.get("x-request-id");
      const providerMessage = await safeProviderError(response);
      throw new RuthieOpenAIError({
        code: "RUTHIE_OPENAI_PROVIDER_ERROR",
        message: providerMessage || `OpenAI isteği ${response.status} durumuyla başarısız oldu.`,
        status: mapProviderStatus(response.status),
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
        requestId,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof RuthieOpenAIError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RuthieOpenAIError({
        code: "RUTHIE_OPENAI_TIMEOUT",
        message: "OpenAI isteği zaman aşımına uğradı.",
        status: 504,
        retryable: true,
      });
    }
    throw new RuthieOpenAIError({
      code: "RUTHIE_OPENAI_NETWORK_ERROR",
      message: error instanceof Error ? error.message : "OpenAI bağlantısı kurulamadı.",
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

function openAIHeaders(config: RuthieOpenAIConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    ...(config.project ? { "OpenAI-Project": config.project } : {}),
    ...(config.organization ? { "OpenAI-Organization": config.organization } : {}),
  };
}

async function parseJsonResponse(response: Response): Promise<Record<string, any>> {
  try {
    return await response.json() as Record<string, any>;
  } catch {
    throw new RuthieOpenAIError({
      code: "RUTHIE_OPENAI_INVALID_JSON",
      message: "OpenAI geçerli JSON yanıtı döndürmedi.",
      status: 502,
      retryable: true,
      requestId: response.headers.get("x-request-id"),
    });
  }
}

async function safeProviderError(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json() as { error?: { message?: unknown } };
    return typeof payload.error?.message === "string" ? payload.error.message : "";
  } catch {
    const text = await response.text().catch(() => "");
    return text.slice(0, 500);
  }
}

function invalidMessage(index: number) {
  return new RuthieOpenAIError({
    code: "RUTHIE_CHAT_INVALID_MESSAGE",
    message: `${index + 1}. sohbet mesajı geçersiz.`,
    status: 400,
  });
}

function mapProviderStatus(status: number): number {
  if (status === 401 || status === 403) return 502;
  if (status === 429) return 429;
  if (status >= 500) return 502;
  return 400;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
