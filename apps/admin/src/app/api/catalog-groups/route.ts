import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import { slugifyCatalogValue } from "@/lib/catalogGroups";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function tableFor(type: string): "categories" | "collections" | null {
  if (type === "category") return "categories";
  if (type === "collection") return "collections";
  return null;
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function responseError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noStoreHeaders() });
}

async function revalidateCatalog(table: "categories" | "collections", source: string) {
  return revalidateWebsite({
    source,
    tags: table === "categories" ? ["categories", "products"] : ["collections", "products"],
  });
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const type = clean(url.searchParams.get("type"));
  const table = tableFor(type);
  if (!table) return responseError("Geçerli tür gerekli.");

  const relationTable = table === "categories" ? "product_categories" : "product_collections";
  const relationColumn = table === "categories" ? "category_id" : "collection_id";

  const [{ data, error }, { data: links, error: linkError }] = await Promise.all([
    auth.supabase
      .from(table)
      .select("id, name, slug, description, cover_image_url, sort_order, status, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    auth.supabase.from(relationTable).select(`product_id, ${relationColumn}`),
  ]);

  if (error) return responseError(error.message);
  if (linkError) return responseError(linkError.message);

  const counts = new Map<string, number>();
  for (const link of links || []) {
    const id = String((link as Record<string, unknown>)[relationColumn] || "");
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }

  return NextResponse.json({
    ok: true,
    items: (data || []).map((item) => ({ ...item, product_count: counts.get(String(item.id)) || 0 })),
  }, { headers: noStoreHeaders() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const type = clean(body.type);
  const table = tableFor(type);
  if (!table) return responseError("Geçerli tür gerekli.");

  const name = clean(body.name);
  if (!name) return responseError("Ad gerekli.");

  const slug = slugifyCatalogValue(clean(body.slug) || name);
  if (!slug) return responseError("Geçerli bir slug oluşturulamadı.");

  const { data: existing, error: existingError } = await auth.supabase
    .from(table)
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingError) return responseError(existingError.message);
  if (existing?.id) return responseError("Bu slug zaten kullanılıyor.", 409);

  const { data, error } = await auth.supabase
    .from(table)
    .insert({
      name,
      slug,
      description: clean(body.description) || null,
      cover_image_url: clean(body.cover_image_url) || null,
      sort_order: toInt(body.sort_order, 0),
      status: clean(body.status) === "inactive" ? "inactive" : "active",
      updated_at: new Date().toISOString(),
    })
    .select("id, name, slug, description, cover_image_url, sort_order, status, created_at, updated_at")
    .single();

  if (error) return responseError(error.message);

  const revalidate = await revalidateCatalog(table, `${type}-create`);
  return NextResponse.json({ ok: true, item: { ...data, product_count: 0 }, revalidate, warning: revalidate.ok ? null : revalidate.message }, { headers: noStoreHeaders() });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const type = clean(body.type);
  const table = tableFor(type);
  if (!table) return responseError("Geçerli tür gerekli.");

  const id = clean(body.id);
  const name = clean(body.name);
  if (!id) return responseError("Kayıt id gerekli.");
  if (!name) return responseError("Ad gerekli.");

  const slug = slugifyCatalogValue(clean(body.slug) || name);
  if (!slug) return responseError("Geçerli bir slug oluşturulamadı.");

  const { data: duplicate, error: duplicateError } = await auth.supabase
    .from(table)
    .select("id")
    .eq("slug", slug)
    .neq("id", id)
    .maybeSingle();
  if (duplicateError) return responseError(duplicateError.message);
  if (duplicate?.id) return responseError("Bu slug başka bir kayıtta kullanılıyor.", 409);

  const { data, error } = await auth.supabase
    .from(table)
    .update({
      name,
      slug,
      description: clean(body.description) || null,
      cover_image_url: clean(body.cover_image_url) || null,
      sort_order: toInt(body.sort_order, 0),
      status: clean(body.status) === "inactive" ? "inactive" : "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, name, slug, description, cover_image_url, sort_order, status, created_at, updated_at")
    .single();

  if (error) return responseError(error.message);

  const revalidate = await revalidateCatalog(table, `${type}-update`);
  return NextResponse.json({ ok: true, item: data, revalidate, warning: revalidate.ok ? null : revalidate.message }, { headers: noStoreHeaders() });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  let type = clean(url.searchParams.get("type"));
  let id = clean(url.searchParams.get("id"));
  if (!id || !type) {
    const body = await request.json().catch(() => ({}));
    type = type || clean(body.type);
    id = id || clean(body.id);
  }

  const table = tableFor(type);
  if (!table) return responseError("Geçerli tür gerekli.");
  if (!id) return responseError("Kayıt id gerekli.");

  // FK'ler ON DELETE CASCADE / SET NULL olarak SQL dosyasında hazırlanır.
  const { error } = await auth.supabase.from(table).delete().eq("id", id);
  if (error) return responseError(error.message);

  const revalidate = await revalidateCatalog(table, `${type}-delete`);
  return NextResponse.json({ ok: true, revalidate, warning: revalidate.ok ? null : revalidate.message }, { headers: noStoreHeaders() });
}
