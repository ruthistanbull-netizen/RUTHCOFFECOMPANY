import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { MetaMarketingError, requireMetaConnectionConfig, type MetaConnectionConfig } from "@/lib/integrations/metaMarketing";
import { requireRuthieOpenAIConfig, RuthieOpenAIError } from "@/lib/ruthieOpenAI";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };
const REQUEST_TIMEOUT_MS = 25_000;

type ActionValue = { action_type?: string; value?: string | number };
type GraphPage<T> = { data?: T[]; paging?: { cursors?: { after?: string } } };
type Insight = {
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: ActionValue[];
  action_values?: ActionValue[];
};
type AdCreative = {
  id?: string;
  name?: string;
  thumbnail_url?: string;
  image_url?: string;
  object_story_spec?: Record<string, unknown>;
  asset_feed_spec?: Record<string, unknown>;
};
type AdRecord = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  created_time?: string;
  updated_time?: string;
  campaign?: { id?: string; name?: string };
  adset?: { id?: string; name?: string };
  creative?: AdCreative;
};
type MediaAsset = { type: "image" | "video"; url: string; label: string };

type AnalysisResult = {
  recommendation: "continue" | "optimize" | "pause" | "insufficient_data";
  confidence: number;
  headline: string;
  summary: string;
  why: string[];
  actions: string[];
  creativeAnalysis: string;
  budgetGuidance: string;
  metricAnalysis: Array<{ metric: string; observation: string; implication: string }>;
  risks: string[];
  nextCheck: string;
};

