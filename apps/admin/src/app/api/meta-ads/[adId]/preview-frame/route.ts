import { createHmac, timingSafeEqual } from "node:crypto";
import { requireMetaConnectionConfig } from "@/lib/integrations/metaMarketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NativePreviewEmbed = {
  src: string;
  width: number;
  height: number;
  scrolling: "yes" | "no" | "auto";
};

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

const HTML_HEADERS = {
  ...NO_STORE_HEADERS,
  "Content-Type": "text/html; charset=utf-8",
};

export async function GET(
  request: Request,
  context: { params: Promise<{ adId: string }> },
) {
  const { adId: rawAdId } = await context.params;
  const adId = String(rawAdId || "").trim();
  if (!/^\d+$/.test(adId)) return htmlError("Geçersiz reklam kimliği.", 400);

  const url = new URL(request.url);
  const format = String(url.searchParams.get("format") || "").trim();
  const exp = Number(url.searchParams.get("exp") || 0);
  const payload = String(url.searchParams.get("p") || "").trim();
  const signature = String(url.searchParams.get("sig") || "").trim();

  if (!format || !payload || !signature || !Number.isFinite(exp)) {
    return htmlError("Önizleme bağlantısı eksik.", 400);
  }
  if (exp < Math.floor(Date.now() / 1000)) {
    return htmlError("Önizleme bağlantısının süresi doldu. Reklam detayını yeniden aç.", 410);
  }

  const config = requireMetaConnectionConfig();
  const expected = createHmac("sha256", config.accessToken)
    .update(`${adId}.${format}.${exp}.${payload}`)
    .digest("hex");
  if (!secureEqual(expected, signature)) return htmlError("Önizleme imzası doğrulanamadı.", 403);

  let embed: NativePreviewEmbed;
  try {
    embed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as NativePreviewEmbed;
  } catch {
    return htmlError("Önizleme verisi okunamadı.", 400);
  }

  const src = trustedPreviewUrl(embed.src);
  if (!src) return htmlError("Meta önizleme adresi güvenilir değil.", 400);

  // Meta Graph API already returns an iframe-ready preview URL. Rendering that
  // URL inside another iframe caused a blank white frame in iOS/PWA WebKit.
  // Keep the signed same-origin entry point, but navigate the browser's existing
  // iframe directly to Meta so there is only one browsing context.
  return new Response(null, {
    status: 307,
    headers: {
      ...NO_STORE_HEADERS,
      Location: src,
    },
  });
}

function secureEqual(expected: string, actual: string) {
  try {
    const left = Buffer.from(expected, "hex");
    const right = Buffer.from(actual, "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function trustedPreviewUrl(value: string) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    const trusted = hostname === "facebook.com"
      || hostname.endsWith(".facebook.com")
      || hostname === "instagram.com"
      || hostname.endsWith(".instagram.com");
    return trusted ? url.toString() : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlError(message: string, status: number) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;font-family:Inter,system-ui,sans-serif;background:#fff;color:#667085}body{display:grid;place-items:center;text-align:center;padding:24px;font-size:12px;line-height:1.5}</style></head><body>${escapeHtml(message)}</body></html>`;
  return new Response(html, { status, headers: HTML_HEADERS });
}
