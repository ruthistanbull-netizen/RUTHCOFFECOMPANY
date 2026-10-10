import { NextResponse } from "next/server";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only explicitly public ROSTA media buckets are available through this route.
// This is a same-origin gateway, not a generic URL proxy or private-file reader.
const PUBLIC_BUCKETS = new Set(["rosta-media", "website-media"]);
type RouteContext = { params: Promise<{ bucket: string; path: string[] }> };

async function handle(request: Request, context: RouteContext, method: "GET" | "HEAD") {
  const { bucket, path } = await context.params;
  if (!PUBLIC_BUCKETS.has(bucket) || !Array.isArray(path) || !path.length ||
    path.length > 32 || path.some((segment) => !segment || segment === "." || segment === ".." || /[/\\\x00-\x1f]/.test(segment))) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return new NextResponse("ROSTA medya servisi yapılandırılmamış.", { status: 503 });

  try {
    const origin = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const escapedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
    const upstream = `${origin}/storage/v1/object/public/${bucket}/${escapedPath}`;
    const headers = new Headers({
      apikey: secret,
      authorization: `Bearer ${secret}`,
    });
    const range = request.headers.get("range");
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.set("range", range);
    const result = await fetch(upstream, {
      method,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });

    const responseHeaders = new Headers({
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      "X-Content-Type-Options": "nosniff",
    });
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = result.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    if (!result.ok) {
      // Never forward storage error bodies that could disclose internal details.
      return new NextResponse(result.status === 404 ? "Medya bulunamadı." : "Medya erişimi başarısız.", {
        status: result.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return new NextResponse(method === "HEAD" ? null : result.body, {
      status: result.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[ROSTA public media] self-hosted storage access failed:", error instanceof Error ? error.message : error);
    return new NextResponse("Medya sunucusuna ulaşılamadı.", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return handle(request, context, "GET");
}

export async function HEAD(request: Request, context: RouteContext) {
  return handle(request, context, "HEAD");
}
