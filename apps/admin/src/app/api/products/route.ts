import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function slugify(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("products")
    .select("id,name,slug,status,price,compare_at_price,currency,stock_status,main_image_url,is_featured,is_new,sort_order,created_at,updated_at")
    .neq("status", "archived")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:500 });
  return NextResponse.json({ ok:true, products:data || [] }, { headers:{ "Cache-Control":"private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok:false, error:"Ürün adı gerekli." }, { status:400 });
  const payload = {
    name,
    slug: slugify(body.slug || name),
    status: ["draft","active","archived"].includes(String(body.status)) ? body.status : "draft",
    price: Number(body.price || 0),
    compare_at_price: body.compare_at_price === "" || body.compare_at_price == null ? null : Number(body.compare_at_price),
    currency: String(body.currency || "TRY"),
    stock_status: ["in_stock","out_of_stock","preorder"].includes(String(body.stock_status)) ? body.stock_status : "in_stock",
    main_image_url: String(body.main_image_url || "").trim() || null,
    is_featured: Boolean(body.is_featured),
    is_new: Boolean(body.is_new),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    short_description: String(body.short_description || "").trim() || null,
    description: String(body.description || "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await auth.supabase.from("products").insert(payload).select("*").single();
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });
  const storefront = await revalidateStorefront("rosta-admin-product-create","catalog");
  return NextResponse.json({ ok:true, product:data, storefront });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ ok:false, error:"Ürün id eksik." }, { status:400 });
  const allowed = ["name","slug","status","price","compare_at_price","currency","stock_status","main_image_url","is_featured","is_new","sort_order","short_description","description"];
  const update: Record<string, unknown> = { updated_at:new Date().toISOString() };
  for (const key of allowed) if (key in body) update[key] = key === "slug" ? slugify(body[key]) : body[key];
  const { data, error } = await auth.supabase.from("products").update(update).eq("id",id).select("*").single();
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });
  const storefront = await revalidateStorefront("rosta-admin-product-update","catalog");
  return NextResponse.json({ ok:true, product:data, storefront });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ ok:false, error:"Ürün id eksik." }, { status:400 });
  const { error } = await auth.supabase.from("products").update({ status:"archived", updated_at:new Date().toISOString() }).eq("id",id);
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });
  const storefront = await revalidateStorefront("rosta-admin-product-archive","catalog");
  return NextResponse.json({ ok:true, storefront });
}
