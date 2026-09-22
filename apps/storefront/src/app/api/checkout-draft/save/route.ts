import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeAttribution(value: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const sessionId = clean(input.session_id).slice(0, 500);
  if (!sessionId) return null;

  return {
    visitor_id: clean(input.visitor_id).slice(0, 500),
    session_id: sessionId,
    source: clean(input.source).slice(0, 100),
    medium: clean(input.medium).slice(0, 100),
    campaign: clean(input.campaign).slice(0, 500),
    content: clean(input.content).slice(0, 500),
    term: clean(input.term).slice(0, 500),
    referrer: clean(input.referrer).slice(0, 500),
    landing_page: clean(input.landing_page).slice(0, 500),
    started_at: clean(input.started_at).slice(0, 100),
  };
}

function makeOrderNo() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RST${stamp}${random}`;
}

function makeResumeToken() {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function normalizeCustomer(input: Record<string, any>) {
  return {
    fullName: clean(input.fullName),
    email: clean(input.email).toLocaleLowerCase("tr-TR"),
    phone: clean(input.phone),
    city: clean(input.city),
    district: clean(input.district),
    neighborhood: clean(input.neighborhood),
    addressLine: clean(input.addressLine),
    postalCode: clean(input.postalCode),
    note: clean(input.note),
  };
}

function hasRecoverableContact(customer: ReturnType<typeof normalizeCustomer>) {
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email);
  const hasPhone = customer.phone.replace(/\D/g, "").length >= 10;

  return hasEmail || hasPhone;
}

function customerMatches(left: Record<string, any>, right: ReturnType<typeof normalizeCustomer>) {
  const leftEmail = clean(left.email).toLocaleLowerCase("tr-TR");
  const rightEmail = clean(right.email).toLocaleLowerCase("tr-TR");
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true;

  const leftPhone = clean(left.phone).replace(/\D/g, "").slice(-10);
  const rightPhone = clean(right.phone).replace(/\D/g, "").slice(-10);
  return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

function variantIdFromKey(key: string) {
  const [, variantId] = key.split(":");
  if (!variantId || variantId === "standard") return "";
  return variantId;
}

function normalizeItems(items: unknown) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item: any) => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const rawUnitPrice = Number(item.price || item.unitPrice || item.unit_price || 0);
      const key = clean(item.key);

      return {
        productId: clean(item.id || item.productId || item.product_id),
        variantId: clean(item.variantId || item.variant_id) || variantIdFromKey(key),
        productSlug: clean(item.slug || item.productSlug || item.product_slug),
        productName: clean(item.name || item.productName || item.product_name) || "Ürün",
        variantName: clean(item.size || item.variantName || item.variant_name),
        quantity,
        unitPrice: Number.isFinite(rawUnitPrice) ? rawUnitPrice : 0,
        totalPrice: Number.isFinite(rawUnitPrice) ? Number((rawUnitPrice * quantity).toFixed(2)) : 0,
        imageUrl: clean(item.image || item.imageUrl || item.image_url) || null,
      };
    })
    .filter((item) => item.productSlug && item.quantity > 0);
}

function cartSignature(items: unknown) {
  if (!Array.isArray(items)) return "[]";
  const normalized = items
    .map((item: any) => ({
      product: clean(item.productSlug || item.product_slug || item.slug || item.productId || item.product_id || item.id),
      variant: clean(item.variantId || item.variant_id) || variantIdFromKey(clean(item.key)),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }))
    .sort((left, right) => `${left.product}|${left.variant}`.localeCompare(`${right.product}|${right.variant}`));
  return JSON.stringify(normalized);
}

async function resolveCanonicalPrices(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  items: ReturnType<typeof normalizeItems>,
) {
  const slugs = [...new Set(items.map((item) => item.productSlug).filter(Boolean))];
  const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))];

  const [productsResult, variantsResult] = await Promise.all([
    slugs.length
      ? supabase.from("products").select("id, slug, price, status").in("slug", slugs)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? supabase.from("product_variants").select("id, product_id, price, is_active").in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const productsBySlug = new Map<string, any>(
    (productsResult.data || []).map((row: any) => [String(row.slug), row] as [string, any]),
  );
  const variantsById = new Map<string, any>(
    (variantsResult.data || []).map((row: any) => [String(row.id), row] as [string, any]),
  );

  return items.map((item) => {
    const product = productsBySlug.get(item.productSlug) || null;
    if (!product || product.status !== "active") {
      throw new Error(`${item.productName} artık satışta değil.`);
    }

    const variant = item.variantId ? variantsById.get(item.variantId) || null : null;
    if (item.variantId && (!variant || variant.is_active === false || String(variant.product_id) !== String(product.id))) {
      throw new Error(`${item.productName} için seçilen varyant artık geçerli değil.`);
    }

    const unitPrice = positiveNumber(variant?.price) || positiveNumber(product.price);
    if (unitPrice <= 0) {
      throw new Error(`${item.productName} için geçerli ürün fiyatı bulunamadı.`);
    }

    return {
      ...item,
      productId: String(product.id),
      unitPrice,
      totalPrice: Number((unitPrice * item.quantity).toFixed(2)),
    };
  });
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    const normalizedItems = normalizeItems(body.items || []);
    if (!normalizedItems.length) {
      return NextResponse.json({ ok: false, error: "Sepet boş." }, { status: 400 });
    }
    const items = await resolveCanonicalPrices(supabase, normalizedItems);

    const customer = normalizeCustomer(body.customer || {});
    const attribution = normalizeAttribution(body.attribution);
    if (!hasRecoverableContact(customer)) {
      return NextResponse.json({
        ok: false,
        skipped: true,
        error: "Terk sepet kaydı için e-posta veya telefon bilgisi gerekiyor.",
      });
    }

    const subtotal = Number(items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
    const totalAmount = subtotal;
    const now = new Date().toISOString();
    const incomingToken = clean(body.resumeToken || body.draftToken);
    let token = incomingToken || makeResumeToken();

    const queryParts = [`resume_token.eq.${token}`, `merchant_oid.eq.${token}`, `order_no.eq.${token}`];
    const { data: existing } = await supabase
      .from("checkout_drafts")
      .select("id, merchant_oid, order_no, resume_token, status, order_id, paytr_token, items, customer")
      .or(queryParts.join(","))
      .maybeSingle();

    const existingIsOpen = Boolean(existing?.id && !existing.order_id && existing.status !== "paid");
    const reachedPayment = Boolean(existing?.paytr_token || existing?.status === "failed");
    const sameCart = existing ? cartSignature(existing.items) === cartSignature(items) : false;
    const sameCustomer = existing ? customerMatches((existing.customer || {}) as Record<string, any>, customer) : false;

    // Ödemeye daha önce ulaşmış aynı sepet tek terk-sepet kaydı olarak kalır.
    // Sepet içeriği/varyant/adet değiştiyse eski ödeme denemesi korunur ve yeni terk-sepet açılır.
    const reuseExisting = Boolean(existing && existingIsOpen && (!reachedPayment || (sameCart && sameCustomer)));
    const reusableExisting = reuseExisting ? existing : null;
    if (existing && !reusableExisting) {
      token = makeResumeToken();
    }

    const orderNo = reusableExisting?.order_no || makeOrderNo();
    const merchantOid = reusableExisting?.merchant_oid || orderNo;
    token = reusableExisting?.resume_token || token;

    const payload = {
      merchant_oid: merchantOid,
      order_no: orderNo,
      customer,
      items,
      subtotal,
      shipping_fee: 0,
      discount_total: 0,
      total_amount: totalAmount,
      currency: "TRY",
      // Canlı Supabase tablolarının eski kurulumlarında status CHECK constraint
      // sadece waiting/paid/failed/expired değerlerine izin veriyor.
      // Bu yüzden iletişim bilgisi bırakılan terk sepeti ikas mantığında
      // "waiting" olarak kaydediyoruz; panel bunu gerçek terk sepet olarak gösterir.
      status: "waiting",
      callback_payload: {
        source: clean(body.source) || "contact_captured",
        captured_at: now,
        abandoned_logic: "ikas_contact_captured",
      },
      resume_token: token,
      ...(attribution ? { attribution } : {}),
      updated_at: now,
    };

    const result = reusableExisting
      ? await supabase
          .from("checkout_drafts")
          .update(payload)
          .eq("id", reusableExisting.id)
          .select("id, resume_token, order_no, merchant_oid")
          .single()
      : await supabase
          .from("checkout_drafts")
          .insert({
            ...payload,
            created_at: now,
          })
          .select("id, resume_token, order_no, merchant_oid")
          .single();

    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      draft: result.data,
      resumeToken: result.data?.resume_token || token,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sepet taslağı kaydedilemedi." },
      { status: 400 },
    );
  }
}
