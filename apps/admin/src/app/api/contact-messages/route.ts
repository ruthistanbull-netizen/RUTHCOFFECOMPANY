import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set(["new", "read", "resolved", "spam"]);

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "new");
  const query = auth.supabase
    .from("contact_messages")
    .select("id,name,email,phone,message,status,source,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const { data, error } = status === "all" ? await query : await query.eq("status", statuses.has(status) ? status : "new");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, messages: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();
  if (!id || !statuses.has(status)) {
    return NextResponse.json({ ok: false, error: "Geçersiz mesaj işlemi." }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("contact_messages")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,status,updated_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: data });
}
