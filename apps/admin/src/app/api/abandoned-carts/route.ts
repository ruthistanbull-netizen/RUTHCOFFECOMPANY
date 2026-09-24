import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";

export const runtime = "nodejs";

function asObj(value: unknown): Record<string, any> { return value && typeof value === "object" ? value as Record<string, any> : {}; }
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function positiveNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; }
function hasRecoverableContact(customer: Record<string, any>) { const email = clean(customer.email).toLocaleLowerCase("tr-TR"); const phoneDigits = clean(customer.phone).replace(/\D/g, ""); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phoneDigits.length >= 10; }
function deriveReason(draft: any) { const payload = asObj(draft.callback_payload); const raw = String(payload.failed_reason || payload.fail_reason || payload.reason || payload.error || payload.message || "").trim(); const source = String(payload.source || "").trim(); if (!raw && draft.status === "payment_reached") return "Müşteri checkout adımında iletişim bilgisi bıraktı ama satın almadı."; if (!raw && draft.status === "waiting" && ["contact_captured", "checkout_field_blur", "checkout_exit"].includes(source)) return "Müşteri checkout adımında iletişim bilgisi bıraktı ama satın almadı."; if (!raw && draft.status === "waiting") return "Müşteri iletişim bilgilerini bıraktı, ödeme başlattı ama tamamlamadı."; if (!raw && draft.status === "paid") return "Satın alma tamamlandı, kurtarılan sepet."; if (!raw) return "Ödeme başarısız oldu."; const lower = raw.toLocaleLowerCase("tr-TR"); if (lower.includes("bakiye") || lower.includes("limit")) return `Yetersiz bakiye/limit: ${raw}`; if (lower.includes("kart")) return `Kart reddi veya kart sorunu: ${raw}`; if (lower.includes("3d") || lower.includes("secure")) return `3D Secure doğrulama sorunu: ${raw}`; if (lower.includes("timeout") || lower.includes("zaman") || lower.includes("connection")) return `Teknik bağlantı/zaman aşımı: ${raw}`; return raw; }
function itemsCount(items: unknown) { if (!Array.isArray(items)) return 0; return items.reduce((sum, item: any) => sum + Number(item?.quantity || 0), 0); }
function checkoutUrl(draft: any) { const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app").replace(/\/$/, ""); const token = String(draft.resume_token || draft.merchant_oid || draft.order_no || draft.id || "").trim(); return token ? `${siteUrl}/checkout?draft=${encodeURIComponent(token)}` : `${siteUrl}/checkout`; }
function emailBadge(count: number) { if (count <= 0) return { label: "Gönderilmedi", className: "failed" }; if (count < 3) return { label: `${count}/3 gönderildi`, className: "warning" }; return { label: "3/3 gönderildi", className: "success" }; }
function minutesAgo(dateValue: string | null | undefined) { if (!dateValue) return Number.POSITIVE_INFINITY; const time = new Date(dateValue).getTime(); if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY; return (Date.now() - time) / 60000; }
function mailDiagnosis(draft: any, customer: Record<string, any>) { const email = clean(customer.email).toLocaleLowerCase("tr-TR"); const count = Number(draft.abandoned_email_count || 0); const status = String(draft.abandoned_email_status || ""); if (draft.status === "paid" || draft.order_id) return { label: "Siparişe döndü", detail: "Bu sepet satın almaya dönüştüğü için terk sepet maili gönderilmez.", className: "success" }; if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { label: "Mail yok", detail: "Müşteri e-posta bırakmadığı için otomasyon mail gönderemez.", className: "failed" }; if (count >= 3 || status === "completed") return { label: "Seri tamamlandı", detail: "Bu sepete 3 hatırlatma maili gönderilmiş.", className: "success" }; if (draft.abandoned_email_error) return { label: "Mail hatası", detail: String(draft.abandoned_email_error), className: "failed" }; if (count <= 0) { const passed = minutesAgo(draft.created_at); const remaining = Math.max(0, Math.ceil(180 - passed)); if (remaining > 0) return { label: `${remaining} dk sonra hazır`, detail: "İlk terk sepet maili için 3 saatlik bekleme süresi dolmadı.", className: "pending" }; return { label: "Gönderime hazır", detail: "Otomasyon/cron çalıştığında ilk mail gönderilecek.", className: "warning" }; } const passedAfterLast = minutesAgo(draft.abandoned_email_last_sent_at); const remaining = Math.max(0, Math.ceil(360 - passedAfterLast)); if (remaining > 0) return { label: `${remaining} dk sonra hazır`, detail: "Sonraki hatırlatma maili için bekleme süresi dolmadı.", className: "pending" }; return { label: "Sonraki mail hazır", detail: "Otomasyon/cron çalıştığında sıradaki mail gönderilecek.", className: "warning" }; }
function directImage(item: any) { return clean(item.imageUrl) || clean(item.image_url) || clean(item.image) || clean(item.thumbnail) || clean(item.photo) || ""; }
function storeSiteUrl() { const raw = clean(process.env.NEXT_PUBLIC_STORE_URL || process.env.STORE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app"); return (raw || "https://rostacoffecompany.zeabur.app").replace(/\/$/, ""); }
function normalizeImageUrl(value: unknown) { const raw = clean(value); if (!raw) return ""; if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw.startsWith("//") ? `https:${raw}` : raw; const base = storeSiteUrl(); if (raw.startsWith("/")) return `${base}${raw}`; if (raw.startsWith("products/") || raw.startsWith("uploads/") || raw.startsWith("storage/")) return `${base}/${raw}`; return raw; }
function uniqueImages(values: unknown[]) { const seen = new Set<string>(); return values.map(normalizeImageUrl).filter((value) => { if (!value || seen.has(value)) return false; seen.add(value); return true; }); }
function itemProductId(item: any) { return clean(item.productId) || clean(item.product_id) || clean(item.product?.id) || ""; }
function itemVariantId(item: any) { return clean(item.variantId) || clean(item.variant_id) || clean(item.variant?.id) || ""; }
function itemSlug(item: any) { return clean(item.productSlug) || clean(item.product_slug) || clean(item.slug) || clean(item.product?.slug) || ""; }

async function buildImageLookups(supabase: any, drafts: any[]) {
  const rawItems = drafts.flatMap((draft) => Array.isArray(draft.items) ? draft.items : []);
  const productIds = [...new Set(rawItems.map(itemProductId).filter(Boolean))];
  const variantIds = [...new Set(rawItems.map(itemVariantId).filter(Boolean))];
  const slugs = [...new Set(rawItems.map(itemSlug).filter(Boolean))];
  const productsById = new Map<string, any>(); const productsBySlug = new Map<string, any>(); const variantsById = new Map<string, any>(); const variantImages = new Map<string, string>(); const productImages = new Map<string, string>();

  if (productIds.length || slugs.length) {
    let query = supabase.from("products").select("id, name, slug, price, currency, main_image_url").limit(300);
    if (productIds.length && slugs.length) query = query.or(`id.in.(${productIds.join(",")}),slug.in.(${slugs.join(",")})`); else if (productIds.length) query = query.in("id", productIds); else query = query.in("slug", slugs);
    const { data } = await query;
    for (const product of data || []) { productsById.set(String(product.id), product); if (product.slug) productsBySlug.set(String(product.slug), product); if (product.main_image_url) productImages.set(String(product.id), product.main_image_url); }
  }
  if (variantIds.length) {
    const { data } = await supabase.from("product_variants").select("id, product_id, price, image_url, option_summary").in("id", variantIds).limit(300);
    for (const variant of data || []) { variantsById.set(String(variant.id), variant); if (variant.image_url) variantImages.set(String(variant.id), variant.image_url); }
  }
  const allProductIds = [...new Set([...productIds, ...productsById.keys()])];
  if (allProductIds.length) {
    const { data } = await supabase.from("product_images").select("product_id, image_url, is_main, sort_order").in("product_id", allProductIds).order("is_main", { ascending: false }).order("sort_order", { ascending: true }).limit(600);
    for (const image of data || []) { const productId = String(image.product_id); if (image.image_url && !productImages.has(productId)) productImages.set(productId, image.image_url); }
  }
  return { productsById, productsBySlug, variantsById, variantImages, productImages };
}

function normalizeItems(items: unknown, lookups: Awaited<ReturnType<typeof buildImageLookups>>) {
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => {
    const productId = itemProductId(item); const variantId = itemVariantId(item); const slug = itemSlug(item);
    const product = (productId && lookups.productsById.get(productId)) || (slug && lookups.productsBySlug.get(slug)) || null;
    const variant = variantId ? lookups.variantsById.get(variantId) || null : null;
    const resolvedSlug = slug || product?.slug || "";
    const productName = clean(item.productName) || clean(item.product_name) || clean(item.name) || product?.name || "Ürün";
    const productImage = productId ? lookups.productImages.get(productId) : product?.id ? lookups.productImages.get(String(product.id)) : "";
    // Ana fotoğraf her zaman katalog ana fotoğrafı; varyant görseli buna öncelik veremez.
    const imageCandidates = uniqueImages([productImage, product?.main_image_url, directImage(item)]);
    const imageUrl = imageCandidates[0] || null;
    const quantity = Math.max(1, Number(item.quantity || 1));
    const storedUnitPrice = positiveNumber(item.unitPrice || item.unit_price || item.price);
    const currentCatalogPrice = positiveNumber(variant?.price) || positiveNumber(product?.price);
    const unitPrice = storedUnitPrice || currentCatalogPrice;
    const storedTotalPrice = positiveNumber(item.totalPrice || item.total_price);
    const totalPrice = storedTotalPrice || Number((unitPrice * quantity).toFixed(2));
    return { productName, variantName: clean(item.variantName) || clean(item.variant_name) || clean(item.option_summary) || variant?.option_summary || "", quantity, unitPrice, totalPrice, imageUrl, imageCandidates, productSlug: resolvedSlug, productId, variantId };
  });
}
function displayCartTotal(draft: any, cartItems: ReturnType<typeof normalizeItems>) { const storedTotal = positiveNumber(draft.total_amount); if (storedTotal > 0) return storedTotal; return Number(cartItems.reduce((sum, item) => sum + positiveNumber(item.totalPrice), 0).toFixed(2)); }

export async function GET(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const { supabase } = auth; const url = new URL(request.url); const range = url.searchParams.get("range") || "all";
  let query = supabase.from("checkout_drafts").select("id, merchant_oid, order_no, customer, items, total_amount, currency, status, callback_payload, order_id, created_at, paid_at, failed_at, abandoned_email_count, abandoned_email_status, abandoned_email_last_sent_at, abandoned_email_error, resume_token").order("created_at", { ascending: false }).limit(200);
  query = applyRange(query, "created_at", range);
  const { data, error } = await query; if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const drafts = data || [];
  const { data: lastRunSetting } = await supabase.from("site_settings").select("setting_value").eq("setting_key", "abandoned_cart_last_run").maybeSingle();
  const lookups = await buildImageLookups(supabase, drafts);
  const rows = drafts.map((draft: any) => {
    const customer = asObj(draft.customer); const items = Array.isArray(draft.items) ? draft.items : []; const cartItems = normalizeItems(items, lookups); const totalAmount = displayCartTotal(draft, cartItems);
    const diagnosis = mailDiagnosis(draft, customer);
    return { ...draft, total_amount: totalAmount, has_recoverable_contact: hasRecoverableContact(customer), customer_name: customer.fullName || customer.full_name || "-", customer_email: customer.email || "-", customer_phone: customer.phone || "-", item_count: itemsCount(items), cart_items: cartItems, reason: deriveReason(draft), recovered: draft.status === "paid" || Boolean(draft.order_id), checkout_url: checkoutUrl(draft), abandoned_email_count: Number(draft.abandoned_email_count || 0), abandoned_email_status: draft.abandoned_email_status || "not_sent", abandoned_email_last_sent_at: draft.abandoned_email_last_sent_at || null, abandoned_email_error: draft.abandoned_email_error || null, abandoned_email_badge: emailBadge(Number(draft.abandoned_email_count || 0)), mail_diagnosis_label: diagnosis.label, mail_diagnosis_detail: diagnosis.detail, mail_diagnosis_class: diagnosis.className };
  }).filter((row: any) => !["superseded", "converted"].includes(String(row.status || ""))).filter((row: any) => row.recovered || row.has_recoverable_contact);
  const abandoned = rows.filter((row) => !row.recovered); const recovered = rows.filter((row) => row.recovered);
  return NextResponse.json({ ok: true, carts: rows, stats: { abandoned: abandoned.length, recovered: recovered.length, recoveredProducts: recovered.reduce((sum, row) => sum + Number(row.item_count || 0), 0), recoveredRevenue: recovered.reduce((sum, row) => sum + Number(row.total_amount || 0), 0) }, automation: lastRunSetting?.setting_value || null });
}
