import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { MetaMarketingError, requireMetaConnectionConfig, type MetaConnectionConfig } from "@/lib/integrations/metaMarketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };
const REQUEST_TIMEOUT_MS = 18_000;
const BASE_CACHE_MS = 60_000;
const INSIGHT_CACHE_MS = 30_000;
const DEFAULT_ACCOUNT_TIMEZONE = "Europe/Istanbul";
const RANGE_PRESETS: Record<string, string> = {
  "7d": "last_7d",
  "30d": "last_30d",
  "90d": "last_90d",
  all: "maximum",
};

type ActionValue = { action_type?: string; value?: string | number };
type GraphPage<T> = { data?: T[]; paging?: { cursors?: { after?: string } } };
type AccountRaw = { id?: string; name?: string; account_status?: number; currency?: string; timezone_name?: string; balance?: string | number; amount_spent?: string | number; spend_cap?: string | number };
type AdRaw = {
  id?: string; name?: string; status?: string; effective_status?: string; created_time?: string; updated_time?: string;
  campaign?: { id?: string; name?: string }; adset?: { id?: string; name?: string };
  creative?: { id?: string; name?: string; thumbnail_url?: string; image_url?: string };
};
type InsightRaw = {
  ad_id?: string; ad_name?: string; campaign_id?: string; campaign_name?: string; adset_id?: string; adset_name?: string;
  impressions?: string; reach?: string; frequency?: string; clicks?: string; inline_link_clicks?: string; ctr?: string; cpc?: string; cpm?: string; spend?: string;
  actions?: ActionValue[]; action_values?: ActionValue[];
};
type BaseData = { account: AccountRaw; ads: AdRaw[] };
type TimedCache<T> = { value: T; expiresAt: number };

let baseCache: TimedCache<BaseData> | null = null;
const insightCache = new Map<string, TimedCache<InsightRaw[]>>();
const inFlight = new Map<string, Promise<unknown>>();

