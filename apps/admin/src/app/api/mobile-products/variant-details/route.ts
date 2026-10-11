import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = noStoreHeaders();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (x: unknown) => typeof x === "string" ? x.trim() : "";
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers });

function selectedOptions(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 24 || entries.some(([key, val]) =>
    !key || key.length > 100 || key.startsWith("__") ||
    typeof val !== "string" || !val.trim() || val.length > 180)) return null;
  return Object.fromEntries(entries.map(([key, val]) => [key, (val as string).trim()])) as Record<string, string>;
}

function exactRecord(a: Record<string, string>, b: Record<string, string>) {
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((key, index) => key === bk[index] && a[key] === b[key]);
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const productId = text(body?.product_id), variantId = text(body?.variant_id);
  const name = text(body?.name), expectedName = text(body?.expected_name);
  const newOptions = selectedOptions(body?.options);
  const expectedOptions = selectedOptions(body?.expected_options);
  if (!UUID.test(productId) || !UUID.test(variantId) || !name || name.length > 120 ||
      !expectedName || !newOptions || !expectedOptions) {
    return bad("Varyant bilgileri geçersiz.");
  }

  const { data: record, error: readError } = await auth.supabase
    .from("product_variants")
    .select("id,product_id,name,option_summary,options,is_active")
    .eq("product_id", productId).eq("id", variantId).maybeSingle();
  if (readError) return bad(readError.message, 503);
  if (!record || record.is_active === false) return bad("Aktif varyant bulunamadı.", 404);

  const previousOptions = record.options && typeof record.options === "object"
    ? record.options as Record<string, unknown> : {};
  const filtered = Object.fromEntries(Object.entries(previousOptions)
    .filter(([key]) => !key.startsWith("__"))
    .map(([key, value]) => [key, text(value)]));
  const previousName = text(record.option_summary) || text(record.name);
  if (previousName !== expectedName || !exactRecord(filtered, expectedOptions)) {
    return bad("Varyant başka bir işlemde güncellenmiş. Sayfayı yenile.", 409);
  }

  const { data: siblings, error: sError } = await auth.supabase
    .from("product_variants").select("id,option_summary,is_active")
    .eq("product_id", productId).limit(201);
  if (sError || !Array.isArray(siblings)) return bad("Diğer varyantlar doğrulanamadı.", 503);
  if (siblings.some((s: any) => String(s.id) !== variantId &&
      s.is_active !== false &&
      text(s.option_summary).toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) {
    return bad("Aynı isimde aktif varyant zaten var.", 409);
  }

  const reserved = Object.fromEntries(Object.entries(previousOptions).filter(([key]) => key.startsWith("__")));
  const { data: updated, error } = await auth.supabase
    .from("product_variants")
    .update({
      name, option_summary: name, options: { ...newOptions, ...reserved },
      updated_at: new Date().toISOString()
    }).eq("product_id", productId).eq("id", variantId)
    .eq("option_summary", record.option_summary)
    .select("id,product_id,name,option_summary,options").maybeSingle();
  if (error || !updated) return bad(error?.message || "Varyant değişmiş olabilir. Yeniden yükle.", 409);

  let warning: string | null = null;
  try {
    const publish = await revalidateWebsite({ source: "admin-ios-variant-details", productIds: [productId] });
    warning = publish.ok ? null : publish.message;
  } catch {
    warning = "Varyant kaydedildi ancak mağaza yenilemesi doğrulanamadı.";
  }
  return NextResponse.json({
    ok: true, product_id: productId, variant_id: variantId,
    name: updated.name, options: newOptions, warning
  }, { headers });
}
