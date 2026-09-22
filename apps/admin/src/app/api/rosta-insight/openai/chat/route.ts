import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  calculateRuthieApiCost,
  formatRuthieUsd,
  RUTHIE_COST_CONFIRM_THRESHOLD_USD,
} from "@/lib/ruthieApiCost";
import {
  appendRuthieMessage,
  buildRuthieUnifiedContext,
  ensureRuthieConversation,
} from "@/lib/ruthieConversationStore";
import {
  normalizeRuthieChatMessages,
  RuthieOpenAIError,
  type RuthieChatMessage,
} from "@/lib/ruthieOpenAI";
import { buildRuthiePanelSnapshot } from "@/lib/ruthiePanelContext";
import {
  createRuthieAdminAgentResponseV2,
  type RuthieAttachmentInput,
} from "@/lib/ruthieAdminAgentRuntimeV2";
import { RuthieRuntimeError } from "@/lib/ruthieRuntime";
import { createRuthieUsageMeter } from "@/lib/ruthieUsageMeter";
import { noStoreHeaders } from "@/lib/websiteRevalidate";
import { consumeRuthieProviderUsage } from "@/lib/ruthieUsageGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const COST_APPROVAL_TTL_MS = 10 * 60 * 1_000;
const ALLOWED_FILE_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

type RawChatBody = {
  messages?: unknown;
  attachments?: unknown;
  conversationId?: unknown;
  clientMessageId?: unknown;
  plugins?: unknown;
};
type PendingBudgetRequest = { body: RawChatBody; expiresAt: number };
type ChatBudgetState = {
  spentUsd: number;
  approvedThroughUsd: number;
  pending: PendingBudgetRequest | null;
};