const PURCHASE_ACTIONS = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const LANDING_ACTIONS = ["landing_page_view", "omni_landing_page_view"];
const CART_ACTIONS = ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const CHECKOUT_ACTIONS = ["initiate_checkout", "omni_initiated_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];
const CONTENT_ACTIONS = ["view_content", "omni_view_content", "offsite_conversion.fb_pixel_view_content"];
const MESSAGE_ACTIONS = ["onsite_conversion.messaging_conversation_started_7d", "messaging_conversation_started_7d", "omni_messaging_conversation_started_7d", "onsite_conversion.messaging_first_reply"];
const ACTION_LABELS: Record<string, string> = {
  purchase: "Alışveriş", omni_purchase: "Alışveriş", "offsite_conversion.fb_pixel_purchase": "Alışveriş",
  add_to_cart: "Sepete ekleme", omni_add_to_cart: "Sepete ekleme", "offsite_conversion.fb_pixel_add_to_cart": "Sepete ekleme",
  initiate_checkout: "Ödeme başlatma", omni_initiated_checkout: "Ödeme başlatma", "offsite_conversion.fb_pixel_initiate_checkout": "Ödeme başlatma",
  view_content: "İçerik görüntüleme", omni_view_content: "İçerik görüntüleme", "offsite_conversion.fb_pixel_view_content": "İçerik görüntüleme",
  landing_page_view: "Açılış sayfası görüntüleme", omni_landing_page_view: "Açılış sayfası görüntüleme", link_click: "Bağlantı tıklaması",
  post_engagement: "Gönderi etkileşimi", page_engagement: "Sayfa etkileşimi", video_view: "Video görüntüleme", lead: "Potansiyel müşteri",
  "onsite_conversion.messaging_conversation_started_7d": "Başlatılan mesaj konuşması", messaging_conversation_started_7d: "Başlatılan mesaj konuşması",
  omni_messaging_conversation_started_7d: "Başlatılan mesaj konuşması", "onsite_conversion.messaging_first_reply": "Mesaj yanıtı",
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const requestedRange = url.searchParams.get("range") || "30d";
  const since = url.searchParams.get("since") || "";
  const until = url.searchParams.get("until") || "";
  const customRange = requestedRange === "custom" || Boolean(since || until);
  const range = customRange ? "custom" : requestedRange === "today" || RANGE_PRESETS[requestedRange] ? requestedRange : "30d";

  try {
    const config = requireMetaConnectionConfig();
    const cachedTimezone = baseCache?.value.account.timezone_name || DEFAULT_ACCOUNT_TIMEZONE;
    const today = dateInTimeZone(cachedTimezone);
    const dateRange = customRange
      ? validateCustomRange(since, until)
      : range === "today"
        ? { since: today, until: today }
        : null;
    const insightDateQuery: Record<string, string> = dateRange
      ? { time_range: JSON.stringify(dateRange) }
      : { date_preset: RANGE_PRESETS[range] || RANGE_PRESETS["30d"] };
    const insightKey = dateRange ? `${range}:${dateRange.since}:${dateRange.until}` : range;

    const [base, insights] = await Promise.all([
      getBaseData(config),
      getInsights(config, insightKey, insightDateQuery),
    ]);
    const { account, ads } = base;
    const accountState = accountStatus(account.account_status);
    const accountPaymentBlocked = accountState === "UNSETTLED";

    // İlk istekte fallback timezone kullanılmışsa ve hesap farklı bir timezone döndürürse
    // "Bugün" sorgusunu hesap timezone'una göre bir kez daha kesinleştir.
    let effectiveInsights = insights;
    let effectiveDateRange = dateRange;
    if (range === "today") {
      const accountTimezone = account.timezone_name || DEFAULT_ACCOUNT_TIMEZONE;
      const exactToday = dateInTimeZone(accountTimezone);
      if (exactToday !== dateRange?.since) {
        effectiveDateRange = { since: exactToday, until: exactToday };
        effectiveInsights = await getInsights(config, `today:${exactToday}`, { time_range: JSON.stringify(effectiveDateRange) });
      }
    }

    const insightByAd = new Map(effectiveInsights.filter((item) => item.ad_id).map((item) => [String(item.ad_id), item]));
    const adById = new Map(ads.filter((item) => item.id).map((item) => [String(item.id), item]));
    const allIds = new Set<string>([...adById.keys(), ...insightByAd.keys()]);

    const rows = [...allIds].map((id) => {
      const ad = adById.get(id);
      const insight = insightByAd.get(id);
      const spend = number(insight?.spend);
      const purchases = actionValue(insight?.actions, PURCHASE_ACTIONS);
      const revenue = actionValue(insight?.action_values, PURCHASE_ACTIONS);
      const rawEffectiveStatus = ad?.effective_status || ad?.status || "UNKNOWN";
      const effectiveStatus = accountPaymentBlocked && rawEffectiveStatus === "ACTIVE" ? "UNSETTLED" : rawEffectiveStatus;
      return {
        id,
        name: ad?.name || insight?.ad_name || `Reklam ${id}`,
        status: ad?.status || "UNKNOWN",
        effectiveStatus,
        createdTime: ad?.created_time || null,
        updatedTime: ad?.updated_time || null,
        campaign: { id: ad?.campaign?.id || insight?.campaign_id || null, name: ad?.campaign?.name || insight?.campaign_name || "Kampanya" },
        adset: { id: ad?.adset?.id || insight?.adset_id || null, name: ad?.adset?.name || insight?.adset_name || "Reklam seti" },
        creative: { id: ad?.creative?.id || null, name: ad?.creative?.name || null, thumbnailUrl: ad?.creative?.thumbnail_url || ad?.creative?.image_url || null },
        metrics: {
          spend,
          purchases,
          revenue,
          roas: spend > 0 ? revenue / spend : 0,
          impressions: number(insight?.impressions), reach: number(insight?.reach), frequency: number(insight?.frequency), clicks: number(insight?.clicks),
          linkClicks: number(insight?.inline_link_clicks), ctr: number(insight?.ctr), cpc: number(insight?.cpc), cpm: number(insight?.cpm),
          landingPageViews: actionValue(insight?.actions, LANDING_ACTIONS), addToCart: actionValue(insight?.actions, CART_ACTIONS),
          initiateCheckout: actionValue(insight?.actions, CHECKOUT_ACTIONS), contentViews: actionValue(insight?.actions, CONTENT_ACTIONS),
          messages: actionValue(insight?.actions, MESSAGE_ACTIONS), resultBreakdown: normalizeActionBreakdown(insight?.actions),
        },
      };
    }).sort((a, b) => b.metrics.spend - a.metrics.spend || b.metrics.revenue - a.metrics.revenue);

    const totals = rows.reduce((acc, row) => {
      acc.spend += row.metrics.spend; acc.purchases += row.metrics.purchases; acc.revenue += row.metrics.revenue; acc.impressions += row.metrics.impressions;
      acc.reach += row.metrics.reach; acc.linkClicks += row.metrics.linkClicks; acc.contentViews += row.metrics.contentViews; acc.addToCart += row.metrics.addToCart;
      acc.initiateCheckout += row.metrics.initiateCheckout; acc.messages += row.metrics.messages; return acc;
    }, { spend: 0, purchases: 0, revenue: 0, impressions: 0, reach: 0, linkClicks: 0, contentViews: 0, addToCart: 0, initiateCheckout: 0, messages: 0 });

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(), range, dateRange: effectiveDateRange,
      account: {
        id: account.id || config.adAccountId, name: account.name || "Meta Reklam Hesabı", status: accountState, statusCode: account.account_status || null,
        currency: account.currency || "TRY", timezone: account.timezone_name || DEFAULT_ACCOUNT_TIMEZONE, balance: minorMoney(account.balance), lifetimeSpend: minorMoney(account.amount_spent),
        spendCap: minorMoney(account.spend_cap), taxDebt: null as number | null, taxDebtAvailable: false,
        taxNote: "Meta Marketing API vergi tutarını ayrı alan olarak sunmuyor; panel tahmini vergiyi hesap bakiyesi üzerinden gösterir.",
        taxId: null, taxIdStatus: null, isTaxIdRequired: null, businessCountryCode: null,
        paymentBlocked: accountPaymentBlocked,
      },
      totals: {
        ...totals,
        roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
        cpc: totals.linkClicks > 0 ? totals.spend / totals.linkClicks : 0,
        cpm: totals.impressions > 0 ? totals.spend / totals.impressions * 1000 : 0,
      },
      ads: rows,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const normalized = error instanceof MetaMarketingError ? error : new MetaMarketingError({ code: "META_ADS_DASHBOARD_FAILED", message: "Meta reklam verileri alınamadı.", status: 502, retryable: true });
    return NextResponse.json({ ok: false, error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable, providerCode: normalized.providerCode, providerSubcode: normalized.providerSubcode, traceId: normalized.traceId } }, { status: normalized.status, headers: NO_STORE_HEADERS });
  }
}

