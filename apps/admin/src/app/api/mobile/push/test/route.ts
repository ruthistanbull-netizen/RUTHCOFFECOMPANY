import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { mobileAPNsConfigured, mobileDevicesFrom, sendNativeAPNs } from "@/lib/mobileApns";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (auth.internal) {
    return NextResponse.json({ ok: false, error: "Gerçek yönetici oturumu gerekli." }, { status: 403 });
  }
  if (!mobileAPNsConfigured()) {
    return NextResponse.json({ ok: false, error: "Apple APNs sunucu anahtarları yapılandırılmamış." }, { status: 503 });
  }
  const rows = await auth.supabase.from("admin_mobile_push_devices")
    .select("id,device_token,bundle_id,apns_environment")
    .eq("admin_profile_id", auth.profile.id).eq("active", true)
    .order("updated_at", { ascending: false }).limit(1);
  if (rows.error) return NextResponse.json({ ok: false, error: rows.error.message }, { status: 503 });
  const device = mobileDevicesFrom(rows.data)[0];
  if (!device) {
    return NextResponse.json({ ok: false, error: "Önce RR HUB iPhone için APNs cihaz kaydı tamamlanmalı." }, { status: 409 });
  }
  try {
    await sendNativeAPNs(device, {
      title: "ROSTA Coffee Co. — RR HUB Test",
      body: "Bu bildirim Apple APNs üzerinden sunucudan gönderildi.",
      url: "/notifications",
      kind: "test",
      brand: "rosta",
    });
    await auth.supabase.from("admin_mobile_push_devices")
      .update({ last_success_at: new Date().toISOString(), last_error: null })
      .eq("id", device.id);
    return NextResponse.json({ ok: true, delivery: "apns_accepted" },
      { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "APNs gönderimi başarısız.";
    await auth.supabase.from("admin_mobile_push_devices")
      .update({ last_error: message.slice(0, 500) }).eq("id", device.id);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
