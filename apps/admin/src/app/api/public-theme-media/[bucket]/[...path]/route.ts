import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public ROSTA assets only. Files under theme/ are intentionally displayed on
// the public storefront even when a migrated Storage bucket is not public.
const ALLOWED_BUCKETS = new Set(["rosta-media", "website-media"]);
type Context = { params: Promise<{ bucket: string; path: string[] }> };

function responseFromStorage(result: Response, method: "GET" | "HEAD") {
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

async function handle(request: Request, context: Context, method: "GET" | "HEAD") {
  const { bucket, path } = await context.params;
  if (!ALLOWED_BUCKETS.has(bucket) || !Array.isArray(path) || path.length === 0 || path.length > 32 ||
      path.some((part) => !part || part === "." || part === ".." || /[/\\\x00-\x1f]/.test(part))) {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const isPublishedThemeAsset = bucket === "rosta-media" && path[0] === "theme";
    // All theme/ files are uploaded specifically to be displayed on the public
    // storefront. Bucket metadata can fail on some self-host installations;
    // do not turn an existing public theme asset into a false HTTP 404.
    let publicBucket = false;
    if (!isPublishedThemeAsset) {
      const { data: bucketInfo, error: bucketError } = await getSupabaseAdmin().storage.getBucket(bucket);
      if (bucketError || !bucketInfo?.public) {
        console.warn("[ROSTA media] non-theme bucket is not publicly accessible:", bucket);
        return new NextResponse("Not Found", { status: 404 });
      }
      publicBucket = true;
    }

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!key) return new NextResponse("Medya servisi yapılandırılmamış.", { status: 503 });

    const origin = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const objectPath = path.map(encodeURIComponent).join("/");
    const objectVisibility = publicBucket ? "public" : "authenticated";
    const url = `${origin}/storage/v1/object/${objectVisibility}/${bucket}/${objectPath}`;
    const headers = new Headers({ apikey: key, authorization: `Bearer ${key}` });
    const range = request.headers.get("range");
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.set("range", range);
    const result = await fetch(url, {
      method, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(18_000),
    });
    if (!result.ok) {
      console.warn("[ROSTA media] Storage returned:", result.status, bucket, path[0]);
      return new NextResponse(result.status === 404 ? "Medya bulunamadı." : "Depolama yanıt vermiyor.", {
        status: result.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return responseFromStorage(result, method);
  } catch (error) {
    console.error("[ROSTA media] Storage failed:", error instanceof Error ? error.message : error);
    return new NextResponse("Depolama bağlantısı kurulamadı.", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: Request, context: Context) { return handle(request, context, "GET"); }
export async function HEAD(request: Request, context: Context) { return handle(request, context, "HEAD"); }
