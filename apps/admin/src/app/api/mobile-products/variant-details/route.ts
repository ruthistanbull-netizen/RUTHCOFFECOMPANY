import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = noStoreHeaders();
const clean = (x: unknown) => typeof x === "string" ? x.trim() : "";
const normalized = (x: unknown) => clean(x).toLocaleLowerCase("tr-TR");
const publicOptions = (x: unknown): Record<string, string> => {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  return Object.fromEntries(
    Object.entries(x as Record<string, unknown>)
      .filter(([key, value]) => !key.startsWith("__") && typeof value === "string")
      .map(([key, value]) => [key, String(value)])
  );
};
const sameOptions = (a: Record<string, string>, b: Record<string, string>) =>
  JSON.stringify(Object.entries(a).sort(([x], [y]) => x.localeCompare(y))) ===
  JSON.stringify(Object.entries(b).sort(([x], [y]) => x.localeCompare(y)));
function reject(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const productId = clean(body?.product_id);
  const variantId = clean(body?.variant_id);
  const name = clean(body?.name);
  const expectedName = clean(body?.expected_name);
  const next = publicOptions(body?.options);
  const previous = publicOptions(body?.expected_options);
  const raw = body?.options;
  const invalid = !raw || typeof raw !== "object" || Array.isArray(raw) ||
    Object.keys(raw).length > 24 ||
    Object.entries(raw).some(([key, value]) =>
      !key.trim() || key.startsWith("__") || key.length > 100 ||
      typeof value !== "string" || !value.trim() || value.length > 180);
  if (!productId || !variantId || !name || name.length > 120 || !expectedName || invalid) {
    return reject("Varyant adı, kimlik veya seçenekler geçersiz.");
  }

  const { data: existing, error: readError } = await auth.supabase
    .from("product_variants")
    .select("id, product_id, name, option_summary, options, updated_at, is_active")
    .eq("id", variantId).eq("product_id", productId).maybeSingle();
  if (readError || !existing || existing.is_active === false) {
    return reject("Bu markada aktif varyant bulunamadı.", 404);
  }
  const currentName = clean(existing.option_summary) || clean(existing.name);
  if (currentName !== expectedName ||
      !sameOptions(publicOptions(existing.options), previous)) {
    return reject("Varyant başka bir yerde değişti. Yeniden yükle.", 409);
  }
  const { data: siblings, error: siblingError } = await auth.supabase
    .from("product_variants")
    .select("id, name, option_summary, is_active")
    .eq("product_id", productId).neq("id", variantId);
  if (siblingError) return reject("Diğer varyantlar doğrulanamadı.", 503);
  if ((siblings || []).some((row: any) => row.is_active !== false &&
    normalized(row.option_summary || row.name) === normalized(name))) {
    return reject("Aynı isimde başka aktif varyant var.", 409);
  }

  const metadata = Object.fromEntries(
    Object.entries((existing.options || {}) as Record<string, unknown>)
      .filter(([key]) => key.startsWith("__"))
  );
  let query = auth.supabase.from("product_variants")
    .update({
      name, option_summary: name, options: { ...metadata, ...next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", variantId).eq("product_id", productId).eq("is_active", true);
  if (existing.updated_at) query = query.eq("updated_at", existing.updated_at);
  const { data: saved, error: writeError } = await query
    .select("id, product_id, name, option_summary, options").maybeSingle();
  if (writeError) return reject(writeError.message, 400);
  if (!saved) return reject("Varyant kaydı eşzamanlı değişti. Yenile.", 409);
  if (String(saved.id) !== variantId ||
      !sameOptions(publicOptions(saved.options), next)) {
    return reject("Sunucu kaydı doğrulanamadı.", 500);
  }
  let warning: string | null = null;
  try {
    const refresh = await revalidateWebsite({
      source: "admin-mobile-variant-details", productIds: [productId],
    });
    if (!refresh.ok) warning = refresh.message || "Mağaza önbelleği doğrulanamadı.";
  } catch {
    warning = "Varyant kaydedildi, mağaza yenilemesi doğrulanamadı.";
  }
  return NextResponse.json({
    ok: true, product_id: productId, variant_id: variantId, warning,
  }, { headers });
}