const chatBudgets = new Map<string, ChatBudgetState>();

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const actorId = String(auth.profile.id);
  const correlationId = normalizeCorrelationId(request.headers.get("x-correlation-id"));
  const usageGuard = consumeRuthieProviderUsage({ actorId, kind: "chat" });
  if (!usageGuard.allowed) {
    return NextResponse.json({
      ok: false,
      error: {
        code: usageGuard.limit === "daily" ? "ROSTA INSIGHT_DAILY_USAGE_LIMIT" : "ROSTA INSIGHT_RATE_LIMIT",
        message: usageGuard.limit === "daily"
          ? "ROSTA Insight için günlük sohbet sınırına ulaşıldı."
          : "Çok sık ROSTA Insight isteği gönderildi. Kısa süre sonra yeniden dene.",
        retryable: true,
        correlationId,
        retryAfterSeconds: usageGuard.retryAfterSeconds,
      },
    }, {
      status: 429,
      headers: { ...noStoreHeaders(), "Retry-After": String(usageGuard.retryAfterSeconds) },
    });
  }

  try {
    let rawBody = await request.json().catch(() => null) as RawChatBody | null;
    if (!rawBody) rawBody = {};

    const budget = getChatBudget(actorId);
    expirePendingBudgetRequest(budget);
    const decision = approvalDecision(lastUserText(rawBody.messages));

    if (budget.pending) {
      if (decision === "reject") {
        budget.pending = null;
        return budgetMessage(
          `İptal edildi. Harcama ${formatROSTA InsightUsd(budget.spentUsd)}.`,
          budget,
          correlationId,
        );
      }
      if (decision !== "accept") return budgetApprovalMessage(budget, correlationId);

      rawBody = budget.pending.body;
      budget.pending = null;
      while (budget.approvedThroughUsd <= budget.spentUsd) {
        budget.approvedThroughUsd += RUTHIE_COST_CONFIRM_THRESHOLD_USD;
      }
    } else if (budget.spentUsd >= budget.approvedThroughUsd) {
      budget.pending = { body: rawBody, expiresAt: Date.now() + COST_APPROVAL_TTL_MS };
      return budgetApprovalMessage(budget, correlationId);
    }

    const requestMessages = normalizeRuthieChatMessages(rawBody.messages);
    const attachments = normalizeAttachments(rawBody.attachments);
    const requestedConversationId = normalizeConversationId(rawBody.conversationId) || crypto.randomUUID();
    const clientMessageId = normalizeClientMessageId(rawBody.clientMessageId) || crypto.randomUUID();
    const lastUserMessage = requestMessages.at(-1)!;

    let conversationId = requestedConversationId;
    let agentMessages: RuthieChatMessage[] = requestMessages;
    let conversationPersistence = false;
    let persistenceWarning: string | null = null;

    try {
      const conversation = await ensureRuthieConversation({
        supabase: auth.supabase,
        profileId: actorId,
        conversationId: requestedConversationId,
        title: lastUserMessage.text,
        surface: "chat",
      });
      conversationId = String(conversation.id);
      await appendRuthieMessage({
        supabase: auth.supabase,
        profileId: actorId,
        conversationId,
        role: "user",
        surface: "chat",
        text: lastUserMessage.text,
        clientMessageId,
        metadata: {
          attachmentCount: attachments.length,
          plugins: Array.isArray(rawBody.plugins) ? rawBody.plugins.filter((item) => typeof item === "string").slice(0, 30) : [],
        },
      });
      const unified = await buildRuthieUnifiedContext({
        supabase: auth.supabase,
        profileId: actorId,
        conversationId,
        messageLimit: 40,
      });
      const sharedMessages: RuthieChatMessage[] = unified.messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-40)
        .map((message) => ({ role: message.role as "user" | "assistant", text: message.text }));
      if (unified.memories.length) {
        sharedMessages.unshift({
          role: "assistant",
          text: [
            "Kalıcı ROSTA Insight hafızası. Güncel istekle çelişmedikçe uygula:",
            ...unified.memories.map((memory, index) => `${index + 1}. ${memory.content}`),
          ].join("\n"),
        });
      }
      agentMessages = sharedMessages.slice(-40);
      conversationPersistence = true;
    } catch (storageError) {
      persistenceWarning = storageError instanceof Error ? storageError.message : "Ortak ROSTA Insight hafızası kullanılamadı.";
    }

    const panelSnapshot = await buildRuthiePanelSnapshot(auth.supabase);
    const meter = createRuthieUsageMeter();
    const response = await createRuthieAdminAgentResponseV2({
      request,
      messages: agentMessages,
      attachments,
      actorId,
      actorName: auth.profile.full_name,
      actorEmail: auth.profile.email,
      correlationId,
      panelSnapshot,
      fetchImpl: meter.fetchImpl,
    });
    const exactUsage = meter.usage();
    const resolvedModel = meter.model() || response.model;
    const apiCost = calculateRuthieApiCost(resolvedModel, exactUsage, {
      webSearchCalls: meter.webSearchCalls(),
    });
    budget.spentUsd += apiCost.usd;

    let assistantMessageId = crypto.randomUUID();
    if (conversationPersistence) {
      try {
        const storedAssistant = await appendRuthieMessage({
          supabase: auth.supabase,
          profileId: actorId,
          conversationId,
          role: "assistant",
          surface: "chat",
          text: response.text,
          clientMessageId: assistantMessageId,
          metadata: {
            model: resolvedModel,
            responseId: response.responseId,
            toolsExecuted: response.toolsExecuted,
            webSearchUsed: response.webSearchUsed,
          },
        });
        assistantMessageId = storedAssistant.clientMessageId;
      } catch (storageError) {
        persistenceWarning = storageError instanceof Error ? storageError.message : "ROSTA Insight yanıtı ortak hafızaya kaydedilemedi.";
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "admin_agent_live",
      response: {
        ...response,
        text: response.text.trim(),
        model: resolvedModel,
        usage: exactUsage,
        apiCost,
        conversationId,
        assistantMessageId,
        conversationPersistence,
        persistenceWarning,
        costBudget: {
          spentUsd: budget.spentUsd,
          approvedThroughUsd: budget.approvedThroughUsd,
          thresholdUsd: RUTHIE_COST_CONFIRM_THRESHOLD_USD,
        },
      },
      correlationId,
      panelAccess: {
        role: "admin",
        mode: "admin_tools_live",
        canAnalyzePanel: true,
        canExecuteAdminTools: true,
        canAnalyzeAttachments: true,
        commandPolicy: "signed_confirmation_for_writes",
      },
      toolsExecuted: response.toolsExecuted,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return runtimeErrorResponse(error, correlationId);
  }
}

function getChatBudget(actorId: string): ChatBudgetState {
  const existing = chatBudgets.get(actorId);
  if (existing) return existing;
  const created: ChatBudgetState = {
    spentUsd: 0,
    approvedThroughUsd: RUTHIE_COST_CONFIRM_THRESHOLD_USD,
    pending: null,
  };
  chatBudgets.set(actorId, created);
  return created;
}

function expirePendingBudgetRequest(state: ChatBudgetState) {
  if (state.pending && state.pending.expiresAt <= Date.now()) state.pending = null;
}

function budgetApprovalMessage(state: ChatBudgetState, correlationId: string) {
  const nextLimit = state.approvedThroughUsd + RUTHIE_COST_CONFIRM_THRESHOLD_USD;
  return budgetMessage(
    `Harcama ${formatROSTA InsightUsd(state.spentUsd)}. ${formatROSTA InsightUsd(nextLimit)} sınırına kadar devam edeyim mi? “Onaylıyorum” veya “İptal” yaz.`,
    state,
    correlationId,
    true,
  );
}

