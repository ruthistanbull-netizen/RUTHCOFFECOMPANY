import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("products")
    .select("id,name,slug,status,price,compare_at_price,currency,stock_status,main_image_url,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, products: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Ürün id eksik." }, { status: 400 });

  const allowed = ["name", "status", "price", "compare_at_price", "stock_status", "main_image_url"];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) if (key in body) update[key] = body[key];

  const { data, error } = await auth.supabase.from("products").update(update).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const delivery = await revalidateStorefront("rosta-admin-product-update", "catalog");
  return NextResponse.json({ ok: true, product: data, storefront: delivery });
}
