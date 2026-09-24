import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getLocalProductImage } from "@/lib/localProductImages";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import { resolveCatalogId } from "@/lib/catalogGroups";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}


function normalizeSearchText(value: unknown) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchScore(value: unknown, query: string) {
  const normalized = normalizeSearchText(value);
  const target = normalizeSearchText(query);
  if (!normalized || !target) return 0;
  if (normalized === target) return 1000;
  if (normalized.startsWith(target)) return 700;
  if (normalized.includes(target)) return 500;
  const terms = target.split(/\s+/).filter(Boolean);
  const matched = terms.filter((term) => normalized.includes(term)).length;
  return matched ? matched * 100 - Math.abs(normalized.length - target.length) : 0;
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInt(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

async function safeSelect<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) return [] as T[];
  return data || [];
}

function apiError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: noStoreHeaders() });
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

async function rollbackCreatedProduct(supabase: any, productId: string) {
  // Şema üzerinde cascade olmasa bile yarım ürün bırakmamak için çocuk kayıtları açıkça temizle.
  await supabase.from("product_images").delete().eq("product_id", productId);
  await supabase.from("product_variants").delete().eq("product_id", productId);
  await supabase.from("product_categories").delete().eq("product_id", productId);
  await supabase.from("product_collections").delete().eq("product_id", productId);
  await supabase.from("products").delete().eq("id", productId);
}

async function failCreatedProduct(supabase: any, productId: string, message: string) {
  await rollbackCreatedProduct(supabase, productId);
  return apiError(message);
}



