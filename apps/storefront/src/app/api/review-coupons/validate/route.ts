import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export const runtime = "nodejs";
function clean(value: unknown) { return typeof value === "string" ? value.trim().toUpperCase() : ""; }
export async function POST(request: Request) {
  try {
    const { code } = await request.json(); const cleanCode = clean(code);
    if (!cleanCode) return NextResponse.json({ ok: false, error: "Kupon kodu gir." }, { status: 400 });
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("review_reward_coupons").select("code, discount_percent, status, usage_limit, used_count, expires_at").eq("code", cleanCode).maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false, error: "Kupon bulunamadı." }, { status: 404 });
    if (data.status !== "active") return NextResponse.json({ ok: false, error: "Kupon aktif değil." }, { status: 400 });
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return NextResponse.json({ ok: false, error: "Kupon süresi dolmuş." }, { status: 400 });
    if (Number(data.used_count || 0) >= Number(data.usage_limit || 1)) return NextResponse.json({ ok: false, error: "Kupon kullanılmış." }, { status: 400 });
    return NextResponse.json({ ok: true, code: data.code, discountPercent: Number(data.discount_percent || 10) });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Kupon kontrol edilemedi." }, { status: 400 }); }
}
