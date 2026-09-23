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
  panelSnapshot: RuthiePanelSnapshot;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<RuthieAdminAgentResponseV2> {
  const config = runtimeConfig(options.env);
  const fetchImpl = options.fetchImpl ?? fetch;
  let input: any[] = buildInput(options.messages, options.attachments || []);
  const toolsExecuted: string[] = ["panel.live_snapshot"];
  if (options.attachments?.length) toolsExecuted.push("openai.file_input");
  const sources = new Map<string, RuthieWebSource>();
  const latestUserText = [...options.messages].reverse().find((message) => message.role === "user")?.text || "";
  let webSearchUsed = false;
  let lastPayload: Record<string, any> = {};

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await requestOpenAI(config, {
      model: config.model,
      store: false,
      instructions: agentInstructions(options.panelSnapshot, {
        fullName: options.actorName,
        email: options.actorEmail,
        profileId: options.actorId,
      }),
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
    lastPayload = payload;
    const extracted = extractResponse(payload);
    if (extracted.webSearchUsed) {
      webSearchUsed = true;
      if (!toolsExecuted.includes("openai.web_search")) toolsExecuted.push("openai.web_search");
    }
    for (const source of extracted.sources) sources.set(source.url, source);

    const calls = functionCalls(payload);
    if (!calls.length) {
      const rawText = extracted.text || "İşlem tamamlandı fakat ROSTA Insight metin yanıtı üretemedi.";
      return buildResult(payload, config.model, compactRuthieText(rawText, latestUserText), webSearchUsed, sources, toolsExecuted);
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
        const prefix = extracted.text ? `${compactRuthieText(extracted.text, latestUserText)} ` : "";
        return buildResult(
          payload,
          config.model,
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
        output: JSON.stringify(result),
      });
    }

    const priorOutput = Array.isArray(payload.output) ? payload.output : [];
    input = [...input, ...priorOutput, ...outputs];
  }

  const fallback = extractResponse(lastPayload).text || "Araç işlemi tamamlanamadı. İsteği daralt.";
  return buildResult(lastPayload, config.model, compactRuthieText(fallback, latestUserText), webSearchUsed, sources, toolsExecuted);
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
  const model = clean(env.RUTHIE_CHAT_MODEL);
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