function budgetMessage(text: string, state: ChatBudgetState, correlationId: string, approvalRequired = false) {
  return NextResponse.json({
    ok: true,
    mode: "cost_budget_gate",
    response: {
      responseId: "",
      model: "",
      text,
      webSearchUsed: false,
      sources: [],
      toolsExecuted: [],
      usage: null,
      apiCost: null,
      costApprovalRequired: approvalRequired,
      costBudget: {
        spentUsd: state.spentUsd,
        approvedThroughUsd: state.approvedThroughUsd,
        thresholdUsd: RUTHIE_COST_CONFIRM_THRESHOLD_USD,
      },
    },
    correlationId,
  }, { headers: noStoreHeaders() });
}

function approvalDecision(value: string): "accept" | "reject" | "unclear" {
  const text = value.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  const rejects = ["iptal", "hayır", "hayir", "reddet", "vazgeç", "vazgec", "istemiyorum"];
  if (rejects.some((term) => text.includes(term))) return "reject";
  const accepts = ["onaylıyorum", "onayliyorum", "onayla", "evet", "kabul", "devam", "tamam", "tamamdır", "tamamdir"];
  if (accepts.some((term) => text === term || text.startsWith(`${term} `))) return "accept";
  return "unclear";
}

function lastUserText(value: unknown) {
  if (!Array.isArray(value)) return "";
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const item = value[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    if (raw.role === "user" && typeof raw.text === "string") return raw.text;
  }
  return "";
}

function normalizeConversationId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function normalizeClientMessageId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

function normalizeAttachments(value: unknown): RuthieAttachmentInput[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new RuthieRuntimeError({ code: "ROSTA INSIGHT_ATTACHMENTS_INVALID", message: "Dosya ekleri geçersiz.", status: 400 });
  }
  if (value.length > MAX_ATTACHMENTS) {
    throw new RuthieRuntimeError({ code: "ROSTA INSIGHT_ATTACHMENTS_LIMIT", message: `En fazla ${MAX_ATTACHMENTS} dosya ekleyebilirsin.`, status: 400 });
  }

  let totalBytes = 0;
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new RuthieRuntimeError({ code: "ROSTA INSIGHT_ATTACHMENT_INVALID", message: `${index + 1}. dosya geçersiz.`, status: 400 });
    }
    const raw = item as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 180) : "";
    const mimeType = typeof raw.mimeType === "string" ? raw.mimeType.trim().toLowerCase() : "";
    const dataUrl = typeof raw.dataUrl === "string" ? raw.dataUrl.trim() : "";
    if (!name || !mimeType || !dataUrl) {
      throw new RuthieRuntimeError({ code: "ROSTA INSIGHT_ATTACHMENT_FIELDS_REQUIRED", message: `${index + 1}. dosyanın bilgileri eksik.`, status: 400 });
    }
    if (!mimeType.startsWith("image/") && !ALLOWED_FILE_MIMES.has(mimeType)) {
      throw new RuthieRuntimeError({ code: "ROSTA INSIGHT_ATTACHMENT_TYPE_UNSUPPORTED", message: `${name} dosya türü desteklenmiyor.`, status: 415 });
    }
    const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
    if (!match || match[1].toLowerCase() !== mimeType) {
      throw new RuthieRuntimeError({ code: "ROSTA INSIGHT_ATTACHMENT_DATA_INVALID", message: `${name} dosya verisi geçersiz.`, status: 400 });
    }
    const base64 = match[2].replace(/\s+/g, "");
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    const bytes = Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
    if (!bytes || bytes > MAX_ATTACHMENT_BYTES) {
      throw new RuthieRuntimeError({ code: "ROSTA INSIGHT_ATTACHMENT_TOO_LARGE", message: `${name} en fazla 8 MB olabilir.`, status: 413 });
    }
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new RuthieRuntimeError({ code: "ROSTA INSIGHT_ATTACHMENTS_TOTAL_TOO_LARGE", message: "Eklenen dosyaların toplamı 20 MB'ı geçemez.", status: 413 });
    }
    return { name, mimeType, dataUrl: `data:${mimeType};base64,${base64}` };
  });
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
      code: "ROSTA INSIGHT_CHAT_UNEXPECTED_ERROR",
      message: error instanceof Error ? error.message : "ROSTA Insight sohbet isteği başarısız oldu.",
      retryable: false,
      correlationId,
    },
  }, { status: 500, headers: noStoreHeaders() });
}

function normalizeCorrelationId(value: string | null): string {
  const normalized = value?.trim().slice(0, 128);
  return normalized || crypto.randomUUID();
}
