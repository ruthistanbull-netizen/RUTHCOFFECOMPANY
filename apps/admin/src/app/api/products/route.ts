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
function strings(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))] : [];
}
function images(value: unknown) {
  return strings(value).slice(0, 40);
}
function allowedStatus(value: unknown) {
  const status = String(value || "draft");
  return ["draft", "active", "archived"].includes(status) ? status : "draft";
}
function allowedStock(value: unknown) {
  const status = String(value || "in_stock");
  return ["in_stock", "out_of_stock", "preorder"].includes(status) ? status : "in_stock";
}

async function hydrateProducts(supabase: any, rows: any[]) {
  if (!rows.length) return rows;
  const ids = rows.map((row) => row.id);
  const [variantResult, imageResult, categoryLinkResult, collectionLinkResult, categoryResult, collectionResult] = await Promise.all([
    supabase.from("product_variants").select("*").in("product_id", ids).order("sort_order", { ascending: true }),
    supabase.from("product_images").select("id,product_id,variant_id,image_url,is_main,is_primary,sort_order").in("product_id", ids).order("sort_order", { ascending: true }),
    supabase.from("product_categories").select("product_id,category_id").in("product_id", ids),
    supabase.from("product_collections").select("product_id,collection_id").in("product_id", ids),
    supabase.from("categories").select("id,name,slug,status,sort_order").order("sort_order", { ascending: true }),
    supabase.from("collections").select("id,name,slug,status,sort_order").order("sort_order", { ascending: true }),
  ]);

  const variantsByProduct = new Map<string, any[]>();
  for (const row of variantResult.data || []) {
    const key = String(row.product_id);
    variantsByProduct.set(key, [...(variantsByProduct.get(key) || []), row]);
  }
  const imagesByProduct = new Map<string, any[]>();
  for (const row of imageResult.data || []) {
    const key = String(row.product_id);
    imagesByProduct.set(key, [...(imagesByProduct.get(key) || []), row]);
  }
  const catIds = new Map<string, string[]>();
  for (const row of categoryLinkResult.data || []) {
    const key = String(row.product_id);
    catIds.set(key, [...(catIds.get(key) || []), String(row.category_id)]);
  }
  const colIds = new Map<string, string[]>();
  for (const row of collectionLinkResult.data || []) {
    const key = String(row.product_id);
    colIds.set(key, [...(colIds.get(key) || []), String(row.collection_id)]);
  }
  const categories = categoryResult.data || [];
  const collections = collectionResult.data || [];

  return rows.map((row) => {
    const productImages = imagesByProduct.get(String(row.id)) || [];
    const imageUrls = productImages.filter((item) => !item.variant_id).map((item) => String(item.image_url)).filter(Boolean);
    const categoryIds = catIds.get(String(row.id)) || [];
    const collectionIds = colIds.get(String(row.id)) || [];
    return {
      ...row,
      image_urls: imageUrls.length ? imageUrls : (row.main_image_url ? [row.main_image_url] : []),
      product_variants: variantsByProduct.get(String(row.id)) || [],
      category_ids: categoryIds,
      collection_ids: collectionIds,
      categories: categories.filter((item: any) => categoryIds.includes(String(item.id))),
      collection_list: collections.filter((item: any) => collectionIds.includes(String(item.id))),
    };
  });
}