const PURCHASE_ACTIONS = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const CART_ACTIONS = ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const CHECKOUT_ACTIONS = ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
const CONTENT_ACTIONS = ["view_content", "omni_view_content", "offsite_conversion.fb_pixel_view_content"];
const LANDING_ACTIONS = ["landing_page_view", "omni_landing_page_view"];
const MESSAGE_ACTIONS = ["onsite_conversion.messaging_conversation_started_7d", "messaging_conversation_started_7d", "omni_messaging_conversation_started_7d"];

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const correlationId = request.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();

  try {
    const body = await request.json().catch(() => null) as { adId?: unknown; since?: unknown; until?: unknown } | null;
    const adId = typeof body?.adId === "string" ? body.adId.trim() : "";
    const since = typeof body?.since === "string" ? body.since.trim() : "";
    const until = typeof body?.until === "string" ? body.until.trim() : "";
    if (!/^\d+$/.test(adId)) throw new MetaMarketingError({ code: "META_INVALID_AD_ID", message: "Geçerli bir reklam kimliği gerekli.", status: 400 });
    const dateRange = validateDateRange(since, until);

    const meta = requireMetaConnectionConfig();
    const ruthie = requireRuthieOpenAIConfig();
    const timeRange = JSON.stringify(dateRange);

    const [ad, selectedInsights, accountInsights] = await Promise.all([
      graphGet<AdRecord>(meta, `/${adId}`, {
        fields: "id,name,status,effective_status,created_time,updated_time,campaign{id,name},adset{id,name},creative{id,name,thumbnail_url,image_url}",
      }),
      graphGetAll<Insight>(meta, `/${adId}/insights`, {
        time_range: timeRange,
        fields: "ad_id,ad_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,actions,action_values",
      }, 2),
      graphGetAll<Insight>(meta, `/${meta.adAccountId}/insights`, {
        level: "ad",
        time_range: timeRange,
        fields: "ad_id,ad_name,spend,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,actions,action_values",
      }, 5),
    ]);

    let creative = ad.creative;
    if (creative?.id) {
      try {
        creative = await graphGet<AdCreative>(meta, `/${creative.id}`, {
          fields: "id,name,thumbnail_url,image_url,object_story_spec,asset_feed_spec",
        });
      } catch {
        // Basic ad creative fields are enough for analysis if extended creative fields are unavailable.
      }
    }

    const selectedInsight = selectedInsights[0] || accountInsights.find((item) => String(item.ad_id) === adId) || {};
    const selectedMetrics = normalizeMetrics(selectedInsight);
    const peers = accountInsights.filter((item) => String(item.ad_id || "") !== adId).map(normalizeMetrics).filter((item) => item.spend > 0);
    const benchmark = buildBenchmark(peers);
    const media = extractMedia(creative);

    const prompt = buildAnalysisPrompt({
      ad: {
        id: adId,
        name: ad.name || selectedInsight.ad_name || `Reklam ${adId}`,
        status: ad.effective_status || ad.status || "UNKNOWN",
        campaign: ad.campaign?.name || "",
        adset: ad.adset?.name || "",
        creativeName: creative?.name || "",
      },
      dateRange,
      metrics: selectedMetrics,
      benchmark,
      peerCount: peers.length,
      media,
    });

    const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
    for (const asset of media.slice(0, 4)) {
      if (/^https:\/\//i.test(asset.url)) content.push({ type: "input_image", image_url: asset.url, detail: "low" });
    }

    const response = await fetch(`${ruthie.baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ruthie.apiKey}`,
        ...(ruthie.project ? { "OpenAI-Project": ruthie.project } : {}),
        ...(ruthie.organization ? { "OpenAI-Organization": ruthie.organization } : {}),
      },
      body: JSON.stringify({
        model: ruthie.chatModel,
        store: false,
        instructions: "Sen ROSTA Commerce içindeki ROSTA Insight reklam analiz uzmanısın. Yalnız verilen Meta verisini ve varsa kreatif görsellerini kullan. Verilmeyen kâr marjı, hedef ROAS, ürün maliyeti veya attribution detaylarını uydurma. Kararını Türkçe, uygulanabilir ve ölçülü ver. Reklam üzerinde otomatik değişiklik yapma; yalnız öneri üret.",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name: "rosta_insight_meta_ad_analysis",
            strict: true,
            schema: analysisSchema(),
          },
        },
        max_output_tokens: 2200,
        metadata: {
          surface: "meta_ad_analysis",
          actor_id: auth.user.id,
          correlation_id: correlationId,
          ad_id: adId,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) throw await openAIError(response);
    const raw = await response.json() as Record<string, unknown>;
    const text = extractOutputText(raw);
    if (!text) throw new RuthieOpenAIError({ code: "RUTHIE_AD_ANALYSIS_EMPTY", message: "ROSTA Insight reklam analizi boş yanıt döndürdü.", status: 502, retryable: true, requestId: response.headers.get("x-request-id") });

    let analysis: AnalysisResult;
    try {
      analysis = JSON.parse(text) as AnalysisResult;
    } catch {
      throw new RuthieOpenAIError({ code: "RUTHIE_AD_ANALYSIS_INVALID_JSON", message: "ROSTA Insight reklam analizi geçerli yapılandırılmış yanıt döndürmedi.", status: 502, retryable: true, requestId: response.headers.get("x-request-id") });
    }

    await writeAudit(auth, {
      action: "meta.ad_analysis_generated",
      entityId: adId,
      correlationId,
      metadata: {
        since,
        until,
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
        spend: selectedMetrics.spend,
        purchases: selectedMetrics.purchases,
        revenue: selectedMetrics.revenue,
        roas: selectedMetrics.roas,
        peer_count: peers.length,
      },
    });

    return NextResponse.json({
      ok: true,
      correlationId,
      generatedAt: new Date().toISOString(),
      ad: {
        id: adId,
        name: ad.name || selectedInsight.ad_name || `Reklam ${adId}`,
        status: ad.effective_status || ad.status || "UNKNOWN",
        campaign: ad.campaign || null,
        adset: ad.adset || null,
        creative: { id: creative?.id || null, name: creative?.name || null, media },
      },
      dateRange,
      metrics: selectedMetrics,
      benchmark,
      peerCount: peers.length,
      analysis,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const normalized = normalizeError(error);
    return NextResponse.json({ ok: false, correlationId, error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable } }, { status: normalized.status, headers: NO_STORE_HEADERS });
  }
}

function analysisSchema() {
  const stringArray = { type: "array", items: { type: "string" } };
  return {
    type: "object",
    additionalProperties: false,
    required: ["recommendation", "confidence", "headline", "summary", "why", "actions", "creativeAnalysis", "budgetGuidance", "metricAnalysis", "risks", "nextCheck"],
    properties: {
      recommendation: { type: "string", enum: ["continue", "optimize", "pause", "insufficient_data"] },
      confidence: { type: "number", minimum: 0, maximum: 100 },
      headline: { type: "string" },
      summary: { type: "string" },
      why: stringArray,
      actions: stringArray,
      creativeAnalysis: { type: "string" },
      budgetGuidance: { type: "string" },
      metricAnalysis: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["metric", "observation", "implication"],
          properties: { metric: { type: "string" }, observation: { type: "string" }, implication: { type: "string" } },
        },
      },
      risks: stringArray,
      nextCheck: { type: "string" },
    },
  };
}

