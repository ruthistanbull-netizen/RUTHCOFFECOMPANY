type SupabaseAdmin = any;

type AdminIdentity = {
  user?: { id?: string; email?: string | null } | null;
  profile?: { id?: string; email?: string | null; full_name?: string | null } | null;
};

export type ProductRevisionSnapshot = {
  version: 1;
  captured_at: string;
  product: Record<string, any>;
  images: Array<Record<string, any>>;
  variants: Array<Record<string, any>>;
  category_ids: string[];
  collection_ids: string[];
};

function cleanId(value: unknown) {
  return String(value || "").trim();
}

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export async function captureProductRevision(
  supabase: SupabaseAdmin,
  productId: string,
): Promise<ProductRevisionSnapshot> {
  const id = cleanId(productId);
  if (!id) throw new Error("Ürün id yok.");

  const [productResult, imageResult, variantResult, categoryResult, collectionResult] =
    await Promise.all([
      supabase.from("products").select("*").eq("id", id).single(),
      supabase
        .from("product_images")
        .select("*")
        .eq("product_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_categories")
        .select("category_id")
        .eq("product_id", id),
      supabase
        .from("product_collections")
        .select("collection_id")
        .eq("product_id", id),
    ]);

  const failure = [
    productResult.error,
    imageResult.error,
    variantResult.error,
    categoryResult.error,
    collectionResult.error,
  ].find(Boolean);
  if (failure) throw new Error(failure.message || "Ürün geri alma kaydı oluşturulamadı.");

  return {
    version: 1,
    captured_at: new Date().toISOString(),
    product: productResult.data,
    images: imageResult.data || [],
    variants: variantResult.data || [],
    category_ids: (categoryResult.data || [])
      .map((row: any) => cleanId(row.category_id))
      .filter(Boolean),
    collection_ids: (collectionResult.data || [])
      .map((row: any) => cleanId(row.collection_id))
      .filter(Boolean),
  };
}

export async function createProductRevisionCheckpoint({
  supabase,
  request,
  identity,
  productId,
  snapshot,
  reason,
}: {
  supabase: SupabaseAdmin;
  request: Request;
  identity: AdminIdentity;
  productId: string;
  snapshot: ProductRevisionSnapshot;
  reason: string;
}) {
  const correlationId = crypto.randomUUID();
  const actorName =
    identity.profile?.full_name ||
    identity.profile?.email ||
    identity.user?.email ||
    "Ruth admin";

  const { data, error } = await supabase
    .from("commerce_audit_logs")
    .insert({
      action: "catalog.product_snapshot",
      entity_type: "product",
      entity_id: cleanId(productId),
      // commerce_audit_logs actor_type constraint admin yerine user kabul ediyor.
      actor_type: "user",
      actor_id: cleanId(identity.profile?.id || identity.user?.id) || null,
      actor_name: actorName,
      correlation_id: correlationId,
      reason,
      before_data: snapshot,
      after_data: null,
      metadata: {
        snapshot_version: snapshot.version,
        source: "admin-products",
        state: "checkpoint",
        admin_action: true,
      },
      ip_address: requestIp(request),
      user_agent: request.headers.get("user-agent"),
    })
    .select("id, correlation_id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "Ürün geri alma kaydı yazılamadı.");
  }

  return { id: String(data.id), correlationId: String(data.correlation_id || correlationId) };
}

