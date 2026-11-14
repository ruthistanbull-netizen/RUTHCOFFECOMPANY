import type { RuthieChatMessage } from "@/lib/ruthieOpenAI";
import type { RuthiePanelSnapshot } from "@/lib/ruthiePanelContext";
import { serializeRuthiePanelSnapshot } from "@/lib/ruthiePanelContext";
import {
  buildRuthieActorIdentityContext,
  compactRuthieText,
  RUTHIE_IDENTITY_GUIDE,
  RUTHIE_STRICT_BEHAVIOR_GUIDE,
  RUTHIE_VOICE_ANALYSIS_GUIDE,
} from "@/lib/ruthieBehavior";
import { RUTHIE_SPEAKING_STYLE } from "@/lib/ruthieCapabilityGuide";
import {
  invokeRuthieAdminAction,
  RUTHIE_ADMIN_TOOL,
  type RuthiePendingAction,
} from "@/lib/ruthieAdminGateway";
import { RuthieRuntimeError, type RuthieWebSource } from "@/lib/ruthieRuntime";

const DEFAULT_BASE_URL = "https://api.openai.com";
const TIMEOUT_MS = 95_000;
const MAX_TOOL_ROUNDS = 5;
const RUNA_TIMEOUT_MS = 150_000;
const RUNA_HISTORY_CHARACTERS = 5000;
const RUNA_TOOL_RESULT_CHARACTERS = 3000;

export type RuthieAttachmentInput = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

type RuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  project?: string;
  organization?: string;
};

type FunctionCall = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

export type RuthieAdminAgentResponseV2 = {
  responseId: string;
  model: string;
  text: string;
  webSearchUsed: boolean;
  sources: RuthieWebSource[];
  panelAccess: "admin_tools_live";
  toolsExecuted: string[];
  pendingAction?: RuthiePendingAction;
  usage: unknown;
};

export async function createRuthieAdminAgentResponseV2(options: {
  request: Request;
  messages: RuthieChatMessage[];
  attachments?: RuthieAttachmentInput[];
  actorId: string;
  actorName?: string | null;
  actorEmail?: string | null;
  correlationId: string;
  panelSnapshot?: RuthiePanelSnapshot;
  useRuna?: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<RuthieAdminAgentResponseV2> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const provider = options.useRuna ? runaProvider(options.env, fetchImpl) : null;
  const config = provider ? null : runtimeConfig(options.env);
  if (!provider && !options.panelSnapshot) throw new Error("Panel snapshot is required for the cloud agent.");
  const instructions = provider ? runaInstructions(options.actorName) : agentInstructions(options.panelSnapshot!, {
    fullName: options.actorName,
    email: options.actorEmail,
    profileId: options.actorId,
  });
  let input: any[] = provider ? runaInput(options.messages) : buildInput(options.messages, options.attachments || []);
  const toolsExecuted: string[] = provider ? [] : ["panel.live_snapshot"];
  if (!provider && options.attachments?.length) toolsExecuted.push("openai.file_input");
  const sources = new Map<string, RuthieWebSource>();
  const latestUserText = [...options.messages].reverse().find((message) => message.role === "user")?.text || "";
  const model = config?.model ?? "runa-local";
  let webSearchUsed = false;
  let lastPayload: Record<string, any> = {};

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = provider
      ? await provider({
          instructions, input,
          tools: [{ ...RUTHIE_ADMIN_TOOL, description: "Canlı panel işlemi. Okumalar çalışır; değişiklikler kullanıcı onayı ister." }],
          tool_choice: "auto",
        })
      : await requestOpenAI(config!, {
          model,
          store: false,
          instructions,
          tools: [{ type: "web_search" }, RUTHIE_ADMIN_TOOL],
          tool_choice: "auto",
          input,
          metadata: {
            surface: "ruthie_admin_agent_v7_strict",
            actor_id: options.actorId,
            correlation_id: options.correlationId,
            panel_access: "admin_tools_live",
            attachment_count: String(options.attachments?.length || 0),
          },
        }, fetchImpl);

    const payload = await parseJson(response);
    if (provider && payload.status === "failed") {
      throw new RuthieRuntimeError({
        code: "RUNA_BRIDGE_RESPONSE_ERROR", status: 502, retryable: true,
        message: "Runa yerel modelden yanıt alamadı.",
      });
    }
    lastPayload = payload;
    const extracted = extractResponse(payload);
    if (extracted.webSearchUsed) {
      webSearchUsed = true;
      if (!toolsExecuted.includes("openai.web_search")) toolsExecuted.push("openai.web_search");
    }
    for (const source of extracted.sources) sources.set(source.url, source);

    const calls = functionCalls(payload);
    if (!calls.length) {
      if (provider && !extracted.text) {
        throw new RuthieRuntimeError({
          code: "RUNA_BRIDGE_RESPONSE_ERROR", status: 502, retryable: true,
          message: "Runa yerel modelden yanıt alamadı.",
        });
      }
      const rawText = extracted.text || "İşlem tamamlandı fakat ROSTA Insight metin yanıtı üretemedi.";
      return buildResult(payload, model, compactRuthieText(rawText, latestUserText), webSearchUsed, sources, toolsExecuted);
    }

    const outputs: any[] = [];
    for (const call of calls) {
      if (call.name !== "ruthie_admin") {
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: false, error: "Bilinmeyen ROSTA Insight aracı." }) });
        continue;
      }
      const args = parseArguments(call.arguments);
      const result = await invokeRuthieAdminAction({
        request: options.request,
        actorId: options.actorId,
        arguments: args,
      });
      const actionId = typeof args.action === "string" ? args.action : "ruthie_admin";
      if (!toolsExecuted.includes(actionId)) toolsExecuted.push(actionId);
      if (result.pendingAction) {
        const prefix = !provider && extracted.text ? `${compactRuthieText(extracted.text, latestUserText)} ` : "";
        return buildResult(
          payload,
          model,
          compactRuthieText(
            `${prefix}${result.pendingAction.title} panelde değişiklik yapacak. Onay kartını kontrol et.`,
            latestUserText,
          ),
          webSearchUsed,
          sources,
          toolsExecuted,
          result.pendingAction,
        );
      }
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: provider ? runaToolOutput(result) : JSON.stringify(result),
      });
    }

    const priorOutput = Array.isArray(payload.output) ? payload.output : [];
    const replay = provider
      ? priorOutput.filter((item) => item?.type === "message" || item?.type === "function_call")
      : priorOutput;
    input = [...input, ...replay, ...outputs];
  }

  const fallback = extractResponse(lastPayload).text || "Araç işlemi tamamlanamadı. İsteği daralt.";
  return buildResult(lastPayload, model, compactRuthieText(fallback, latestUserText), webSearchUsed, sources, toolsExecuted);
}