async function syncDetails(supabase: any, productId: string, body: any) {
  const photoUrls = images(body.image_urls || body.photos);
  if (photoUrls.length) {
    await supabase.from("product_images").delete().eq("product_id", productId).is("variant_id", null);
    const insert = await supabase.from("product_images").insert(photoUrls.map((url, index) => ({
      product_id: productId,
      image_url: url,
      is_main: index === 0,
      is_primary: index === 0,
      sort_order: index,
    })));
    if (insert.error) throw insert.error;
  }

  const categoryIds = strings(body.category_ids);
  await supabase.from("product_categories").delete().eq("product_id", productId);
  if (categoryIds.length) {
    const insert = await supabase.from("product_categories").insert(categoryIds.map((category_id) => ({ product_id: productId, category_id })));
    if (insert.error) throw insert.error;
  }

  const collectionIds = strings(body.collection_ids);
  await supabase.from("product_collections").delete().eq("product_id", productId);
  if (collectionIds.length) {
    const insert = await supabase.from("product_collections").insert(collectionIds.map((collection_id) => ({ product_id: productId, collection_id })));
    if (insert.error) throw insert.error;
  }

  if (Array.isArray(body.variants)) {
    await supabase.from("product_variants").delete().eq("product_id", productId);
    if (body.variants.length) {
      const variants = body.variants.map((variant: any, index: number) => ({
        product_id: productId,
        name: String(variant.name || variant.option_summary || "Standart"),
        option_summary: String(variant.option_summary || variant.name || "Standart"),
        sku: String(variant.sku || "").trim() || null,
        price: Number(variant.price || body.price || 0),
        compare_at_price: variant.compare_at_price == null || variant.compare_at_price === "" ? null : Number(variant.compare_at_price),
        stock: Math.max(0, Math.trunc(Number(variant.stock || 0))),
        stock_status: allowedStock(variant.stock_status),
        is_active: variant.is_active !== false,
        options: variant.options && typeof variant.options === "object" ? variant.options : {},
        image_url: String(variant.image_url || "").trim() || null,
        sort_order: index,
        status: variant.is_active === false ? "archived" : "active",
        updated_at: new Date().toISOString(),
      }));
      const insert = await supabase.from("product_variants").insert(variants).select("*");
      if (insert.error) throw insert.error;
    }
  }
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  const q = String(url.searchParams.get("q") || "").trim();

  let query = auth.supabase.from("products").select("*");
  if (id) query = query.eq("id", id);
  else query = query.neq("status", "archived");
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(id ? 1 : 1000);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const products = await hydrateProducts(auth.supabase, data || []);
  const [categories, collections] = await Promise.all([
    auth.supabase.from("categories").select("id,name,slug,status,sort_order").order("sort_order", { ascending: true }),
    auth.supabase.from("collections").select("id,name,slug,status,sort_order").order("sort_order", { ascending: true }),
  ]);

  return NextResponse.json({
    ok: true,
    products,
    categories: categories.data || [],
    collections: collections.data || [],
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Ürün adı gerekli." }, { status: 400 });

  const photoUrls = images(body.image_urls || body.photos);
  const collectionIds = strings(body.collection_ids);
  const payload = {
    name,
    slug: slugify(body.slug || name),
    status: allowedStatus(body.status),
    price: Number(body.price || 0),
    compare_at_price: body.compare_at_price === "" || body.compare_at_price == null ? null : Number(body.compare_at_price),
    currency: String(body.currency || "TRY"),
    material: String(body.material || "").trim() || null,
    finish_color: String(body.finish_color || "").trim() || null,
    stock_status: allowedStock(body.stock_status),
    main_image_url: photoUrls[0] || String(body.main_image_url || "").trim() || null,
    is_featured: Boolean(body.is_featured),
    is_new: Boolean(body.is_new),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    short_description: String(body.short_description || "").trim() || null,
    description: String(body.description || "").trim() || null,
    size_usage: String(body.size_usage || "").trim() || null,
    care_advice: String(body.care_advice || "").trim() || null,
    product_type: body.product_type === "bundle" || body.is_bundle ? "bundle" : "single",
    is_bundle: Boolean(body.is_bundle || body.isBundle || body.product_type === "bundle"),
    bundle_items: Array.isArray(body.bundle_items || body.bundleItems) ? (body.bundle_items || body.bundleItems) : [],
    collection_id: collectionIds[0] || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.supabase.from("products").insert(payload).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  try {
    await syncDetails(auth.supabase, String(data.id), body);
  } catch (caught) {
    await auth.supabase.from("products").delete().eq("id", data.id);
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : "Ürün detayları kaydedilemedi." }, { status: 400 });
  }

  const hydrated = await hydrateProducts(auth.supabase, [data]);
  const storefront = await revalidateStorefront("rosta-admin-product-create", "catalog");
  return NextResponse.json({ ok: true, product: hydrated[0] || data, variantMediaHandled: true, storefront });
}

export async function updateProductWithAuth(request: Request, auth: any) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Ürün id eksik." }, { status: 400 });

  const allowed = ["name","status","price","compare_at_price","currency","material","finish_color","stock_status","main_image_url","is_featured","is_new","sort_order","short_description","description","size_usage","care_advice","product_type","is_bundle","bundle_items"];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) if (key in body) update[key] = body[key] === "" ? null : body[key];
  if ("slug" in body || "name" in body) update.slug = slugify(body.slug || body.name);
  if (Array.isArray(body.image_urls || body.photos)) {
    const photoUrls = images(body.image_urls || body.photos);
    update.main_image_url = photoUrls[0] || null;
  }
  const collectionIds = strings(body.collection_ids);
  if (collectionIds.length || "collection_ids" in body) update.collection_id = collectionIds[0] || null;

  const { data, error } = await auth.supabase.from("products").update(update).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  if ("image_urls" in body || "photos" in body || "category_ids" in body || "collection_ids" in body || "variants" in body) {
    try { await syncDetails(auth.supabase, id, body); }
    catch (caught) { return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : "Ürün detayları kaydedilemedi." }, { status: 400 }); }
  }

  const hydrated = await hydrateProducts(auth.supabase, [data]);
  const storefront = request.headers.get("x-rosta-skip-storefront-revalidate") === "1"
    ? { ok: true, skipped: true, deferred: true }
    : await revalidateStorefront("rosta-admin-product-update", "catalog");
  return NextResponse.json({ ok: true, product: hydrated[0] || data, variantMediaHandled: true, storefront });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  return updateProductWithAuth(request, auth);
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Ürün id eksik." }, { status: 400 });
  const { error } = await auth.supabase.from("products").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const storefront = await revalidateStorefront("rosta-admin-product-archive", "catalog");
  return NextResponse.json({ ok: true, storefront });
}
