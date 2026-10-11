import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ROSTA_SUPABASE_URL, ROSTA_SUPABASE_PUBLISHABLE_KEY } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache" };

type AuthPayload = {
  action?: string;
  email?: string;
  password?: string;
  refresh_token?: string;
};

export async function POST(request: Request) {
  // Only brand login/refresh is exposed; cron, service_role and privileged
  // operations stay entirely on the existing server.
  const inputSize = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(inputSize) || inputSize > 4096) {
    return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 413, headers });
  }
  const body = await request.json().catch(() => null) as AuthPayload | null;
  const action = body?.action === "refresh" ? "refresh" : body?.action === "login" ? "login" : null;
  if (!body || !action) {
    return NextResponse.json({ ok: false, error: "Geçersiz oturum işlemi." }, { status: 400, headers });
  }

  const authBase = ROSTA_SUPABASE_URL;
  const anonKey = ROSTA_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey || !authBase) {
    return NextResponse.json({ ok: false, error: "Mobil giriş sunucu ayarları eksik." }, { status: 503, headers });
  }
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  const refresh = String(body.refresh_token || "");
  if (action === "login" && (!email || email.length > 254 || !password || password.length > 1024)) {
    return NextResponse.json({ ok: false, error: "Geçersiz giriş bilgileri." }, { status: 400, headers });
  }
  if (action === "refresh" && (!refresh || refresh.length > 4096)) {
    return NextResponse.json({ ok: false, error: "Geçersiz oturum yenileme bilgisi." }, { status: 400, headers });
  }

  const tokenEndpoint = new URL("/auth/v1/token", authBase);
  tokenEndpoint.searchParams.set("grant_type", action === "login" ? "password" : "refresh_token");
  try {
    const response = await fetch(tokenEndpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": anonKey },
      body: JSON.stringify(action === "login"
        ? { email, password }
        : { refresh_token: refresh }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 401;
      return NextResponse.json({
        ok: false,
        error: status === 429 ? "Çok fazla giriş denemesi." :
          status === 503 ? "Kimlik servisine ulaşılamadı." : "Oturum doğrulanamadı.",
      }, { status, headers });
    }
    const issued = await response.json() as Record<string, unknown>;
    const access = typeof issued.access_token === "string" ? issued.access_token : "";
    const newRefresh = typeof issued.refresh_token === "string" ? issued.refresh_token : "";
    const expiresIn = Number(issued.expires_in || 3600);
    if (!access) return NextResponse.json({ ok: false, error: "Oturum oluşturulamadı." }, { status: 502, headers });

    // Use the same authoritative JWT/admin validation as the web panel.
    const authCheck = new Request(new URL("/api/me", request.url), {
      method: "GET",
      headers: { "Authorization": "Bearer " + access, "Accept": "application/json" },
    });
    const verified = await requireAdmin(authCheck);
    if ("error" in verified) {
      return NextResponse.json({ ok: false, error: "Bu marka için yönetici erişimi yok." }, { status: 403, headers });
    }
    return NextResponse.json({
      ok: true,
      access_token: access,
      refresh_token: newRefresh,
      expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Mobil giriş servisine erişilemiyor." }, { status: 503, headers });
  }
}