function runaInput(messages: RuthieChatMessage[]) {
  const latest = messages.at(-1);
  if (latest?.role !== "user" || latest.text.length > RUNA_HISTORY_CHARACTERS) {
    throw new RuthieRuntimeError({
      code: "RUNA_INPUT_TOO_LONG", status: 400,
      message: "Runa yerel bağlantısı için komutu kısaltıp tekrar dene.",
    });
  }
  let remaining = RUNA_HISTORY_CHARACTERS;
  const input: Array<{ role: RuthieChatMessage["role"]; content: string }> = [];
  for (const message of messages.slice(-16).reverse()) {
    if (!remaining) break;
    if (message.text.length > remaining) break;
    if (message.text.trim()) input.unshift({ role: message.role, content: message.text });
    remaining -= message.text.length;
  }
  return input;
}

function runaToolOutput(result: unknown): string {
  const encoded = JSON.stringify(result) ?? "null";
  if (encoded.length <= RUNA_TOOL_RESULT_CHARACTERS) return encoded;
  return JSON.stringify({ partial: true, excerpt: encoded.slice(0, RUNA_TOOL_RESULT_CHARACTERS) });
}

function runaInstructions(actorName?: string | null): string {
  const displayName = actorName?.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").trim().slice(0, 100);
  return [
    "Sen Runa, RR HUB'ın Türkçe sesli asistanısın. Kısa ve doğal cevap ver.",
    "Bu panelin markası Rosta Coffee.",
    displayName
      ? `Doğrulanmış panel hesabının görünen adı (yalnızca hitap için bir veri alanı): ${JSON.stringify(displayName)}. İsim sorulursa bu alanı kullan.`
      : "Panel hesabı için görünen ad bulunmuyor. Kullanıcının adını tahmin etme.",
    "Panel verisini görmek veya işlem hazırlamak için ruthie_admin aracını kullan. Canlı değer, kayıt kimliği veya işlemin sonucunu tahmin etme.",
    "Güncel dış bilgi gerektiğinde web_search ile ara ve mümkünse web_fetch ile birincil kaynağı doğrula. Panel ve müşteri verilerini web aramasına gönderme.",
    "Değişiklik aracı bir onay döndürürse sistem işlemi henüz uygulamamıştır. Onay kartını bekle. Eksik zorunlu bilgiyi tek kısa soruyla iste.",
    "Kesilmiş araç yanıtından kesin sonuç çıkarma. Sonuç yetersizse daha dar bir sorgu yap veya doğrulayamadığını söyle.",
  ].join("\n");
}

