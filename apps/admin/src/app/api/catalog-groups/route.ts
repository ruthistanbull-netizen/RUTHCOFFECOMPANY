import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function tableFor(value: unknown) {
  return value === "collection" ? "collections" : value === "category" ? "categories" : null;
}
function linkTableFor(value: unknown) {
  return value === "collection"
    ? { table: "product_collections", foreignKey: "collection_id" }
    : value === "category"
      ? { table: "product_categories", foreignKey: "category_id" }
      : null;
}
function slugify(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const type = new URL(request.url).searchParams.get("type");
  const table = tableFor(type);
  const link = linkTableFor(type);
  if (!table || !link) return NextResponse.json({ ok:false, error:"Geçersiz katalog tipi." }, { status:400 });

  const [itemsResult, linksResult] = await Promise.all([
    auth.supabase.from(table).select("*").order("sort_order",{ascending:true}).order("name",{ascending:true}),
    auth.supabase.from(link.table).select(`${link.foreignKey},product_id`),
  ]);
  if (itemsResult.error) return NextResponse.json({ ok:false, error:itemsResult.error.message }, { status:500 });
  if (linksResult.error) return NextResponse.json({ ok:false, error:linksResult.error.message }, { status:500 });

  const counts = new Map<string, number>();
  for (const row of linksResult.data || []) {
    const id = String((row as any)[link.foreignKey] || "");
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }

  const items = (itemsResult.data || []).map((item:any) => ({
    ...item,
    product_count: counts.get(String(item.id)) || 0,
  }));

  return NextResponse.json({ ok:true, items }, { headers:{"Cache-Control":"private, no-store"} });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(()=>({}));
  const table = tableFor(body.type);
  if (!table) return NextResponse.json({ ok:false, error:"Geçersiz katalog tipi." }, { status:400 });

  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok:false, error:"Ad gerekli." }, { status:400 });
  const record = {
    name,
    slug: slugify(body.slug || name),
    description: String(body.description || "").trim() || null,
    cover_image_url: String(body.cover_image_url || "").trim() || null,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    status: body.status === "inactive" ? "inactive" : "active",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await auth.supabase.from(table).insert(record).select("*").single();
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });
  const storefront = await revalidateStorefront("rosta-admin-catalog-group-create","catalog");
  return NextResponse.json({ ok:true, item:{...data,product_count:0}, storefront });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(()=>({}));
  const table = tableFor(body.type);
  const id = String(body.id || "").trim();
  if (!table || !id) return NextResponse.json({ ok:false, error:"Katalog tipi veya id eksik." }, { status:400 });

  const update:Record<string,unknown> = { updated_at:new Date().toISOString() };
  for (const key of ["name","description","cover_image_url","sort_order","status"]) {
    if (key in body) update[key] = body[key] === "" ? null : body[key];
  }
  if ("slug" in body || "name" in body) update.slug = slugify(body.slug || body.name);

  const { data, error } = await auth.supabase.from(table).update(update).eq("id",id).select("*").single();
  if (error) return NextResponse.json({ ok:false, error:error.message }, { status:400 });
  const storefront = await revalidateStorefront("rosta-admin-catalog-group-update","catalog");
  return NextResponse.json({ ok:true, item:data, storefront });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = String(url.searchParams.get("id") || "").trim();
  const table = tableFor(type);
  const link = linkTableFor(type);
  if (!table || !link || !id) return NextResponse.json({ ok:false, error:"Katalog tipi veya id eksik." }, { status:400 });

  // Exact Ruth UI describes this as deleting the group while preserving products.
  const unlink = await auth.supabase.from(link.table).delete().eq(link.foreignKey,id);
  if (unlink.error) return NextResponse.json({ ok:false, error:unlink.error.message }, { status:400 });

  const removed = await auth.supabase.from(table).delete().eq("id",id);
  if (removed.error) {
    // Fallback for restrictive FK policies: keep the group but remove it from storefront.
    const disabled = await auth.supabase.from(table).update({status:"inactive",updated_at:new Date().toISOString()}).eq("id",id);
    if (disabled.error) return NextResponse.json({ ok:false, error:removed.error.message }, { status:400 });
  }

  const storefront = await revalidateStorefront("rosta-admin-catalog-group-delete","catalog");
  return NextResponse.json({ ok:true, storefront });
}
