import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  MetaMarketingError,
  requireMetaConnectionConfig,
  type MetaConnectionConfig,
} from "@/lib/integrations/metaMarketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };
const REQUEST_TIMEOUT_MS = 18_000;
const PREVIEW_FRAME_TTL_SECONDS = 30 * 60;

type PreviewKey = "feed" | "story" | "reels" | "explore";
type GraphPreview = { body?: string };
type GraphPreviewPayload = { data?: GraphPreview[] };
type AdIdentity = { id?: string; name?: string; account_id?: string };
type PreviewPlacement = {
  key: PreviewKey;
  label: string;
  formats: string[];
  fallbackWidth: number;
  fallbackHeight: number;
};
type NativePreviewEmbed = {
  src: string;
  width: number;
  height: number;
  scrolling: "yes" | "no" | "auto";
};

const PREVIEW_PLACEMENTS: PreviewPlacement[] = [
  // Feed/Explore need the whole Instagram card canvas, not only the media
  // viewport. The taller fallback keeps profile, CTA, action row and caption
  // inside the native Meta preview before it is scaled to the phone screen.
  { key: "feed", label: "Instagram Feed", formats: ["INSTAGRAM_STANDARD"], fallbackWidth: 390, fallbackHeight: 820 },
  { key: "story", label: "Instagram Story", formats: ["INSTAGRAM_STORY"], fallbackWidth: 390, fallbackHeight: 844 },
  { key: "reels", label: "Instagram Reels", formats: ["INSTAGRAM_REELS"], fallbackWidth: 390, fallbackHeight: 844 },
  {
    key: "explore",
    label: "Instagram Keşfet",
    formats: [
      "INSTAGRAM_EXPLORE_IMMERSIVE",
      "INSTAGRAM_EXPLORE_CONTEXTUAL",
      "INSTAGRAM_EXPLORE_GRID_HOME",
      "INSTAGRAM_EXPLORE_HOME",
      "INSTAGRAM_EXPLORE",
    ],
    fallbackWidth: 390,
    fallbackHeight: 820,
  },
];

export async function GET(request: Request, context: { params: Promise<{ adId: string }> }) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { adId: rawAdId } = await context.params;
  const adId = String(rawAdId || "").trim();
  if (!/^\d+$/.test(adId)) {
    return NextResponse.json({ ok: false, error: { code: "META_INVALID_AD_ID", message: "Geçerli bir reklam kimliği gerekli." } }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const config = requireMetaConnectionConfig();
    const ad = await graphGet<AdIdentity>(config, `/${adId}`, { fields: "id,name,account_id" });
    const expectedAccountId = config.adAccountId.replace(/^act_/, "");
    if (!ad.account_id || String(ad.account_id) !== expectedAccountId) {
      throw new MetaMarketingError({ code: "META_AD_ACCOUNT_MISMATCH", message: "Bu reklam yapılandırılmış Meta reklam hesabına ait değil.", status: 403 });
    }

    const placements = await Promise.all(PREVIEW_PLACEMENTS.map((placement) => generatePlacementPreview(config, adId, placement)));
    return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), ad: { id: adId, name: ad.name || `Reklam ${adId}` }, placements }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const normalized = error instanceof MetaMarketingError
      ? error
      : new MetaMarketingError({ code: "META_AD_PREVIEW_FAILED", message: "Meta reklam önizlemeleri alınamadı.", status: 502, retryable: true });
    return NextResponse.json({
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
        providerCode: normalized.providerCode,
        providerSubcode: normalized.providerSubcode,
        traceId: normalized.traceId,
      },
    }, { status: normalized.status, headers: NO_STORE_HEADERS });
  }
}

async function generatePlacementPreview(config: MetaConnectionConfig, adId: string, placement: PreviewPlacement) {
  let lastError: MetaMarketingError | null = null;
  for (const format of placement.formats) {
    try {
      const payload = await graphGet<GraphPreviewPayload>(config, `/${adId}/previews`, { ad_format: format });
      const body = Array.isArray(payload.data) ? payload.data[0]?.body || "" : "";
      const embed = extractTrustedPreviewEmbed(body, placement);
      if (embed) {
        return {
          key: placement.key,
          label: placement.label,
          format,
          available: true,
          iframeUrl: createSignedPreviewFrameUrl(config, adId, format, embed),
          nativeWidth: embed.width,
          nativeHeight: embed.height,
          error: null,
        };
      }
      lastError = new MetaMarketingError({ code: "META_PREVIEW_EMPTY", message: "Meta bu yerleşim için görüntülenebilir bir önizleme döndürmedi.", status: 502, retryable: true });
    } catch (error) {
      lastError = error instanceof MetaMarketingError
        ? error
        : new MetaMarketingError({ code: "META_PREVIEW_FAILED", message: "Bu yerleşim için önizleme oluşturulamadı.", status: 502, retryable: true });
    }
  }
  return {
    key: placement.key,
    label: placement.label,
    format: placement.formats[0],
    available: false,
    iframeUrl: null,
    nativeWidth: null,
    nativeHeight: null,
    error: previewErrorMessage(lastError),
  };
}