async function getBaseData(config: MetaConnectionConfig): Promise<BaseData> {
  if (baseCache && baseCache.expiresAt > Date.now()) return baseCache.value;
  return dedupe("base", async () => {
    if (baseCache && baseCache.expiresAt > Date.now()) return baseCache.value;
    const [account, ads] = await Promise.all([
      graphGet<AccountRaw>(config, `/${config.adAccountId}`, { fields: "id,name,account_status,currency,timezone_name,balance,amount_spent,spend_cap" }),
      graphGetAll<AdRaw>(config, `/${config.adAccountId}/ads`, { fields: "id,name,status,effective_status,created_time,updated_time,campaign{id,name},adset{id,name},creative{id,name,thumbnail_url,image_url}" }, 3),
    ]);
    const value = { account, ads };
    baseCache = { value, expiresAt: Date.now() + BASE_CACHE_MS };
    return value;
  });
}

async function getInsights(config: MetaConnectionConfig, key: string, dateQuery: Record<string, string>): Promise<InsightRaw[]> {
  const cached = insightCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  return dedupe(`insights:${key}`, async () => {
    const fresh = insightCache.get(key);
    if (fresh && fresh.expiresAt > Date.now()) return fresh.value;
    const value = await graphGetAll<InsightRaw>(config, `/${config.adAccountId}/insights`, {
      level: "ad", ...dateQuery,
      fields: "ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,impressions,reach,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,spend,actions,action_values",
    }, 3);
    insightCache.set(key, { value, expiresAt: Date.now() + INSIGHT_CACHE_MS });
    if (insightCache.size > 16) {
      const oldest = insightCache.keys().next().value as string | undefined;
      if (oldest) insightCache.delete(oldest);
    }
    return value;
  });
}

async function dedupe<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = loader().finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); });
  inFlight.set(key, promise as Promise<unknown>);
  return promise;
}

