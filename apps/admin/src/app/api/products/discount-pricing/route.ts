import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  defaultDiscountCampaignSettings,
  normalizeDiscountCampaignSettings,
} from "@/lib/discountCampaignSettings";
import { calculateProductDiscountPricing } from "@/lib/productDiscountPricing";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value || "").trim();
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const productId = clean(new URL(request.url).searchParams.get("product_id"));

  let productQuery = supabase
    .from("products")
    .select("id, name, price, currency, status, collection_id")
    .neq("status", "deleted")
    .neq("status", "archived")
    .order("sort_order", { ascending: true })
    .limit(productId ? 1 : 500);

  if (productId) productQuery = productQuery.eq("id", productId);

  const [{ data: products, error: productError }, { data: settingRow, error: settingsError }] = await Promise.all([
    productQuery,
    supabase
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "discount_campaigns")
      .maybeSingle(),
  ]);

  if (productError) {
    return NextResponse.json(
      { ok: false, error: productError.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  if (settingsError) {
    return NextResponse.json(
      { ok: false, error: settingsError.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const rows = products || [];
  const productIds = rows.map((product: any) => String(product.id)).filter(Boolean);

  const [categoryResult, collectionResult] = productIds.length
    ? await Promise.all([
        supabase
          .from("product_categories")
          .select("product_id, category_id")
          .in("product_id", productIds),
        supabase
          .from("product_collections")
          .select("product_id, collection_id")
          .in("product_id", productIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (categoryResult.error) {
    return NextResponse.json(
      { ok: false, error: categoryResult.error.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }
  if (collectionResult.error) {
    return NextResponse.json(
      { ok: false, error: collectionResult.error.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const categoriesByProduct = new Map<string, string[]>();
  for (const row of categoryResult.data || []) {
    const id = String(row.product_id || "");
    if (!id) continue;
    const values = categoriesByProduct.get(id) || [];
    values.push(String(row.category_id));
    categoriesByProduct.set(id, values);
  }

  const collectionsByProduct = new Map<string, string[]>();
  for (const row of collectionResult.data || []) {
    const id = String(row.product_id || "");
    if (!id) continue;
    const values = collectionsByProduct.get(id) || [];
    values.push(String(row.collection_id));
    collectionsByProduct.set(id, values);
  }

  const settings = normalizeDiscountCampaignSettings(
    settingRow?.setting_value || defaultDiscountCampaignSettings,
  );

  const pricing = rows.map((product: any) => {
    const id = String(product.id);
    const collectionIds = [
      ...(collectionsByProduct.get(id) || []),
      ...(product.collection_id ? [String(product.collection_id)] : []),
    ];
    const result = calculateProductDiscountPricing(
      {
        productId: id,
        categoryIds: [...new Set(categoriesByProduct.get(id) || [])],
        collectionIds: [...new Set(collectionIds)],
        unitPrice: Number(product.price || 0),
      },
      settings,
    );

    return {
      ...result,
      productName: product.name,
      currency: product.currency || "TRY",
      hasDiscount: result.discountAmount > 0 && result.rules.length > 0,
    };
  });

  return NextResponse.json({ ok: true, pricing }, { headers: noStoreHeaders() });
}
