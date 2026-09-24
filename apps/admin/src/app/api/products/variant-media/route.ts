import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalized(value: unknown) {
  return clean(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueImages(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return [...new Set(value.map(clean).filter(Boolean))];
}

function apiError(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: noStoreHeaders() },
  );
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const productId = clean(new URL(request.url).searchParams.get("product_id"));
  if (!productId) return apiError("Ürün kimliği eksik.");

  const { data, error } = await auth.supabase
    .from("product_images")
    .select("id, product_id, variant_id, image_url, is_main, sort_order")
    .eq("product_id", productId)
    .order("is_main", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) return apiError(error.message);

  const productImages: string[] = [];
  const variantImages: Record<string, string[]> = {};
  for (const row of data || []) {
    const imageUrl = clean(row.image_url);
    if (!imageUrl) continue;
    if (!row.variant_id) {
      if (!productImages.includes(imageUrl)) productImages.push(imageUrl);
      continue;
    }
    const variantId = String(row.variant_id);
    if (!variantImages[variantId]) variantImages[variantId] = [];
    if (!variantImages[variantId].includes(imageUrl)) variantImages[variantId].push(imageUrl);
  }

  return NextResponse.json(
    { ok: true, productImages, variantImages },
    { headers: noStoreHeaders() },
  );
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const productId = clean(body.productId || body.product_id);
  const incoming = Array.isArray(body.variants) ? body.variants : [];
  if (!productId) return apiError("Ürün kimliği eksik.");

  const { data: storedVariants, error: variantError } = await auth.supabase
    .from("product_variants")
    .select("id, name, option_summary")
    .eq("product_id", productId);
  if (variantError) return apiError(variantError.message);

  const stored = storedVariants || [];
  const used = new Set<string>();
  const assignments: Array<{ variantId: string; images: string[]; label: string }> = [];

  incoming.forEach((variant: any, index: number) => {
    const requestedId = clean(variant.id);
    const label = clean(variant.option_summary || variant.name) || `Varyant ${index + 1}`;
    const targetName = normalized(label);
    let match = requestedId
      ? stored.find((item: any) => String(item.id) === requestedId && !used.has(String(item.id)))
      : null;
    if (!match) {
      match = stored.find((item: any) => {
        const id = String(item.id);
        if (used.has(id)) return false;
        return normalized(item.option_summary || item.name) === targetName;
      });
    }
    if (!match) match = stored.find((item: any) => !used.has(String(item.id)));
    if (!match) return;

    const variantId = String(match.id);
    used.add(variantId);
    const images = uniqueImages([
      ...(Array.isArray(variant.image_urls) ? variant.image_urls : []),
      variant.image_url,
    ]);
    assignments.push({ variantId, images, label });
  });

  const failures = (await Promise.all(assignments.map(async (assignment) => {
    const mainImage = assignment.images[0] || null;

    const [variantUpdate, existingImagesDelete] = await Promise.all([
      auth.supabase
        .from("product_variants")
        .update({ image_url: mainImage, updated_at: new Date().toISOString() })
        .eq("id", assignment.variantId)
        .eq("product_id", productId),
      auth.supabase
        .from("product_images")
        .delete()
        .eq("variant_id", assignment.variantId),
    ]);

    if (variantUpdate.error) return `${assignment.label}: ${variantUpdate.error.message}`;
    if (existingImagesDelete.error) return `${assignment.label}: ${existingImagesDelete.error.message}`;

    if (!assignment.images.length) return null;

    const { error: insertError } = await auth.supabase
      .from("product_images")
      .insert(
        assignment.images.map((imageUrl, index) => ({
          product_id: productId,
          variant_id: assignment.variantId,
          image_url: imageUrl,
          alt_text: assignment.label,
          sort_order: index,
          is_main: false,
        })),
      );

    return insertError ? `${assignment.label}: ${insertError.message}` : null;
  }))).filter(Boolean) as string[];

  if (failures.length) {
    return apiError(`Varyant görsellerinin ${failures.length} tanesi senkronlanamadı: ${failures.slice(0, 3).join(" · ")}`, 409);
  }

  const revalidate = await revalidateWebsite({
    source: "admin-product-variant-media",
    productIds: [productId],
  });

  return NextResponse.json(
    {
      ok: true,
      productId,
      syncedVariants: assignments.length,
      revalidate,
      warning: revalidate.ok ? null : revalidate.message,
    },
    { headers: noStoreHeaders() },
  );
}
