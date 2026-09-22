import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { MetaMarketingError, requireMetaConnectionConfig, type MetaConnectionConfig } from "@/lib/integrations/metaMarketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };
const REQUEST_TIMEOUT_MS = 18_000;
const CREATIVE_CACHE_MS = 5 * 60_000;

type GraphPage<T> = { data?: T[]; paging?: { cursors?: { after?: string } } };
type Creative = {
  id?: string;
  name?: string;
  thumbnail_url?: string;
  image_url?: string;
  object_story_spec?: Record<string, unknown>;
  asset_feed_spec?: Record<string, unknown>;
};
type Ad = {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign?: { id?: string; name?: string };
  adset?: { id?: string; name?: string };
  creative?: Creative;
};
type MediaAsset = { type: "image" | "video"; url: string; label: string };
type CreativeRow = {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  campaign: Ad["campaign"] | null;
  adset: Ad["adset"] | null;
  creative: { id: string | null; name: string | null; media: MediaAsset[] };
};
type CreativeCache = { rows: CreativeRow[]; fetchedAt: string; expiresAt: number };

let creativeCache: CreativeCache | null = null;
let creativeInFlight: Promise<CreativeCache> | null = null;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const config = requireMetaConnectionConfig();
    const snapshot = await getCreativeSnapshot(config);
    return NextResponse.json({
      ok: true,
      fetchedAt: snapshot.fetchedAt,
      ads: snapshot.rows,
    }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const normalized = error instanceof MetaMarketingError
      ? error
      : new MetaMarketingError({ code: "META_CREATIVE_LIST_FAILED", message: "Meta reklam kreatifleri alınamadı.", status: 502, retryable: true });
    return NextResponse.json({ ok: false, error: { code: normalized.code, message: normalized.message, retryable: normalized.retryable } }, { status: normalized.status, headers: NO_STORE_HEADERS });
  }
}

async function getCreativeSnapshot(config: MetaConnectionConfig): Promise<CreativeCache> {
  if (creativeCache && creativeCache.expiresAt > Date.now()) return creativeCache;
  if (creativeInFlight) return creativeInFlight;

  creativeInFlight = (async () => {
    const ads = await graphGetAll<Ad>(config, `/${config.adAccountId}/ads`, {
      fields: "id,name,status,effective_status,campaign{id,name},adset{id,name},creative{id,name,thumbnail_url,image_url,object_story_spec,asset_feed_spec}",
    }, 2);

    const snapshot: CreativeCache = {
      fetchedAt: new Date().toISOString(),
      expiresAt: Date.now() + CREATIVE_CACHE_MS,
      rows: ads.map((ad) => ({
        id: ad.id || "",
        name: ad.name || "Reklam",
        status: ad.status || "UNKNOWN",
        effectiveStatus: ad.effective_status || ad.status || "UNKNOWN",
        campaign: ad.campaign || null,
        adset: ad.adset || null,
        creative: {
          id: ad.creative?.id || null,
          name: ad.creative?.name || null,
          media: extractMedia(ad.creative),
        },
      })).filter((ad) => ad.id),
    };
    creativeCache = snapshot;
    return snapshot;
  })().finally(() => {
    creativeInFlight = null;
  });

  return creativeInFlight;
}

function extractMedia(creative?: Creative): MediaAsset[] {
  if (!creative) return [];
  const output: MediaAsset[] = [];
  const seen = new Set<string>();
  const push = (type: "image" | "video", url: unknown, label: string) => {
    if (typeof url !== "string" || !/^https:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    output.push({ type, url, label });
  };

  const story = asRecord(creative.object_story_spec);
  const videoData = asRecord(story?.video_data);
  const photoData = asRecord(story?.photo_data);
  const linkData = asRecord(story?.link_data);
  const feed = asRecord(creative.asset_feed_spec);
  const feedVideos = asRecordArray(feed?.videos);

  if (videoData?.video_id || feedVideos.some((item) => item.video_id)) push("video", creative.thumbnail_url || videoData?.image_url, "Video");
  push("image", creative.image_url, "Görsel");
  if (!output.length) push("image", creative.thumbnail_url, "Önizleme");
  push("video", videoData?.image_url, "Video");
  push("image", photoData?.url, "Fotoğraf");
  push("image", linkData?.picture, "Bağlantı görseli");
  for (const item of asRecordArray(feed?.images)) push("image", item.url || item.picture, "Dinamik görsel");
  for (const item of feedVideos) push("video", item.thumbnail_url || item.image_url || creative.thumbnail_url, "Dinamik video");

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
  if (!response.ok) throw await providerError(response);
  return await response.json() as T;
}

async function graphGetAll<T>(config: MetaConnectionConfig, path: string, query: Record<string, string>, maxPages: number): Promise<T[]> {
  const result: T[] = [];
  let after = "";
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await graphGet<GraphPage<T>>(config, path, { ...query, limit: "500", ...(after ? { after } : {}) });
    const batch = Array.isArray(payload.data) ? payload.data : [];
    result.push(...batch);
    const next = payload.paging?.cursors?.after || "";
    if (!next || !batch.length || next === after) break;
    after = next;
  }
  return result;
}

async function providerError(response: Response) {
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}
