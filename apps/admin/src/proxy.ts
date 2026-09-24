import { NextRequest, NextResponse } from "next/server";

const AUTH_REDIRECTS: Record<string, string> = {
  "/login": "/auth/login",
  "/forgot-password": "/auth/forgot-password",
  "/reset-password": "/auth/reset-password",
};

const MAX_API_BODY_BYTES = 25 * 1024 * 1024;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const WINDOW_MS = 60_000;
const READ_BUDGET = 1_200;
const WRITE_BUDGET = 240;
const MAX_RATE_KEYS = 2_048;
const SHIPPING_RECONCILE_PATH = "/api/shipping/basit-kargo/reconcile";

type RateWindow = { startedAt: number; reads: number; writes: number; lastSeenAt: number };
const rateWindows = new Map<string, RateWindow>();

function firstHeaderValue(value: string | null) {
  return String(value || "").split(",")[0]?.trim() || "";
}

function normalizedOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function addOrigin(origins: Set<string>, value: string) {
  const origin = normalizedOrigin(value);
  if (origin) origins.add(origin);
}

function sameOrigin(request: NextRequest) {
  const rawOrigin = String(request.headers.get("origin") || "").trim();
  if (!rawOrigin) return true;

  const origin = normalizedOrigin(rawOrigin);
  if (!origin) return false;

  const allowedOrigins = new Set<string>();
  addOrigin(allowedOrigins, request.nextUrl.origin);

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const vercelForwardedHost = firstHeaderValue(request.headers.get("x-vercel-forwarded-host"));
  const host = firstHeaderValue(request.headers.get("host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const requestProto = request.nextUrl.protocol.replace(":", "");
  const proto = forwardedProto || requestProto || "https";

  for (const candidateHost of [forwardedHost, vercelForwardedHost, host]) {
    if (candidateHost) addOrigin(allowedOrigins, `${proto}://${candidateHost}`);
  }

  if (allowedOrigins.has(origin)) return true;

  // Reverse proxies can rewrite NextRequest's internal origin while the browser
  // still performs a genuine same-origin request. Fetch Metadata is supplied by
  // browsers and lets that legitimate write through without disabling the guard.
  return String(request.headers.get("sec-fetch-site") || "").trim().toLowerCase() === "same-origin";
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "unknown";
}

function trimRateWindows(now: number) {
  if (rateWindows.size <= MAX_RATE_KEYS) return;
  for (const [key, window] of rateWindows) {
    if (now - window.lastSeenAt > WINDOW_MS * 2 || rateWindows.size > MAX_RATE_KEYS) rateWindows.delete(key);
    if (rateWindows.size <= MAX_RATE_KEYS) break;
  }
}

function exceedsRateBudget(request: NextRequest, method: string) {
  const now = Date.now();
  const key = clientKey(request);
  let window = rateWindows.get(key);
  if (!window || now - window.startedAt >= WINDOW_MS) {
    window = { startedAt: now, reads: 0, writes: 0, lastSeenAt: now };
    rateWindows.set(key, window);
  }
  window.lastSeenAt = now;

  if (SAFE_METHODS.has(method)) {
    window.reads += 1;
    if (window.reads > READ_BUDGET) return true;
  } else {
    window.writes += 1;
    if (window.writes > WRITE_BUDGET) return true;
  }
  trimRateWindows(now);
  return false;
}

export function proxy(request: NextRequest) {
  const target = AUTH_REDIRECTS[request.nextUrl.pathname];
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url);
  }

  if (!request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  // Basit Kargo reconcile is an expensive maintenance operation. The server
  // maintenance worker sends X-Ruth-Panel-Maintenance: 1 and remains the sole
  // execution owner. The legacy orders-page minute heartbeat is acknowledged
  // without touching Supabase or the remote carrier API.
  if (
    request.nextUrl.pathname === SHIPPING_RECONCILE_PATH
    && request.headers.get("x-ruth-panel-maintenance") !== "1"
  ) {
    return NextResponse.json(
      {
        ok: true,
        checked: 0,
        removed: 0,
        deferred: 0,
        skipped: true,
        reason: "server_maintenance_owned",
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Ruth-Reconcile-Owner": "server-maintenance",
        },
      },
    );
  }

  const method = request.method.toUpperCase();
  if (!SAFE_METHODS.has(method) && !sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Cross-origin panel write engellendi." }, { status: 403 });
  }

  if (exceedsRateBudget(request, method)) {
    return NextResponse.json({ ok: false, error: "Geçici istek yoğunluğu sınırı aşıldı. Lütfen kısa süre sonra tekrar dene." }, {
      status: 429,
      headers: { "Retry-After": "5", "Cache-Control": "no-store" },
    });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "İstek gövdesi izin verilen sınırı aşıyor." }, { status: 413 });
  }

  const headers = new Headers(request.headers);
  const traceId = headers.get("x-ruth-trace-id") || crypto.randomUUID();
  headers.set("x-ruth-trace-id", traceId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-ruth-trace-id", traceId);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "same-origin");
  return response;
}

export const config = {
  matcher: ["/login", "/forgot-password", "/reset-password", "/api/:path*"],
};
