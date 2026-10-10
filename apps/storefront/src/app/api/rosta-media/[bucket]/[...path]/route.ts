import { NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_BUCKETS = new Set(["rosta-media", "website-media"]);
const PANEL_MEDIA_ORIGIN = "https://rostapanel.zeabur.app";
type RouteContext = { params: Promise<{ bucket: string; path: string[] }> };

function successfulMedia(result: Response, method: "GET" | "HEAD") {
  const headers = new Headers({
    "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    "X-Content-Type-Options": "nosniff",
  });
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const value = result.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new NextResponse(method === "HEAD" ? null : result.body, { status: result.status, headers });
}

async function handle(request: Request, context: RouteContext, method: "GET" | "HEAD") {
  const { bucket, path } = await context.params;
  if (!PUBLIC_BUCKETS.has(bucket) || !Array.isArray(path) || path.length === 0 ||
    path.length > 32 || path.some((segment) => !segment || segment === "." || segment === ".." || /[/\\\x00-\x1f]/.test(segment))) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const escapedPath = path.map(encodeURIComponent).join("/");
  const range = request.headers.get("range");
  const forwardedRange = range && /^bytes=\d*-\d*$/.test(range) ? range : null;

  // Panel connectivity to ROSTA's self-host has already been established.
  // The storefront container need not be joined to the same private Tailscale
  // network: use the public media-only panel bridge as the preferred route.
  const bridgeUrl = `${PANEL_MEDIA_ORIGIN}/api/public-theme-media/${bucket}/${escapedPath}`;
  const candidates: Array<{ url: string; headers: Headers; name: string }> = [];
  const bridgeHeaders = new Headers();
  if (forwardedRange) bridgeHeaders.set("range", forwardedRange);
  const panelCandidate = { url: bridgeUrl, headers: bridgeHeaders, name: "panel" };

  // The admin is the configured source of truth for ROSTA media; always try
  // its bridge first, even if the storefront has stale Cloud environment values.
  candidates.push(panelCandidate);
  try {
    const origin = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (secret) {
      const directHeaders = new Headers({ apikey: secret, authorization: `Bearer ${secret}` });
      if (forwardedRange) directHeaders.set("range", forwardedRange);
      candidates.push({
        url: `${origin}/storage/v1/object/public/${bucket}/${escapedPath}`,
        headers: directHeaders,
        name: "direct",
      });
    }
  } catch {
    // The bridge still works even if this service has an invalid direct URL.
  }

  let missing = false;
  for (const candidate of candidates) {
    try {
      const result = await fetch(candidate.url, {
        method, headers: candidate.headers, cache: "no-store",
        redirect: "error", signal: AbortSignal.timeout(15_000),
      });
      if (result.ok) return successfulMedia(result, method);
      if (result.status === 404) missing = true;
      console.warn("[ROSTA public media] backend did not deliver media:", candidate.name, result.status);
    } catch (error) {
      console.warn("[ROSTA public media] backend unreachable:", candidate.name, error instanceof Error ? error.message : "unknown");
    }
  }

  return new NextResponse(missing ? "Medya bulunamadı veya yayınlanmamış." : "Medya sunucusuna ulaşılamadı.", {
    status: missing ? 404 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request, context: RouteContext) { return handle(request, context, "GET"); }
export async function HEAD(request: Request, context: RouteContext) { return handle(request, context, "HEAD"); }