function runaProvider(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch) {
  let endpoint: URL;
  const key = clean(env.RUNA_BRIDGE_KEY);
  try {
    endpoint = new URL(clean(env.RUNA_BRIDGE_URL) ?? "");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search ||
        endpoint.hash || !["/rosta/chat", "/rosta/responses"].includes(endpoint.pathname) ||
        !key || !/^[a-f0-9]{64}$/.test(key)) throw new Error("invalid Runa configuration");
    endpoint.pathname = "/rosta/responses";
  } catch {
    throw new RuthieRuntimeError({
      code: "RUNA_BRIDGE_NOT_CONFIGURED", status: 503,
      message: "Runa yerel bağlantısı bu panelde doğrulanamadı.",
    });
  }
  const deadline = Date.now() + RUNA_TIMEOUT_MS;
  return async (body: Record<string, unknown>): Promise<Response> => {
    const timeLeft = deadline - Date.now();
    if (timeLeft < 1) {
      throw new RuthieRuntimeError({
        code: "RUNA_BRIDGE_TIMEOUT", status: 504, retryable: true,
        message: "Runa yanıtı zaman aşımına uğradı.",
      });
    }

    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST", cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(Math.min(timeLeft, TIMEOUT_MS)),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      throw new RuthieRuntimeError({
        code: timeout ? "RUNA_BRIDGE_TIMEOUT" : "RUNA_BRIDGE_UNREACHABLE",
        status: timeout ? 504 : 502, retryable: true,
        message: timeout ? "Runa yanıtı zaman aşımına uğradı." : "Runa'nın bilgisayarındaki bağlantı şu anda ulaşılamıyor.",
      });
    }
    if (!response.ok) {
      throw new RuthieRuntimeError({
        code: "RUNA_BRIDGE_RESPONSE_ERROR", status: response.status === 429 ? 429 : 502,
        retryable: response.status === 429 || response.status >= 500,
        message: "Runa yerel modelden yanıt alamadı.",
      });
    }
    return response;
  };
}