function createSignedPreviewFrameUrl(config: MetaConnectionConfig, adId: string, format: string, embed: NativePreviewEmbed) {
  const exp = Math.floor(Date.now() / 1000) + PREVIEW_FRAME_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify(embed), "utf8").toString("base64url");
  const signature = createHmac("sha256", config.accessToken).update(`${adId}.${format}.${exp}.${payload}`).digest("hex");
  const params = new URLSearchParams({ format, exp: String(exp), p: payload, sig: signature });
  return `/api/meta-ads/${encodeURIComponent(adId)}/preview-frame?${params.toString()}`;
}

async function graphGet<T>(config: MetaConnectionConfig, path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${config.graphOrigin}/${config.graphVersion}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${config.accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw await providerError(response);
    return await response.json() as T;
  } catch (error) {
    if (error instanceof MetaMarketingError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MetaMarketingError({ code: "META_TIMEOUT", message: "Meta reklam önizlemesi zaman aşımına uğradı.", status: 504, retryable: true });
    }
    throw new MetaMarketingError({ code: "META_NETWORK_ERROR", message: "Meta Marketing API bağlantısı kurulamadı.", status: 502, retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

async function providerError(response: Response) {
  let payload: { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; fbtrace_id?: string } } = {};
  try { payload = await response.clone().json(); } catch { /* provider body optional */ }
  const provider = payload.error;
  return new MetaMarketingError({
    code: "META_PROVIDER_ERROR",
    message: provider?.message?.slice(0, 500) || `Meta isteği ${response.status} durumuyla başarısız oldu.`,
    status: response.status === 401 || response.status === 403 ? 502 : response.status >= 500 ? 502 : 400,
    retryable: provider?.is_transient === true || response.status === 429 || response.status >= 500,
    providerCode: typeof provider?.code === "number" ? provider.code : undefined,
    providerSubcode: typeof provider?.error_subcode === "number" ? provider.error_subcode : undefined,
    traceId: provider?.fbtrace_id,
  });
}

function extractTrustedPreviewEmbed(body: string, placement: PreviewPlacement): NativePreviewEmbed | null {
  if (!body) return null;
  const iframe = body.match(/<iframe\b[^>]*>/i)?.[0] || "";
  const srcMatch = iframe.match(/\bsrc=["']([^"']+)["']/i);
  if (!srcMatch?.[1]) return null;
  const decoded = decodeHtmlAttribute(srcMatch[1]);
  const absolute = decoded.startsWith("//") ? `https:${decoded}` : decoded;

  let trustedSrc = "";
  try {
    const url = new URL(absolute);
    const hostname = url.hostname.toLowerCase();
    const trusted = url.protocol === "https:" && (
      hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "instagram.com" || hostname.endsWith(".instagram.com")
    );
    if (!trusted) return null;
    trustedSrc = url.toString();
  } catch { return null; }

  const style = attributeValue(iframe, "style");
  const parsedWidth = dimensionValue(attributeValue(iframe, "width")) || styleDimension(style, "width");
  const parsedHeight = dimensionValue(attributeValue(iframe, "height")) || styleDimension(style, "height");
  const width = clampDimension(parsedWidth || placement.fallbackWidth, placement.fallbackWidth);
  // Provider frames can expose only the media viewport. Keep at least the full
  // known Instagram card canvas so controls/caption are not clipped.
  const height = clampDimension(Math.max(parsedHeight || 0, placement.fallbackHeight), placement.fallbackHeight);
  const scrollingRaw = String(attributeValue(iframe, "scrolling") || "auto").toLowerCase();
  const scrolling: NativePreviewEmbed["scrolling"] = scrollingRaw === "yes" || scrollingRaw === "no" ? scrollingRaw : "auto";
  return { src: trustedSrc, width, height, scrolling };
}

function attributeValue(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeHtmlAttribute(match[1]) : "";
}

function styleDimension(style: string, property: "width" | "height") {
  if (!style) return 0;
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([0-9.]+)px`, "i"));
  return match?.[1] ? Number.parseFloat(match[1]) : 0;
}

function dimensionValue(value: string) {
  const numeric = Number.parseFloat(String(value || "").replace(/px$/i, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function clampDimension(value: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(220, Math.min(1600, Math.round(numeric)));
}

function decodeHtmlAttribute(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function previewErrorMessage(error: MetaMarketingError | null) {
  if (!error) return "Bu reklam bu Instagram yerleşimi için uygun olmayabilir.";
  if (error.providerCode === 100) return "Bu reklam bu Instagram yerleşimi için önizlenemiyor.";
  if (error.providerCode === 200 || error.providerCode === 10) return "Meta tokenının reklam önizleme izni doğrulanamadı.";
  return error.message || "Bu reklam bu Instagram yerleşimi için uygun olmayabilir.";
}
