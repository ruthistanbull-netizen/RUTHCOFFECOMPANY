import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getLocalProductImage } from "@/lib/localProductImages";
import { noStoreHeaders } from "@/lib/websiteRevalidate";
import {
  defaultDiscountCampaignSettings,
  normalizeDiscountCampaignSettings,
} from "@/lib/discountCampaignSettings";
import { calculateProductDiscountPricing } from "@/lib/productDiscountPricing";

export const runtime = "nodejs";

const DEFAULT_MATERIALS = ["Arabica", "Robusta", "Arabica + Robusta Blend", "Kafeinsiz"];
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const search = String(url.searchParams.get("q") || "").trim();
  const normalizedSearch = normalizeSearchText(search);
  const requestedPage = Math.max(1, Math.trunc(Number(url.searchParams.get("page") || 1)));
  const requestedPageSize = Math.max(1, Math.trunc(Number(url.searchParams.get("pageSize") || DEFAULT_PAGE_SIZE)));
  const page = normalizedSearch ? 1 : requestedPage;
  const pageSize = normalizedSearch ? MAX_PAGE_SIZE : Math.min(MAX_PAGE_SIZE, requestedPageSize);
  const rangeStart = (page - 1) * pageSize;
  const rangeEnd = rangeStart + pageSize - 1;

  let productQuery = auth.supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      price,
      currency,
      material,
      finish_color,
      main_image_url,
      stock_status,
      status,
      is_featured,
      is_new,
      sort_order,
      product_type,
      is_bundle,
      collection_id,
      product_variants (
        id,
        option_summary,
        price,
        stock,
        stock_status
      ),
      product_images (
        image_url,
        is_main,
        sort_order
      ),
      product_categories (category_id),
      product_collections (collection_id)
    `, { count: "exact" })
    .neq("status", "deleted")
    .neq("status", "archived")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  productQuery = normalizedSearch
    ? productQuery.limit(500)
    : productQuery.range(rangeStart, rangeEnd);

  const [productResult, categoryResult, collectionResult, discountSettingsResult] = await Promise.all([
    productQuery,
    auth.supabase
      .from("categories")
      .select("id, name, slug, status, sort_order")
      .neq("status", "inactive")
      .order("sort_order", { ascending: true }),
    auth.supabase
      .from("collections")
      .select("id, name, slug, status, sort_order")
      .neq("status", "inactive")
      .order("sort_order", { ascending: true }),
    auth.supabase
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "discount_campaigns")
      .maybeSingle(),
  ]);

  if (productResult.error) {
    return NextResponse.json({ ok: false, error: productResult.error.message }, { status: 400, headers: noStoreHeaders() });
  }
  if (categoryResult.error) {
    return NextResponse.json({ ok: false, error: categoryResult.error.message }, { status: 400, headers: noStoreHeaders() });
  }
  if (collectionResult.error) {
    return NextResponse.json({ ok: false, error: collectionResult.error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const categories = categoryResult.data || [];
  const collections = collectionResult.data || [];
  const categoryById = new Map(categories.map((item: any) => [String(item.id), item]));
  const collectionById = new Map(collections.map((item: any) => [String(item.id), item]));
  const discountSettings = normalizeDiscountCampaignSettings(
    discountSettingsResult.data?.setting_value || defaultDiscountCampaignSettings,
  );

  const rows = (productResult.data || []).filter((product: any) => {
    if (!normalizedSearch) return true;
    return normalizeSearchText(`${product.name || ""} ${product.slug || ""}`).includes(normalizedSearch);
  });

  const products = rows.map((product: any) => {
    const productImages = [...(product.product_images || [])]
      .filter((image: any) => image?.image_url)
      .sort((left: any, right: any) => Number(Boolean(right.is_main)) - Number(Boolean(left.is_main)) || Number(left.sort_order || 0) - Number(right.sort_order || 0));
    const mainImage = productImages[0]?.image_url
      || product.main_image_url
      || getLocalProductImage(product.slug, product.name)
      || null;

    const variants = (product.product_variants || []).map((variant: any) => ({
      ...variant,
      image_url: mainImage,
      image_urls: [],
    }));

    const categoryIds = uniqueStrings((product.product_categories || []).map((row: any) => row.category_id));
    const collectionIds = uniqueStrings([
      product.collection_id,
      ...(product.product_collections || []).map((row: any) => row.collection_id),
    ]);
    const collectionList = collectionIds.map((id) => collectionById.get(id)).filter(Boolean);
    const categoryList = categoryIds.map((id) => categoryById.get(id)).filter(Boolean);

    const discountPricing = calculateProductDiscountPricing(
      {
        productId: String(product.id),
        categoryIds,
        collectionIds,
        unitPrice: Number(product.price || 0),
      },
      discountSettings,
    );

    return {
      ...product,
      product_images: undefined,
      product_categories: undefined,
      product_collections: undefined,
      main_image_url: mainImage,
      image_urls: mainImage ? [String(mainImage)] : [],
      product_variants: variants,
      category_ids: categoryIds,
      categories: categoryList,
      collection_ids: collectionIds,
      collection_list: collectionList,
      discount_pricing: {
        ...discountPricing,
        hasDiscount: discountPricing.discountAmount > 0 && discountPricing.rules.length > 0,
      },
    };
  });

  const materials = uniqueStrings([
    ...products.map((product: any) => product.material),
    ...DEFAULT_MATERIALS,
  ]);
  const pricing = products.map((product: any) => ({
    ...product.discount_pricing,
    productId: String(product.id),
    productName: product.name,
    currency: product.currency || "TRY",
  }));

  const total = normalizedSearch
    ? products.length
    : Math.max(products.length, Number(productResult.count || 0));

  return NextResponse.json({
    ok: true,
    products,
    categories,
    collections,
    materials,
    pricing,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: page * pageSize < total,
    },
  }, { headers: noStoreHeaders() });
}