export async function finalizeProductRevision({
  supabase,
  auditId,
  action,
  after,
  metadata,
}: {
  supabase: SupabaseAdmin;
  auditId: string;
  action: "catalog.product_updated" | "catalog.product_archived" | "catalog.product_restored";
  after: ProductRevisionSnapshot;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase
    .from("commerce_audit_logs")
    .update({
      action,
      after_data: after,
      metadata: {
        snapshot_version: after.version,
        source: "admin-products",
        state: "completed",
        admin_action: true,
        ...(metadata || {}),
      },
    })
    .eq("id", auditId);

  if (error) throw new Error(error.message || "Ürün değişiklik kaydı tamamlanamadı.");
}

export async function latestRestorableProductRevision(
  supabase: SupabaseAdmin,
  productId: string,
) {
  const { data, error } = await supabase
    .from("commerce_audit_logs")
    .select("id, action, reason, before_data, occurred_at, actor_name")
    .eq("entity_type", "product")
    .eq("entity_id", cleanId(productId))
    .in("action", [
      "catalog.product_snapshot",
      "catalog.product_updated",
      "catalog.product_archived",
      "catalog.product_restored",
    ])
    .not("before_data", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message || "Ürün geçmişi alınamadı.");
  return data || null;
}

export async function preserveReferencedVariants(
  supabase: SupabaseAdmin,
  productId: string,
  incomingVariants: unknown,
) {
  if (!Array.isArray(incomingVariants)) return incomingVariants;

  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", cleanId(productId));
  if (error) throw new Error(error.message || "Mevcut varyantlar alınamadı.");

  const incomingIds = new Set(
    incomingVariants.map((variant: any) => cleanId(variant?.id)).filter(Boolean),
  );
  const archived = (data || [])
    .filter((variant: any) => !incomingIds.has(cleanId(variant.id)))
    .map((variant: any) => ({
      ...variant,
      is_active: false,
      stock: 0,
      stock_status: "out_of_stock",
    }));

  return [...incomingVariants, ...archived];
}

export async function syncProductRelationReadModel(
  supabase: SupabaseAdmin,
  productId: string,
) {
  const id = cleanId(productId);
  const [categoryLinks, collectionLinks] = await Promise.all([
    supabase.from("product_categories").select("category_id").eq("product_id", id),
    supabase.from("product_collections").select("collection_id").eq("product_id", id),
  ]);
  if (categoryLinks.error) throw new Error(categoryLinks.error.message);
  if (collectionLinks.error) throw new Error(collectionLinks.error.message);

  const categoryIds = (categoryLinks.data || []).map((row: any) => row.category_id).filter(Boolean);
  const collectionIds = (collectionLinks.data || []).map((row: any) => row.collection_id).filter(Boolean);
  const [categories, collections] = await Promise.all([
    categoryIds.length
      ? supabase.from("categories").select("id, name, slug").in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
    collectionIds.length
      ? supabase.from("collections").select("id, slug").in("id", collectionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (categories.error) throw new Error(categories.error.message);
  if (collections.error) throw new Error(collections.error.message);

  const categoryById = new Map((categories.data || []).map((row: any) => [String(row.id), row]));
  const collectionById = new Map((collections.data || []).map((row: any) => [String(row.id), row]));
  const orderedCategories = categoryIds.map((categoryId: string) => categoryById.get(String(categoryId))).filter(Boolean);
  const orderedCollections = collectionIds.map((collectionId: string) => collectionById.get(String(collectionId))).filter(Boolean);

  const { error } = await supabase
    .from("products")
    .update({
      collection_id: collectionIds[0] || null,
      collection_slugs: orderedCollections.map((row: any) => row.slug).filter(Boolean),
      category_slugs: orderedCategories.map((row: any) => row.slug).filter(Boolean),
      category_names: orderedCategories.map((row: any) => row.name).filter(Boolean),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message || "Ürün ilişki özeti güncellenemedi.");
}

export function productRevisionToPatch(snapshot: ProductRevisionSnapshot) {
  const product = snapshot.product || {};
  const rowPhotos = [...(snapshot.images || [])]
    .filter((image) => !image.variant_id && image.image_url)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((image) => image.image_url);
  const photos = rowPhotos.length
    ? rowPhotos
    : [product.main_image_url].filter(Boolean);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    compare_at_price: product.compare_at_price,
    material: product.material,
    finish_color: product.finish_color,
    stock_status: product.stock_status,
    status: product.status,
    short_description: product.short_description,
    description: product.description,
    main_image_url: product.main_image_url,
    size_usage: product.size_usage,
    care_advice: product.care_advice,
    is_featured: product.is_featured,
    is_new: product.is_new,
    product_type: product.product_type,
    productType: product.is_bundle || product.product_type === "bundle" ? "bundle" : "single",
    is_bundle: Boolean(product.is_bundle),
    bundleItems: Array.isArray(product.bundle_items) ? product.bundle_items : [],
    category_ids: snapshot.category_ids || [],
    collection_ids: snapshot.collection_ids || [],
    photos,
    variants: snapshot.variants || [],
  };
}