async function graphGet<T>(config: MetaConnectionConfig, path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${config.graphOrigin}/${config.graphVersion}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${config.accessToken}` }, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw await providerError(response);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof MetaMarketingError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new MetaMarketingError({ code: "META_TIMEOUT", message: "Meta reklam verisi isteği zaman aşımına uğradı.", status: 504, retryable: true });
    throw new MetaMarketingError({ code: "META_NETWORK_ERROR", message: "Meta Marketing API bağlantısı kurulamadı.", status: 502, retryable: true });
  } finally { clearTimeout(timer); }
}

async function graphGetAll<T>(config: MetaConnectionConfig, path: string, query: Record<string, string>, maxPages = 3): Promise<T[]> {
  const result: T[] = [];
  let after = "";
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await graphGet<GraphPage<T>>(config, path, { ...query, limit: "500", ...(after ? { after } : {}) });
    const batch = Array.isArray(payload.data) ? payload.data : [];
    result.push(...batch);
    const next = payload.paging?.cursors?.after || "";
    if (!next || batch.length === 0 || next === after) break;
    after = next;
  }
  return result;
}

async function providerError(response: Response) {
  let payload: { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; fbtrace_id?: string } } = {};
  try { payload = await response.clone().json(); } catch { /* safe fallback */ }
  const provider = payload.error;
  return new MetaMarketingError({ code: "META_PROVIDER_ERROR", message: provider?.message?.slice(0, 500) || `Meta isteği ${response.status} durumuyla başarısız oldu.`, status: response.status === 401 || response.status === 403 ? 502 : response.status >= 500 ? 502 : 400, retryable: provider?.is_transient === true || response.status === 429 || response.status >= 500, providerCode: typeof provider?.code === "number" ? provider.code : undefined, providerSubcode: typeof provider?.error_subcode === "number" ? provider.error_subcode : undefined, traceId: provider?.fbtrace_id });
}

function dateInTimeZone(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through to UTC date below
  }
  return new Date().toISOString().slice(0, 10);
}

function validateCustomRange(since: string, until: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new MetaMarketingError({ code: "META_INVALID_DATE_RANGE", message: "Özel tarih aralığı için başlangıç ve bitiş tarihi seçmelisin.", status: 400 });
  const start = new Date(`${since}T00:00:00Z`); const end = new Date(`${until}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) throw new MetaMarketingError({ code: "META_INVALID_DATE_RANGE", message: "Başlangıç tarihi bitiş tarihinden sonra olamaz.", status: 400 });
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 370) throw new MetaMarketingError({ code: "META_DATE_RANGE_TOO_LARGE", message: "Özel tarih aralığında en fazla 370 gün seçebilirsin; daha uzun dönem için Tüm zamanlar kullan.", status: 400 });
  return { since, until };
}

function normalizeActionBreakdown(list: ActionValue[] | undefined) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => { const type = typeof item?.action_type === "string" ? item.action_type : ""; return { type, label: ACTION_LABELS[type] || humanizeAction(type), value: number(item?.value) }; }).filter((item) => item.type && item.value > 0).sort((a, b) => b.value - a.value);
}
function humanizeAction(value: string) { return value.replace(/^offsite_conversion\.fb_pixel_/, "").replace(/^onsite_conversion\./, "").replace(/^omni_/, "").replace(/[._]+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("tr-TR")); }
function number(value: unknown) { const parsed = typeof value === "number" ? value : Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function minorMoney(value: unknown) { return number(value) / 100; }
function actionValue(list: ActionValue[] | undefined, candidates: string[]) { if (!Array.isArray(list)) return 0; for (const type of candidates) { const hit = list.find((item) => item?.action_type === type); if (hit) return number(hit.value); } return 0; }
function accountStatus(value: unknown) { switch (Number(value)) { case 1: return "ACTIVE"; case 2: return "DISABLED"; case 3: return "UNSETTLED"; case 7: return "PENDING_RISK_REVIEW"; case 8: return "PENDING_SETTLEMENT"; case 9: return "IN_GRACE_PERIOD"; case 100: return "PENDING_CLOSURE"; case 101: return "CLOSED"; case 201: return "ANY_ACTIVE"; case 202: return "ANY_CLOSED"; default: return "UNKNOWN"; } }