function buildAnalysisPrompt(input: {
  ad: { id: string; name: string; status: string; campaign: string; adset: string; creativeName: string };
  dateRange: { since: string; until: string };
  metrics: ReturnType<typeof normalizeMetrics>;
  benchmark: ReturnType<typeof buildBenchmark>;
  peerCount: number;
  media: MediaAsset[];
}) {
  return `Aşağıdaki Meta reklamını ${input.dateRange.since} - ${input.dateRange.until} tarih aralığı için analiz et.\n\nREKLAM:\n${JSON.stringify(input.ad, null, 2)}\n\nREKLAM METRİKLERİ:\n${JSON.stringify(input.metrics, null, 2)}\n\nAYNI DÖNEM DİĞER REKLAMLAR BENCHMARK'I (${input.peerCount} reklam):\n${JSON.stringify(input.benchmark, null, 2)}\n\nKREATİF MEDYA:\n${JSON.stringify(input.media.map((item) => ({ type: item.type, label: item.label })), null, 2)}\n\nKarar verirken satış hunisini birlikte değerlendir: içerik görüntüleme -> sepete ekleme -> checkout -> alışveriş. CTR/CPC/CPM, frekans, harcama ve ROAS'ı peer benchmark ile karşılaştır. Yeterli harcama veya dönüşüm yoksa kesin durdur/devam kararı verme ve insufficient_data kullan. Kâr marjı/başabaş ROAS verilmediği için kârlılık eşiği uydurma. Varsa gönderilen kreatif görsellerinin dikkat çekiciliği, ürün odağı ve ilk bakış anlaşılırlığı hakkında yorum yap; video için yalnız thumbnail gördüysen bunu açıkça belirt. Bütçe önerisinde kesin TL tutarı uydurma; ölçekleme/koruma/azaltma yönünü ve hangi koşulda yapılacağını söyle.`;
}

function normalizeMetrics(insight: Insight) {
  const spend = number(insight.spend);
  const purchases = actionValue(insight.actions, PURCHASE_ACTIONS);
  const revenue = actionValue(insight.action_values, PURCHASE_ACTIONS);
  return {
    spend,
    purchases,
    revenue,
    roas: spend > 0 ? revenue / spend : 0,
    impressions: number(insight.impressions),
    reach: number(insight.reach),
    frequency: number(insight.frequency),
    clicks: number(insight.clicks),
    linkClicks: number(insight.inline_link_clicks),
    ctr: number(insight.ctr),
    cpc: number(insight.cpc),
    cpm: number(insight.cpm),
    contentViews: actionValue(insight.actions, CONTENT_ACTIONS),
    landingPageViews: actionValue(insight.actions, LANDING_ACTIONS),
    addToCart: actionValue(insight.actions, CART_ACTIONS),
    initiateCheckout: actionValue(insight.actions, CHECKOUT_ACTIONS),
    messages: actionValue(insight.actions, MESSAGE_ACTIONS),
  };
}

function buildBenchmark(rows: Array<ReturnType<typeof normalizeMetrics>>) {
  if (!rows.length) return null;
  const average = (key: keyof ReturnType<typeof normalizeMetrics>) => rows.reduce((sum, row) => sum + number(row[key]), 0) / rows.length;
  return {
    spend: average("spend"),
    purchases: average("purchases"),
    revenue: average("revenue"),
    roas: average("roas"),
    ctr: average("ctr"),
    cpc: average("cpc"),
    cpm: average("cpm"),
    frequency: average("frequency"),
    contentViews: average("contentViews"),
    addToCart: average("addToCart"),
    initiateCheckout: average("initiateCheckout"),
  };
}

