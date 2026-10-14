import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const validToken = /^[0-9a-f]{48,256}$/i;

function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noStore });
}

async function authenticate(request: Request) {
  const result = await requireAdmin(request);
  if ("error" in result) return { error: result.error };
  if (result.internal || !result.profile.id || !result.user.id) {
    return { error: err("Yalnız oturum açmış panel yöneticisi cihaz ekleyebilir.", 403) };
  }
  return { auth: result };
}

export async function GET(request: Request) {
  const { auth, error } = await authenticate(request);
  if (error) return error;
  if (!auth) return err("Oturum doğrulanamadı.", 401);
  const result = await auth.supabase.from("admin_mobile_push_devices")
    .select("id,active,apns_environment,bundle_id,updated_at,last_success_at,last_error")
    .eq("admin_profile_id", auth.profile.id).eq("active", true)
    .order("updated_at", { ascending: false }).limit(20);
  if (result.error) return err("APNs cihaz tablosu hazır değil: " + result.error.message, 503);
  return NextResponse.json({ ok: true, devices: result.data ?? [] }, { headers: noStore });
}

export async function POST(request: Request) {
  const { auth, error } = await authenticate(request);
  if (error) return error;
  if (!auth) return err("Oturum doğrulanamadı.", 401);

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return err("Geçersiz istek.");
  const data = body as Record<string, unknown>;
  const token = String(data.deviceToken ?? "").trim().toLowerCase();
  const environment = String(data.environment ?? "").trim();
  const bundleId = String(data.bundleId ?? "").trim();
  const expectedBundle = (process.env.RR_HUB_APNS_BUNDLE_ID || "com.rrhub.ios").trim();
  if (!validToken.test(token) || (environment !== "sandbox" && environment !== "production")) {
    return err("Geçerli Apple APNs token ve ortam bilgisi gerekir.");
  }
  if (!expectedBundle || bundleId !== expectedBundle) {
    return err("RR HUB bundle ID ile sunucudaki Apple Push App ID eşleşmiyor.", 409);
  }
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const now = new Date().toISOString();
  const result = await auth.supabase.from("admin_mobile_push_devices")
    .upsert({
      admin_profile_id: auth.profile.id,
      token_sha256: tokenHash,
      device_token: token,
      bundle_id: bundleId,
      apns_environment: environment,
      active: true,
      updated_at: now,
      last_error: null,
    }, { onConflict: "token_sha256" })
    .select("id,active,apns_environment,updated_at").single();
  if (result.error) return err("APNs cihaz kaydı yapılamadı: " + result.error.message, 503);
  return NextResponse.json({ ok: true, device: result.data }, { headers: noStore });
}

export async function DELETE(request: Request) {
  const { auth, error } = await authenticate(request);
  if (error) return error;
  if (!auth) return err("Oturum doğrulanamadı.", 401);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return err("Geçersiz istek.");
  const token = String((body as Record<string, unknown>).deviceToken ?? "")
    .trim().toLowerCase();
  if (!validToken.test(token)) return err("APNs cihaz kimliği geçersiz.");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const result = await auth.supabase.from("admin_mobile_push_devices")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("admin_profile_id", auth.profile.id).eq("token_sha256", tokenHash);
  if (result.error) return err("APNs kaydı kaldırılamadı: " + result.error.message, 503);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