export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const search = (url.searchParams.get("q") || "").trim();
  const productId = clean(url.searchParams.get("id"));
  const compact = url.searchParams.get("compact") === "1";

  if (compact) {
    if (search.length < 2) return NextResponse.json({ ok: true, products: [] }, { headers: noStoreHeaders() });

    // Supabase ilike/or ifadeleri Türkçe karakterlerde ve birden fazla kelimede
    // bazı ürünleri kaçırabiliyor. Arama listesi küçük olduğu için ürünleri tek
    // seferde alıp ad, slug ve varyant metinlerinde sunucu tarafında sıralıyoruz.
    const { data: compactRows, error: compactError } = await supabase
      .from("products")
      .select(`
        id, name, slug, price, main_image_url, status, sort_order,
        product_variants (id, option_summary, price, stock, stock_status, is_active, image_url)
      `)
      .order("sort_order", { ascending: true })
      .limit(500);

    if (compactError) return NextResponse.json({ ok: false, error: compactError.message }, { status: 400, headers: noStoreHeaders() });

    const normalizedSearch = normalizeSearchText(search);
    const terms = normalizedSearch.split(/\s+/).filter(Boolean);
    const candidates = (compactRows || [])
      .filter((product: any) => !["deleted", "archived"].includes(String(product.status || "").toLowerCase()))
      .map((product: any) => {
        const name = normalizeSearchText(product.name);
        const slug = normalizeSearchText(product.slug);
        const variants = normalizeSearchText((product.product_variants || []).map((variant: any) => variant.option_summary).join(" "));
        const haystack = `${name} ${slug} ${variants}`;
        if (!terms.every((term) => haystack.includes(term))) return null;
        let score = 0;
        if (name === normalizedSearch) score += 2000;
        if (name.startsWith(normalizedSearch)) score += 1200;
        if (name.includes(normalizedSearch)) score += 850;
        for (const term of terms) {
          if (name.split(/\s+/).includes(term)) score += 250;
          else if (name.includes(term)) score += 160;
          else if (slug.includes(term)) score += 90;
          else if (variants.includes(term)) score += 45;
        }
        return { ...product, __score: score };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.__score - a.__score || Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .slice(0, 20);

    const candidateIds = candidates.map((product: any) => String(product.id));
    const imageRows = candidateIds.length
      ? await safeSelect<any>(
          supabase
            .from("product_images")
            .select("product_id, variant_id, image_url, is_main, sort_order")
            .in("product_id", candidateIds)
            .order("is_main", { ascending: false })
            .order("sort_order", { ascending: true })
        )
      : [];

    const imageByProduct = new Map<string, string>();
    const imageByVariant = new Map<string, string>();
    for (const image of imageRows) {
      if (image.product_id && image.image_url && !imageByProduct.has(String(image.product_id))) imageByProduct.set(String(image.product_id), String(image.image_url));
      if (image.variant_id && image.image_url && !imageByVariant.has(String(image.variant_id))) imageByVariant.set(String(image.variant_id), String(image.image_url));
    }

    const products = candidates.map((product: any) => {
      const mainImage = product.main_image_url || imageByProduct.get(String(product.id)) || getLocalProductImage(product.slug, product.name) || null;
      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        main_image_url: mainImage,
        product_variants: (product.product_variants || [])
          .filter((variant: any) => variant.is_active !== false && String(variant.stock_status || "").toLowerCase() !== "archived")
          .map((variant: any) => ({
            id: variant.id,
            option_summary: variant.option_summary,
            price: variant.price,
            image_url: variant.image_url || imageByVariant.get(String(variant.id)) || mainImage,
          })),
      };
    });

    return NextResponse.json({ ok: true, products }, { headers: noStoreHeaders() });
  }

  let query = supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      price,
      compare_at_price,
      currency,
      material,
      finish_color,
      short_description,
      description,
      main_image_url,
      stock_status,
      status,
      is_featured,
      is_new,
      sort_order,
      product_type,
      is_bundle,
      bundle_items,
      size_usage,
      care_advice,
      collection_id,
      product_variants (
        id,
        name,
        option_summary,
        price,
        stock,
        stock_status,
        is_active,
        image_url,
        options
      )
    `)
    .order("sort_order", { ascending: true });

  if (productId) query = query.eq("id", productId).limit(1);
  else {
    query = query.limit(260);
    if (search) query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const productRows = (data || []).filter((product: any) => product.status !== "deleted" && product.status !== "archived" && product.status !== "archived");
  const productIds = productRows.map((product: any) => String(product.id));

  const directCollectionIds = [...new Set(productRows.map((product: any) => product.collection_id).filter(Boolean).map(String))];

  const [imageRows, categoryRows, collectionLinkRows, directCollections] = await Promise.all([
    productIds.length > 0
      ? safeSelect<any>(
          supabase
            .from("product_images")
            .select("product_id, variant_id, image_url, is_main, sort_order")
            .in("product_id", productIds)
            .order("is_main", { ascending: false })
            .order("sort_order", { ascending: true })
        )
      : Promise.resolve([] as any[]),
    productIds.length > 0
      ? safeSelect<any>(
          supabase
            .from("product_categories")
            .select("product_id, categories(id, name, slug)")
            .in("product_id", productIds)
        )
      : Promise.resolve([] as any[]),
    productIds.length > 0
      ? safeSelect<any>(
          supabase
            .from("product_collections")
            .select("product_id, collections(id, name, slug)")
            .in("product_id", productIds)
        )
      : Promise.resolve([] as any[]),
    directCollectionIds.length > 0
      ? safeSelect<any>(supabase.from("collections").select("id, name, slug").in("id", directCollectionIds))
      : Promise.resolve([] as any[]),
  ]);

  const directCollectionById = new Map(directCollections.map((collection: any) => [String(collection.id), collection]));

  const imagesByProduct = new Map<string, any[]>();
  const imageByVariant = new Map<string, string>();

  for (const image of imageRows) {
    const productId = String(image.product_id || "");
    if (!imagesByProduct.has(productId)) imagesByProduct.set(productId, []);
    imagesByProduct.get(productId)!.push(image);

    if (image.variant_id && image.image_url && !imageByVariant.has(String(image.variant_id))) {
      imageByVariant.set(String(image.variant_id), String(image.image_url));
    }
  }

  const categoriesByProduct = new Map<string, any[]>();
  for (const row of categoryRows) {
    const productId = String(row.product_id || "");
    if (!categoriesByProduct.has(productId)) categoriesByProduct.set(productId, []);
    if (row.categories) categoriesByProduct.get(productId)!.push(row.categories);
  }

  const collectionsByProduct = new Map<string, any[]>();
  for (const row of collectionLinkRows) {
    const productId = String(row.product_id || "");
    if (!collectionsByProduct.has(productId)) collectionsByProduct.set(productId, []);
    if (row.collections) collectionsByProduct.get(productId)!.push(row.collections);
  }

  const products = productRows.map((product: any) => {
    const productImages = imagesByProduct.get(String(product.id)) || [];
    const productImageUrls = Array.isArray(product.image_urls) ? product.image_urls.filter(Boolean) : [];
    const mainImage =
      productImages.find((image) => image.is_main)?.image_url ||
      productImages[0]?.image_url ||
      productImageUrls[0] ||
      product.main_image_url ||
      getLocalProductImage(product.slug, product.name) ||
      null;
    const directCollection = product.collection_id ? directCollectionById.get(String(product.collection_id)) : null;
    const joinedCollections = collectionsByProduct.get(String(product.id)) || [];
    const collectionList = [...(directCollection ? [directCollection] : []), ...joinedCollections]
      .filter(Boolean)
      .filter((collection, index, array) => array.findIndex((item) => String(item.id) === String(collection.id)) === index);

    const variants = (product.product_variants || []).map((variant: any) => ({
      ...variant,
      image_url: variant.image_url || imageByVariant.get(String(variant.id)) || mainImage,
      variant_display_type: variant.options?.__displayType || "list",
      color_value: variant.options?.__colorValue || "",
    }));

    return {
      ...product,
      main_image_url: mainImage || variants.find((variant: any) => variant.image_url)?.image_url || null,
      image_urls: [...productImages.map((image) => image.image_url).filter(Boolean), ...productImageUrls].filter(Boolean),
      product_variants: variants,
      category_ids: (categoriesByProduct.get(String(product.id)) || []).map((item) => item.id),
      categories: categoriesByProduct.get(String(product.id)) || [],
      collection_ids: collectionList.map((item) => item.id),
      collection_list: collectionList,
    };
  });

  const [rawCollections, rawCategories] = await Promise.all([
    safeSelect<any>(supabase.from("collections").select("id, name, slug, status").order("sort_order", { ascending: true })),
    safeSelect<any>(supabase.from("categories").select("id, name, slug, status").order("sort_order", { ascending: true })),
  ]);

  const collections = rawCollections.filter((item) => item.status !== "inactive");
  const categories = rawCategories.filter((item) => item.status !== "inactive");

  return NextResponse.json({ ok: true, products, collections, categories }, { headers: noStoreHeaders() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const body = await request.json();


  const name = clean(body.name);
  if (!name) return NextResponse.json({ ok: false, error: "Ürün adı gerekli." }, { status: 400 });

  const price = toNumber(body.price);
  if (price <= 0) return NextResponse.json({ ok: false, error: "Fiyat gerekli." }, { status: 400 });

  const photos = Array.isArray(body.photos) ? body.photos.map(clean).filter(Boolean) : [];
  const mainImageUrl = clean(body.main_image_url) || photos[0] || null;
  const variants = Array.isArray(body.variants) ? body.variants : [];
  const isBundle = body.productType === "bundle" || body.isBundle === true;
  const now = new Date().toISOString();

  const slug = clean(body.slug) || slugify(name) || `urun-${Date.now()}`;

  const rawCollectionIds = Array.isArray(body.collection_ids)
    ? body.collection_ids.map(clean).filter(Boolean)
    : clean(body.collection_id)
      ? [clean(body.collection_id)]
      : [];

  const rawCategoryIds = Array.isArray(body.category_ids) ? body.category_ids.map(clean).filter(Boolean) : [];

  let collectionIds: string[] = [];
  let categoryIds: string[] = [];
  try {
    collectionIds = (await Promise.all(rawCollectionIds.map((id: string) => resolveCatalogId(supabase, "collections", id)))).filter(Boolean) as string[];
    categoryIds = (await Promise.all(rawCategoryIds.map((id: string) => resolveCatalogId(supabase, "categories", id)))).filter(Boolean) as string[];
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Kategori/koleksiyon çözülemedi." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    name,
    slug,
    price,
    compare_at_price: body.compare_at_price ? toNumber(body.compare_at_price) : null,
    currency: "TRY",
    material: clean(body.material) || null,
    finish_color: clean(body.finish_color) || null,
    short_description: clean(body.short_description) || null,
    description: clean(body.description) || null,
    main_image_url: mainImageUrl,
    stock_status: clean(body.stock_status) || "in_stock",
    status: clean(body.status) || "active",
    is_featured: Boolean(body.is_featured),
    is_new: body.is_new !== false,
    product_type: isBundle ? "bundle" : "single",
    is_bundle: isBundle,
    bundle_items: Array.isArray(body.bundleItems) ? body.bundleItems : [],
    size_usage: clean(body.size_usage) || null,
    care_advice: clean(body.care_advice) || null,
    updated_at: now,
  };

  if (collectionIds[0]) payload.collection_id = collectionIds[0];

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert(payload)
    .select("id, name, slug")
    .single();

  if (productError) return NextResponse.json({ ok: false, error: productError.message }, { status: 400 });

  const productId = String(product.id);

  const variantRows = variants.length > 0
    ? variants.map((variant: any, index: number) => {
        const options = variant.options && typeof variant.options === "object" ? variant.options : {};
        const displayType = clean(variant.variant_display_type || variant.displayType || options.__displayType) || "list";
        const colorValue = clean(variant.color_value || options.__colorValue);
        const images = uniqueStrings([
          ...(Array.isArray(variant.image_urls) ? variant.image_urls : []),
          variant.image_url,
        ]);
        return {
          id: clean(variant.id) || crypto.randomUUID(),
          product_id: productId,
          name: clean(variant.name) || clean(variant.option_summary) || `Varyant ${index + 1}`,
          option_summary: clean(variant.option_summary) || clean(variant.name) || `Varyant ${index + 1}`,
          price: toNumber(variant.price, price),
          stock: toInt(variant.stock, 100),
          stock_status: clean(variant.stock_status) || "in_stock",
          is_active: variant.is_active !== false,
          sort_order: index,
          options: { ...options, __displayType: displayType, __colorValue: colorValue },
          image_url: images[0] || mainImageUrl,
          updated_at: now,
          __images: images,
        };
      })
    : [{
        id: crypto.randomUUID(),
        product_id: productId,
        name: "Standart",
        option_summary: "Standart",
        price,
        stock: 100,
        stock_status: "in_stock",
        is_active: true,
        sort_order: 0,
        options: {},
        image_url: mainImageUrl,
        updated_at: now,
        __images: mainImageUrl ? [mainImageUrl] : [],
      }];

  const variantInsertRows = variantRows.map(({ __images, ...row }: any) => row);
  const imageRows = photos.map((imageUrl: string, index: number) => ({
    product_id: productId,
    image_url: imageUrl,
    alt_text: name,
    sort_order: index,
    is_main: imageUrl === mainImageUrl || (!mainImageUrl && index === 0),
  }));

  const [categoryWrite, collectionWrite, imageWrite, variantWrite] = await Promise.all([
    categoryIds.length > 0
      ? supabase.from("product_categories").upsert(
          categoryIds.map((category_id: string) => ({ product_id: productId, category_id })),
          { onConflict: "product_id,category_id", ignoreDuplicates: true },
        )
      : Promise.resolve({ error: null }),
    collectionIds.length > 0
      ? supabase.from("product_collections").upsert(
          collectionIds.map((collection_id: string) => ({ product_id: productId, collection_id })),
          { onConflict: "product_id,collection_id", ignoreDuplicates: true },
        )
      : Promise.resolve({ error: null }),
    imageRows.length > 0
      ? supabase.from("product_images").insert(imageRows)
      : Promise.resolve({ error: null }),
    supabase.from("product_variants").insert(variantInsertRows).select("id, image_url"),
  ]);

  if (categoryWrite.error) return failCreatedProduct(supabase, productId, `Kategori bağlantısı kurulamadı: ${categoryWrite.error.message}`);
  if (collectionWrite.error) return failCreatedProduct(supabase, productId, `Koleksiyon bağlantısı kurulamadı: ${collectionWrite.error.message}`);
  if (imageWrite.error) return failCreatedProduct(supabase, productId, `Ürün görselleri kaydedilemedi: ${imageWrite.error.message}`);
  if (variantWrite.error) return failCreatedProduct(supabase, productId, `Varyantlar kaydedilemedi: ${variantWrite.error.message}`);

  const variantImages = variantRows.flatMap((variant: any) =>
    (variant.__images || []).map((imageUrl: string, index: number) => ({
      product_id: productId,
      variant_id: variant.id,
      image_url: imageUrl,
      alt_text: variant.option_summary || variant.name || name,
      sort_order: index,
      is_main: false,
    })),
  );

  if (variantImages.length > 0) {
    const { error: variantImageError } = await supabase.from("product_images").insert(variantImages);
    if (variantImageError) return failCreatedProduct(supabase, productId, `Varyant görselleri kaydedilemedi: ${variantImageError.message}`);
  }


  const revalidate = await revalidateWebsite({ source: "admin-product-create", productIds: [String(productId)] });
  return NextResponse.json({ ok: true, product, variantMediaHandled: true, revalidate, warning: revalidate.ok ? null : revalidate.message }, { headers: noStoreHeaders() });
}

export async function updateProductWithAuth(request: Request, auth: any) {
  const { supabase } = auth;
  const body = await request.json();
  const id = String(body.id || "");

  if (!id) return NextResponse.json({ ok: false, error: "Ürün id yok." }, { status: 400 });


  const update: Record<string, unknown> = {};
  for (const field of ["name","slug","material","finish_color","stock_status","status","short_description","description","main_image_url","size_usage","care_advice"]) {
    if (field in body) update[field] = body[field] === "" ? null : body[field];
  }

  if ("price" in body) update.price = toNumber(body.price);
  if ("compare_at_price" in body) update.compare_at_price = body.compare_at_price === "" || body.compare_at_price === null ? null : toNumber(body.compare_at_price);
  if ("is_featured" in body) update.is_featured = Boolean(body.is_featured);
  if ("is_new" in body) update.is_new = body.is_new !== false;

  if (Array.isArray(body.bundleItems)) {
    const bundleItems = body.bundleItems
      .map((item: any) => ({ product_id: clean(item.product_id), quantity: toInt(item.quantity, 1) || 1 }))
      .filter((item: any) => item.product_id);

    update.bundle_items = bundleItems;
    update.is_bundle = bundleItems.length > 0 || body.productType === "bundle" || body.is_bundle === true;
    update.product_type = update.is_bundle ? "bundle" : clean(body.product_type) || "single";
  }

  update.updated_at = new Date().toISOString();

  const { data: product, error: productError } = await supabase
    .from("products")
    .update(update)
    .eq("id", id)
    .select("id, name, slug, price, compare_at_price, material, finish_color, status, stock_status, short_description, description, size_usage, care_advice, main_image_url, product_type, is_bundle, bundle_items")
    .single();

  if (productError) return NextResponse.json({ ok: false, error: productError.message }, { status: 400 });

  const syncTasks: Array<Promise<void>> = [];

  if (Array.isArray(body.variants)) {
    syncTasks.push((async () => {
      const { data: existingVariants, error: existingVariantsError } = await supabase
        .from("product_variants")
        .select("id")
        .eq("product_id", id);
      if (existingVariantsError) throw new Error(`Mevcut varyantlar alınamadı: ${existingVariantsError.message}`);

      const existingIds = new Set((existingVariants || []).map((variant: any) => String(variant.id)));
      const incomingIds = new Set(
        body.variants.map((variant: any) => clean(variant.id)).filter((variantId: string) => existingIds.has(variantId)),
      );
      const deleteIds = [...existingIds].filter((variantId) => !incomingIds.has(variantId));

      if (deleteIds.length > 0) {
        const { error: deleteVariantImagesError } = await supabase
          .from("product_images")
          .delete()
          .in("variant_id", deleteIds);
        if (deleteVariantImagesError) throw new Error(`Eski varyant görselleri silinemedi: ${deleteVariantImagesError.message}`);

        const { error: deleteVariantsError } = await supabase
          .from("product_variants")
          .delete()
          .in("id", deleteIds);
        if (deleteVariantsError) throw new Error(`Eski varyantlar silinemedi: ${deleteVariantsError.message}`);
      }

      const updatedAt = new Date().toISOString();
      const assignments = body.variants.map((variant: any, index: number) => {
        const currentOptions = variant.options && typeof variant.options === "object" ? variant.options : {};
        const displayType = clean(variant.variant_display_type || variant.displayType || currentOptions.__displayType) || "list";
        const colorValue = clean(variant.color_value || currentOptions.__colorValue);
        const requestedId = clean(variant.id);
        const variantId = requestedId && existingIds.has(requestedId) ? requestedId : crypto.randomUUID();
        const label = clean(variant.option_summary) || clean(variant.name) || `Varyant ${index + 1}`;
        const images = uniqueStrings([
          ...(Array.isArray(variant.image_urls) ? variant.image_urls : []),
          variant.image_url,
        ]);

        return {
          variantId,
          label,
          images,
          row: {
            id: variantId,
            product_id: id,
            name: clean(variant.name) || label,
            option_summary: label,
            price: toNumber(variant.price, toNumber(body.price)),
            stock: toInt(variant.stock, 100),
            stock_status: clean(variant.stock_status) || "in_stock",
            image_url: images[0] || clean(body.main_image_url) || null,
            options: { ...currentOptions, __displayType: displayType, __colorValue: colorValue },
            is_active: variant.is_active !== false,
            sort_order: index,
            updated_at: updatedAt,
          },
        };
      });

      if (!assignments.length) return;

      const { error: upsertError } = await supabase
        .from("product_variants")
        .upsert(assignments.map((assignment: any) => assignment.row), { onConflict: "id" });
      if (upsertError) throw new Error(`Varyantlar toplu kaydedilemedi: ${upsertError.message}`);

      const variantIds = assignments.map((assignment: any) => assignment.variantId);
      const { error: deleteMediaError } = await supabase
        .from("product_images")
        .delete()
        .in("variant_id", variantIds);
      if (deleteMediaError) throw new Error(`Varyant görselleri yenilenemedi: ${deleteMediaError.message}`);

      const mediaRows = assignments.flatMap((assignment: any) =>
        assignment.images.map((imageUrl: string, imageIndex: number) => ({
          product_id: id,
          variant_id: assignment.variantId,
          image_url: imageUrl,
          alt_text: assignment.label,
          sort_order: imageIndex,
          is_main: false,
        })),
      );
      if (mediaRows.length > 0) {
        const { error: mediaInsertError } = await supabase.from("product_images").insert(mediaRows);
        if (mediaInsertError) throw new Error(`Varyant görselleri toplu kaydedilemedi: ${mediaInsertError.message}`);
      }
    })());
  }

  if (Array.isArray(body.category_ids)) {
    syncTasks.push((async () => {
      const rawCategoryIds = body.category_ids.map(clean).filter(Boolean);
      const categoryIds = (await Promise.all(
        rawCategoryIds.map((categoryId: string) => resolveCatalogId(supabase, "categories", categoryId)),
      )).filter(Boolean) as string[];
      const { error } = await supabase.rpc("replace_product_categories", {
        p_product_id: id,
        p_category_ids: categoryIds,
      });
      if (error) throw new Error(`Kategori listesi güncellenemedi: ${error.message}`);
    })());
  }

  if (Array.isArray(body.collection_ids)) {
    syncTasks.push((async () => {
      const rawCollectionIds = body.collection_ids.map(clean).filter(Boolean);
      const collectionIds = (await Promise.all(
        rawCollectionIds.map((collectionId: string) => resolveCatalogId(supabase, "collections", collectionId)),
      )).filter(Boolean) as string[];
      const { error } = await supabase.rpc("replace_product_collections", {
        p_product_id: id,
        p_collection_ids: collectionIds,
      });
      if (error) throw new Error(`Koleksiyon listesi güncellenemedi: ${error.message}`);
    })());
  }

  if (Array.isArray(body.photos)) {
    syncTasks.push((async () => {
      const photoUrls = body.photos.map(clean).filter(Boolean);
      const mainImageUrl = clean(body.main_image_url) || photoUrls[0] || null;
      const { error: deleteImagesError } = await supabase
        .from("product_images")
        .delete()
        .eq("product_id", id)
        .is("variant_id", null);
      if (deleteImagesError) throw new Error(`Eski ürün görselleri silinemedi: ${deleteImagesError.message}`);

      if (photoUrls.length > 0) {
        const { error: imageError } = await supabase.from("product_images").insert(
          photoUrls.map((image_url: string, index: number) => ({
            product_id: id,
            image_url,
            alt_text: clean(body.name) || product.name,
            sort_order: index,
            is_main: image_url === mainImageUrl || (!mainImageUrl && index === 0),
          })),
        );
        if (imageError) throw new Error(`Ürün görselleri kaydedilemedi: ${imageError.message}`);
      }
    })());
  }

  try {
    await Promise.all(syncTasks);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Ürün ilişkileri kaydedilemedi.");
  }


  const revalidate = request.headers.get("x-ruth-skip-storefront-revalidate") === "1"
    ? { ok: true, skipped: true, deferred: true, attempts: 0, message: "Storefront yenilemesi güvenli ürün akışına devredildi." }
    : await revalidateWebsite({ source: "admin-product-update", productIds: [id] });
  return NextResponse.json({ ok: true, product, variantMediaHandled: true, revalidate, warning: revalidate.ok ? null : revalidate.message }, { headers: noStoreHeaders() });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  return updateProductWithAuth(request, auth);
}

export async function archiveProductWithAuth(request: Request, auth: any) {
  const { supabase } = auth;
  const url = new URL(request.url);
  let id = clean(url.searchParams.get("id"));

  if (!id) {
    try {
      const body = await request.json();
      id = clean(body.id);
    } catch {
      id = "";
    }
  }

  if (!id) return NextResponse.json({ ok: false, error: "Ürün id yok." }, { status: 400 });

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("products")
    .update({ status: "archived", updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const { error: variantArchiveError } = await supabase
    .from("product_variants")
    .update({ is_active: false, stock_status: "out_of_stock", updated_at: now })
    .eq("product_id", id);
  if (variantArchiveError) return apiError(`Ürün arşivlendi ancak varyantlar kapatılamadı: ${variantArchiveError.message}`);

  const revalidate = request.headers.get("x-ruth-skip-storefront-revalidate") === "1"
    ? { ok: true, skipped: true, deferred: true, attempts: 0, message: "Storefront yenilemesi güvenli ürün akışına devredildi." }
    : await revalidateWebsite({ source: "admin-product-archive", productIds: [id] });
  return NextResponse.json({ ok: true, revalidate, warning: revalidate.ok ? null : revalidate.message }, { headers: noStoreHeaders() });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  return archiveProductWithAuth(request, auth);
}