function extractMedia(creative?: AdCreative): MediaAsset[] {
  if (!creative) return [];
  const output: MediaAsset[] = [];
  const seen = new Set<string>();
  const push = (type: "image" | "video", url: unknown, label: string) => {
    if (typeof url !== "string" || !/^https:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    output.push({ type, url, label });
  };

  push("image", creative.image_url, "Kreatif görseli");
  push("image", creative.thumbnail_url, "Kreatif önizlemesi");

  const story = asRecord(creative.object_story_spec);
  const videoData = asRecord(story?.video_data);
  const photoData = asRecord(story?.photo_data);
  const linkData = asRecord(story?.link_data);
  push("video", videoData?.image_url, "Video thumbnail");
  push("image", photoData?.url, "Fotoğraf");
  push("image", linkData?.picture, "Bağlantı görseli");

  const feed = asRecord(creative.asset_feed_spec);
  for (const item of asRecordArray(feed?.images)) push("image", item.url || item.picture, "Dinamik görsel");
  for (const item of asRecordArray(feed?.videos)) push("video", item.thumbnail_url || item.image_url, "Dinamik video");

  const hasVideoId = typeof videoData?.video_id === "string" || asRecordArray(feed?.videos).some((item) => Boolean(item.video_id));
  if (hasVideoId && !output.some((item) => item.type === "video") && creative.thumbnail_url) {
    output.unshift({ type: "video", url: creative.thumbnail_url, label: "Video thumbnail" });
  }
  return output.slice(0, 8);
}

async function graphGet<T>(config: MetaConnectionConfig, path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${config.graphOrigin}/${config.graphVersion}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${config.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw await metaProviderError(response);
  return await response.json() as T;
}

async function graphGetAll<T>(config: MetaConnectionConfig, path: string, query: Record<string, string>, maxPages: number): Promise<T[]> {
  const result: T[] = [];
  let after = "";
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await graphGet<GraphPage<T>>(config, path, { ...query, limit: "100", ...(after ? { after } : {}) });
    const batch = Array.isArray(payload.data) ? payload.data : [];
    result.push(...batch);
    const next = payload.paging?.cursors?.after || "";
    if (!next || !batch.length || next === after) break;
    after = next;
  }
  return result;
}

async function metaProviderError(response: Response) {
  let payload: { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; fbtrace_id?: string } } = {};
  try { payload = await response.clone().json(); } catch { /* safe fallback */ }
  return new MetaMarketingError({
    code: "META_PROVIDER_ERROR",
    message: payload.error?.message?.slice(0, 500) || `Meta isteği ${response.status} durumuyla başarısız oldu.`,
    status: response.status === 401 || response.status === 403 ? 502 : response.status >= 500 ? 502 : 400,
    retryable: payload.error?.is_transient === true || response.status === 429 || response.status >= 500,
    providerCode: payload.error?.code,
    providerSubcode: payload.error?.error_subcode,
    traceId: payload.error?.fbtrace_id,
  });
}

async function openAIError(response: Response) {
  let message = `ROSTA Insight analiz isteği ${response.status} durumuyla başarısız oldu.`;
  try {
    const payload = await response.clone().json() as { error?: { message?: string } };
    if (payload.error?.message) message = payload.error.message.slice(0, 500);
  } catch { /* safe fallback */ }
  return new RuthieOpenAIError({ code: "RUTHIE_AD_ANALYSIS_PROVIDER_ERROR", message, status: response.status >= 500 ? 502 : 400, retryable: response.status === 429 || response.status >= 500, requestId: response.headers.get("x-request-id") });
}

function extractOutputText(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown }).content) ? (item as { content: unknown[] }).content : [];
    for (const part of content) {
      if ((part as { type?: unknown }).type === "output_text" && typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
    }
  }
  return "";
}

function validateDateRange(since: string, until: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new MetaMarketingError({ code: "META_INVALID_DATE_RANGE", message: "Analiz için başlangıç ve bitiş tarihi seçmelisin.", status: 400 });
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  if (start > end) throw new MetaMarketingError({ code: "META_INVALID_DATE_RANGE", message: "Başlangıç tarihi bitiş tarihinden sonra olamaz.", status: 400 });
  if ((end.getTime() - start.getTime()) / 86_400_000 > 369) throw new MetaMarketingError({ code: "META_DATE_RANGE_TOO_LARGE", message: "Tek analizde en fazla 370 gün seçebilirsin.", status: 400 });
  return { since, until };
}

function actionValue(list: ActionValue[] | undefined, candidates: string[]) {
  if (!Array.isArray(list)) return 0;
  for (const type of candidates) {
    const hit = list.find((item) => item.action_type === type);
    if (hit) return number(hit.value);
  }
  return 0;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function normalizeError(error: unknown) {
  if (error instanceof MetaMarketingError || error instanceof RuthieOpenAIError) return error;
  return new RuthieOpenAIError({ code: "RUTHIE_AD_ANALYSIS_FAILED", message: "ROSTA Insight reklam analizi tamamlanamadı.", status: 500, retryable: true });
}

async function writeAudit(auth: { supabase: any; user: { id: string } }, input: { action: string; entityId: string; correlationId: string; metadata: Record<string, unknown> }) {
  try {
    await auth.supabase.from("commerce_audit_logs").insert({
      action: input.action,
      entity_type: "meta_ad",
      entity_id: input.entityId,
      actor_type: "user",
      actor_id: auth.user.id,
      metadata: { ...input.metadata, correlation_id: input.correlationId },
    });
  } catch {
    // Analysis should still be returned if audit storage is temporarily unavailable.
  }
}
