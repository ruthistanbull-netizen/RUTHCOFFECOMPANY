import { resolveCatalogId } from "@/lib/catalogGroups";

export class RuthieProductCreateError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RostaInsightProductCreateError";
    this.status = status;
  }
}

export type RuthieFastProductCreateResult = {
  product: { id: string; name: string; slug: string };
  counts: {
    categories: number;
    collections: number;
    photos: number;
    variants: number;
  };
  durationMs: number;
};

export async function createRuthieProductFast(
  supabase: any,
  rawBody: Record<string, unknown>,
): Promise<RuthieFastProductCreateResult> {
  const startedAt = Date.now();
  const body = recordValue(rawBody);
  const name = clean(body.name);
  if (!name) throw new RuthieProductCreateError("Ürün adı gerekli.");

  const price = toNumber(body.price);
  if (price <= 0) throw new RuthieProductCreateError("Fiyat gerekli.");

  const photos = firstArray(body.photos, body.image_urls, body.images)
    .map((value) => clean(typeof value === "object" && value ? (value as Record<string, unknown>).url : value))
    .filter(Boolean);
  const mainImageUrl = clean(body.main_image_url) || clean(body.mainImageUrl) || photos[0] || null;
  const variants = firstArray(body.variants, body.product_variants);
  const isBundle = clean(body.productType) === "bundle"
    || clean(body.product_type) === "bundle"
    || body.isBundle === true
    || body.is_bundle === true;
  const bundleItems = firstArray(body.bundleItems, body.bundle_items);
  const now = new Date().toISOString();
  const slug = clean(body.slug) || slugify(name) || `urun-${Date.now()}`;

  const rawCollectionIds = uniqueStrings([
    ...firstArray(body.collection_ids, body.collectionIds),
    body.collection_id,
    body.collectionId,
  ]);
  const rawCategoryIds = uniqueStrings([
    ...firstArray(body.category_ids, body.categoryIds),
    body.category_id,
    body.categoryId,
  ]);

  let collectionIds: string[];
  let categoryIds: string[];
  try {
    [collectionIds, categoryIds] = await Promise.all([
      Promise.all(rawCollectionIds.map((id) => resolveCatalogId(supabase, "collections", id)))
        .then((ids) => uniqueStrings(ids)),
      Promise.all(rawCategoryIds.map((id) => resolveCatalogId(supabase, "categories", id)))
        .then((ids) => uniqueStrings(ids)),
    ]);
  } catch (error) {
    throw new RuthieProductCreateError(error instanceof Error ? error.message : "Kategori/koleksiyon çözülemedi.");
  }

  const productPayload: Record<string, unknown> = {
    name,
    slug,
    price,
    compare_at_price: present(body.compare_at_price) ? toNumber(body.compare_at_price) : null,
    currency: clean(body.currency) || "TRY",
    material: clean(body.material) || null,
    finish_color: clean(body.finish_color) || clean(body.finishColor) || null,
    short_description: clean(body.short_description) || clean(body.shortDescription) || null,
    description: clean(body.description) || null,
    main_image_url: mainImageUrl,
    stock_status: clean(body.stock_status) || clean(body.stockStatus) || "in_stock",
    status: clean(body.status) || "active",
    is_featured: Boolean(body.is_featured ?? body.isFeatured),
    is_new: (body.is_new ?? body.isNew) !== false,
    product_type: isBundle ? "bundle" : "single",
    is_bundle: isBundle,
    bundle_items: bundleItems,
    size_usage: clean(body.size_usage) || clean(body.sizeUsage) || null,
    care_advice: clean(body.care_advice) || clean(body.careAdvice) || null,
    updated_at: now,
  };
  if (collectionIds[0]) productPayload.collection_id = collectionIds[0];

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert(productPayload)
    .select("id, name, slug")
    .single();

  if (productError || !product?.id) {
    throw new RuthieProductCreateError(productError?.message || "Ürün oluşturulamadı.");
  }

  const productId = String(product.id);
  const variantRows = variants.length > 0
    ? variants.map((rawVariant, index) => {
        const variant = recordValue(rawVariant);
        const options = recordValue(variant.options);
        const displayType = clean(variant.variant_display_type || variant.displayType || options.__displayType) || "list";
        const colorValue = clean(variant.color_value || variant.colorValue || options.__colorValue);
        const variantName = clean(variant.name) || clean(variant.option_summary) || clean(variant.optionSummary) || `Varyant ${index + 1}`;
        return {
          product_id: productId,
          name: variantName,
          option_summary: clean(variant.option_summary) || clean(variant.optionSummary) || variantName,
          price: toNumber(variant.price, price),
          stock: toInt(variant.stock, 100),
          stock_status: clean(variant.stock_status) || clean(variant.stockStatus) || "in_stock",
          is_active: (variant.is_active ?? variant.isActive) !== false,
          options: { ...options, __displayType: displayType, __colorValue: colorValue },
          image_url: clean(variant.image_url) || clean(variant.imageUrl) || mainImageUrl,
          updated_at: now,
        };
      })
    : [{
        product_id: productId,
        name: "Standart",
        option_summary: "Standart",
        price,
        stock: 100,
        stock_status: "in_stock",
        is_active: true,
        options: {},
        image_url: mainImageUrl,
        updated_at: now,
      }];

  const categoryTask = categoryIds.length
    ? supabase.from("product_categories").upsert(
        categoryIds.map((category_id) => ({ product_id: productId, category_id })),
        { onConflict: "product_id,category_id", ignoreDuplicates: true },
      )
    : Promise.resolve({ error: null });
  const collectionTask = collectionIds.length
    ? supabase.from("product_collections").upsert(
        collectionIds.map((collection_id) => ({ product_id: productId, collection_id })),
        { onConflict: "product_id,collection_id", ignoreDuplicates: true },
      )
    : Promise.resolve({ error: null });
  const photoTask = photos.length
    ? supabase.from("product_images").insert(photos.map((imageUrl, index) => ({
        product_id: productId,
        image_url: imageUrl,
        alt_text: name,
        sort_order: index,
        is_main: imageUrl === mainImageUrl || (!mainImageUrl && index === 0),
      })))
    : Promise.resolve({ error: null });
  const variantTask = supabase
    .from("product_variants")
    .insert(variantRows)
    .select("id, image_url");

  const [categoryResult, collectionResult, photoResult, variantResult] = await Promise.all([
    categoryTask,
    collectionTask,
    photoTask,
    variantTask,
  ]);

  const primaryFailure = [
    categoryResult?.error ? `Kategori bağlantısı kurulamadı: ${categoryResult.error.message}` : "",
    collectionResult?.error ? `Koleksiyon bağlantısı kurulamadı: ${collectionResult.error.message}` : "",
    photoResult?.error ? `Ürün görselleri kaydedilemedi: ${photoResult.error.message}` : "",
    variantResult?.error ? `Varyantlar kaydedilemedi: ${variantResult.error.message}` : "",
  ].find(Boolean);

  if (primaryFailure) {
    await rollbackCreatedProduct(supabase, productId);
    throw new RuthieProductCreateError(primaryFailure);
  }

  const insertedVariants = Array.isArray(variantResult?.data) ? variantResult.data : [];
  const variantImages = insertedVariants
    .filter((variant: any) => variant?.id && variant?.image_url)
    .map((variant: any, index: number) => ({
      product_id: productId,
      variant_id: variant.id,
      image_url: variant.image_url,
      alt_text: name,
      sort_order: index,
      is_main: false,
    }));

  if (variantImages.length) {
    const { error: variantImageError } = await supabase.from("product_images").insert(variantImages);
    if (variantImageError) {
      await rollbackCreatedProduct(supabase, productId);
      throw new RuthieProductCreateError(`Varyant görselleri kaydedilemedi: ${variantImageError.message}`);
    }
  }

  return {
    product: { id: productId, name: String(product.name || name), slug: String(product.slug || slug) },
    counts: {
      categories: categoryIds.length,
      collections: collectionIds.length,
      photos: photos.length,
      variants: insertedVariants.length,
    },
    durationMs: Date.now() - startedAt,
  };
}

async function rollbackCreatedProduct(supabase: any, productId: string) {
  try {
    await Promise.all([
      supabase.from("product_images").delete().eq("product_id", productId),
      supabase.from("product_variants").delete().eq("product_id", productId),
      supabase.from("product_categories").delete().eq("product_id", productId),
      supabase.from("product_collections").delete().eq("product_id", productId),
    ]);
  } catch {
    // Best-effort rollback continues with the parent product.
  }
  try {
    await supabase.from("products").delete().eq("id", productId);
  } catch {
    // The original product creation error is more useful to the caller.
  }
}

function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) if (Array.isArray(value)) return value;
  return [];
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function recordValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function present(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInt(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
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