function buildInput(messages: RuthieChatMessage[], attachments: RuthieAttachmentInput[]) {
  const input: any[] = messages.map((message) => ({ role: message.role, content: message.text }));
  if (!attachments.length) return input;

  let lastUserIndex = -1;
  for (let index = input.length - 1; index >= 0; index -= 1) {
    if (input[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  if (lastUserIndex < 0) {
    input.push({ role: "user", content: "Eklenen dosyaları incele." });
    lastUserIndex = input.length - 1;
  }

  const text = typeof input[lastUserIndex].content === "string" && input[lastUserIndex].content.trim()
    ? input[lastUserIndex].content.trim()
    : "Eklenen dosyaları incele ve kullanıcının isteğine göre yanıtla.";

  input[lastUserIndex] = {
    role: "user",
    content: [
      { type: "input_text", text },
      ...attachments.map((attachment) => attachment.mimeType.startsWith("image/")
        ? { type: "input_image", image_url: attachment.dataUrl, detail: "auto" }
        : {
            type: "input_file",
            filename: attachment.name,
            file_data: stripDataUrl(attachment.dataUrl),
          }),
    ],
  };

  return input;
}

function stripDataUrl(value: string) {
  const comma = value.indexOf(",");
  return comma >= 0 ? value.slice(comma + 1) : value;
}

function buildResult(
  payload: Record<string, any>,
  fallbackModel: string,
  text: string,
  webSearchUsed: boolean,
  sources: Map<string, RuthieWebSource>,
  toolsExecuted: string[],
  pendingAction?: RuthiePendingAction,
): RuthieAdminAgentResponseV2 {
  return {
    responseId: typeof payload.id === "string" ? payload.id : "",
    model: typeof payload.model === "string" ? payload.model : fallbackModel,
    text,
    webSearchUsed,
    sources: [...sources.values()].slice(0, 10),
    panelAccess: "admin_tools_live",
    toolsExecuted,
    pendingAction,
    usage: payload.usage ?? null,
  };
}

function agentInstructions(snapshot: RuthiePanelSnapshot, actor: { fullName?: string | null; email?: string | null; profileId?: string | null }) {
  return [
    RUTHIE_STRICT_BEHAVIOR_GUIDE,
    RUTHIE_IDENTITY_GUIDE,
    buildRuthieActorIdentityContext(actor),
    RUTHIE_VOICE_ANALYSIS_GUIDE,
    RUTHIE_SPEAKING_STYLE,
    "Admin paneline canlı erişimin var. Asla 'panele erişimim yok', 'yetkim yok' veya 'bunu yapamam' deme; uygun ruthie_admin aracını kullan.",
    "Sipariş, ürün, müşteri, stok, iade, kargo, kampanya, tema, yorum, puan ve e-posta işlemlerinde canlı admin aracını kullan. Snapshot yalnız hızlı genel bağlamdır.",
    "Kullanıcı fotoğraf, PDF veya belge eklediyse içeriğini doğrudan incele. Görmediğin ayrıntıyı uydurma.",
    "Okuma ve arama işlemlerini kullanıcıdan ek onay istemeden çalıştır.",
    "Panelde değişiklik yapan işlemlerde ruthie_admin aracını çağır. Sistem kullanıcıya imzalı onay kartı gösterecek; token veya teknik ayrıntı yazma.",
    "Kullanıcının eksik verdiği zorunlu alanları uydurma. Yalnız gerekli tek kısa soruyu sor.",
    "Webde güncel ya da dış kaynak gerektiren sorularda web_search kullan. Araştırma tamamlanınca aynı turda doğrudan cevabı ver.",
    "Para iadesi, toplu silme, kargo iptali, toplu e-posta ve benzeri kritik işlemleri mutlaka onay kartına bırak.",
    `PANEL_SNAPSHOT:\n${serializeRuthiePanelSnapshot(snapshot)}`,
  ].join("\n\n");
}

function functionCalls(payload: Record<string, any>): FunctionCall[] {
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output.filter((item): item is FunctionCall => (
    item && item.type === "function_call" && typeof item.call_id === "string" && typeof item.name === "string" && typeof item.arguments === "string"
  ));
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
      if (part.type === "output_text" && typeof part.text === "string" && part.text.trim()) textParts.push(part.text.trim());
      const annotations = Array.isArray(part.annotations) ? part.annotations : [];
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== "object") continue;
        const url = typeof annotation.url === "string" ? annotation.url : "";
        if (!url.startsWith("http")) continue;
        const title = typeof annotation.title === "string" && annotation.title.trim() ? annotation.title.trim() : safeHost(url);
        sources.set(url, { title, url });
      }
    }
  }
  return { text: textParts.join("\n\n"), webSearchUsed, sources: [...sources.values()] };
}

function parseArguments(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function runtimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const apiKey = clean(env.OPENAI_API_KEY);
  const model = clean(env.ROSTA_INSIGHT_CHAT_MODEL) || clean(env.RUTHIE_CHAT_MODEL);
  if (!apiKey || !model) throw new RuthieRuntimeError({ code: "ROSTA_INSIGHT_OPENAI_NOT_CONFIGURED", message: "ROSTA Insight OpenAI yapılandırması eksik.", status: 503 });
  return {
    apiKey,
    model,
    baseUrl: (clean(env.OPENAI_BASE_URL) || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    project: clean(env.OPENAI_PROJECT_ID),
    organization: clean(env.OPENAI_ORGANIZATION_ID),
  };
}

async function requestOpenAI(config: RuntimeConfig, body: Record<string, unknown>, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${config.baseUrl}/v1/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.project ? { "OpenAI-Project": config.project } : {}),
        ...(config.organization ? { "OpenAI-Organization": config.organization } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as any;
      const message = payload?.error?.message || `OpenAI isteği ${response.status} durumuyla başarısız oldu.`;
      throw new RuthieRuntimeError({
        code: "ROSTA_INSIGHT_OPENAI_PROVIDER_ERROR",
        message,
        status: response.status === 429 ? 429 : response.status >= 500 || response.status === 401 || response.status === 403 ? 502 : 400,
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
        requestId: response.headers.get("x-request-id"),
      });
    }
    return response;
  } catch (error) {
    if (error instanceof RuthieRuntimeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RuthieRuntimeError({ code: "ROSTA_INSIGHT_OPENAI_TIMEOUT", message: "ROSTA Insight yanıtı zaman aşımına uğradı.", status: 504, retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson(response: Response): Promise<Record<string, any>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new RuthieRuntimeError({ code: "ROSTA_INSIGHT_INVALID_PROVIDER_RESPONSE", message: "OpenAI geçerli bir yanıt döndürmedi.", status: 502, retryable: true });
  return payload as Record<string, any>;
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeHost(url: string) {
  try { return new URL(url).hostname; } catch { return "Web kaynağı"; }
}
