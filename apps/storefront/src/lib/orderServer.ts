import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";
import { automaticDiscountForItem, evaluateDiscounts, loadDiscountCampaignSettings, recordDiscountRedemptions, type AppliedBenefit } from "@/lib/discountCampaigns";

export type CheckoutCartItemInput = {
  key?: string;
  id?: string;
  slug?: string;
  quantity?: number;
};

export type CheckoutCustomerInput = {
  fullName?: string;
  email?: string;
  phone?: string;
  city?: string;
  district?: string;
  neighborhood?: string;
  addressLine?: string;
  postalCode?: string;
  note?: string;
};

export type CheckoutRewardsInput = {
  useRuthPoints?: boolean;
  requestedDiscount?: number;
  pointsUsed?: number;
};

export type CheckoutCouponInput = {
  code?: string;
};

export type CheckoutAttributionInput = {
  visitor_id?: string; session_id?: string; source?: string; medium?: string; campaign?: string;
  referrer?: string; landing_page?: string; started_at?: string;
};

const RUTH_POINTS_PER_TL = 10;
const RUTHIE_MAX_DEMO_POINTS = 10000;

type NormalizedCustomer = Required<
  Pick<CheckoutCustomerInput, "fullName" | "email" | "phone" | "city" | "district" | "addressLine">
> &
  Pick<CheckoutCustomerInput, "neighborhood" | "postalCode" | "note">;

type NormalizedOrderItem = {
  productId: string;
  variantId: string | null;
  productSlug: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl: string | null;
  categoryIds: string[];
  collectionIds: string[];
};

type DraftItemPayload = NormalizedOrderItem;

export type CreatedCheckoutDraft = {
  draftId: string;
  resumeToken: string;
  orderNo: string;
  merchantOid: string;
  customer: NormalizedCustomer;
  items: NormalizedOrderItem[];
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  totalAmount: number;
  currency: string;
};

type CheckoutDraftRow = {
  id: string;
  merchant_oid: string;
  order_no: string;
  profile_id: string | null;
  customer: NormalizedCustomer;
  items: DraftItemPayload[];
  subtotal: number | string;
  shipping_fee: number | string;
  discount_total: number | string;
  coupon_code?: string | null;
  coupon_discount_total?: number | string | null;
  automatic_discount_total?: number | string | null;
  reward_discount_total?: number | string | null;
  reward_points_used?: number | string | null;
  applied_discounts?: AppliedBenefit[] | null;
  total_amount: number | string;
  currency: string;
  status: string;
  paytr_token?: string | null;
  paytr_request?: Record<string, unknown> | null;
  callback_payload?: Record<string, unknown> | null;
  order_id?: string | null;
  resume_token?: string | null;
  attribution?: CheckoutAttributionInput | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function asCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePrice(value: unknown) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(Math.trunc(quantity), 1), 10);
}

function normalizeDiscount(value: unknown) {
  const discount = Number(value);
  return Number.isFinite(discount) && discount > 0 ? discount : 0;
}

function getVariantIdFromKey(key: string | undefined) {
  if (!key) return null;
  const [, variantId] = key.split(":");
  if (!variantId || variantId === "standard") return null;
  return variantId;
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

export function normalizeCustomer(input: CheckoutCustomerInput): NormalizedCustomer {
  const customer = {
    fullName: asCleanString(input.fullName),
    email: asCleanString(input.email).toLowerCase(),
    phone: asCleanString(input.phone),
    city: asCleanString(input.city),
    district: asCleanString(input.district),
    neighborhood: asCleanString(input.neighborhood),
    addressLine: asCleanString(input.addressLine),
    postalCode: asCleanString(input.postalCode),
    note: asCleanString(input.note),
  };

  if (!customer.fullName) throw new Error("Ad soyad gerekli.");
  if (!customer.email || !customer.email.includes("@")) throw new Error("Geçerli e-posta gerekli.");
  if (!customer.phone) throw new Error("Telefon gerekli.");
  if (!customer.city) throw new Error("Il gerekli.");
  if (!customer.district) throw new Error("İlçe gerekli.");
  if (!customer.addressLine) throw new Error("Adres gerekli.");

  return customer;
}

async function normalizeCartItemsFromDatabase(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  items: CheckoutCartItemInput[],
): Promise<NormalizedOrderItem[]> {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Sepet boş.");

  const slugs = [...new Set(items.map((item) => asCleanString(item.slug)).filter(Boolean))];
  if (!slugs.length) throw new Error("Sepette ürün bilgisi bulunamadı.");

  const { data: products, error: productError } = await supabase
    .from("products")
    .select("id, name, slug, price, status, stock_status, main_image_url")
    .in("slug", slugs);
  if (productError) throw new Error(`Ürünler doğrulanamadı: ${productError.message}`);

  const productBySlug = new Map<string, any>((products || []).map((row: any) => [String(row.slug), row] as [string, any]));
  const missing = slugs.filter((slug) => !productBySlug.has(slug));
  if (missing.length) throw new Error(`Ürün bulunamadı veya satıştan kaldırıldı: ${missing.join(", ")}`);

  const productIds = (products || []).map((row: any) => String(row.id));
  const [variantResult, imageResult, categoryResult, collectionResult] = await Promise.all([
    supabase.from("product_variants")
      .select("id, product_id, price, stock, stock_status, is_active, option_summary, image_url")
      .in("product_id", productIds),
    supabase.from("product_images")
      .select("product_id, variant_id, image_url, is_main, sort_order")
      .in("product_id", productIds)
      .order("is_main", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabase.from("product_categories").select("product_id, category_id").in("product_id", productIds),
    supabase.from("product_collections").select("product_id, collection_id").in("product_id", productIds),
  ]);
  for (const [label, result] of [["varyant", variantResult], ["görsel", imageResult], ["kategori", categoryResult], ["koleksiyon", collectionResult]] as const) {
    if (result.error) throw new Error(`Ürün ${label} bilgisi alınamadı: ${result.error.message}`);
  }

  const discountSettings = await loadDiscountCampaignSettings();
  const variantsByProduct = new Map<string, any[]>();
  const variantsById = new Map<string, any>();
  for (const variant of variantResult.data || []) {
    const productId = String(variant.product_id);
    const list = variantsByProduct.get(productId) || [];
    list.push(variant);
    variantsByProduct.set(productId, list);
    variantsById.set(String(variant.id), variant);
  }
  const imagesByProduct = new Map<string, any[]>();
  const imageByVariant = new Map<string, string>();
  for (const image of imageResult.data || []) {
    const productId = String(image.product_id);
    const list = imagesByProduct.get(productId) || [];
    list.push(image);
    imagesByProduct.set(productId, list);
    if (image.variant_id && image.image_url) imageByVariant.set(String(image.variant_id), String(image.image_url));
  }
  const categoriesByProduct = new Map<string, string[]>();
  for (const row of categoryResult.data || []) {
    const productId = String(row.product_id);
    categoriesByProduct.set(productId, [...(categoriesByProduct.get(productId) || []), String(row.category_id)]);
  }
  const collectionsByProduct = new Map<string, string[]>();
  for (const row of collectionResult.data || []) {
    const productId = String(row.product_id);
    collectionsByProduct.set(productId, [...(collectionsByProduct.get(productId) || []), String(row.collection_id)]);
  }

  return items.map((input) => {
    const slug = asCleanString(input.slug);
    const product = productBySlug.get(slug);
    if (!product || product.status !== "active") throw new Error(`Ürün satışta değil: ${slug}`);
    const productId = String(product.id);
    const productVariants = (variantsByProduct.get(productId) || []).filter((row) => row.is_active !== false);
    const requestedVariantId = getVariantIdFromKey(input.key);
    let variant = requestedVariantId ? variantsById.get(requestedVariantId) : null;

    if (requestedVariantId && (!variant || String(variant.product_id) !== productId || variant.is_active === false)) {
      throw new Error(`${product.name} için seçilen varyant artık mevcut değil.`);
    }
    if (!variant && productVariants.length) {
      variant = productVariants.find((row) => /standart|standard/i.test(String(row.option_summary || ""))) || (productVariants.length === 1 ? productVariants[0] : null);
    }
    if (!variant && productVariants.length > 1) throw new Error(`${product.name} için varyant seçmelisin.`);

    const quantity = normalizeQuantity(input.quantity);
    const stockStatus = String(variant?.stock_status || product.stock_status || "in_stock");
    const stock = variant ? Number(variant.stock || 0) : null;
    if (stockStatus === "out_of_stock") throw new Error(`${product.name} stokta yok.`);
    if (stockStatus !== "preorder" && stock !== null && stock < quantity) {
      throw new Error(`${product.name} için yalnızca ${Math.max(0, stock)} adet stok var.`);
    }

    const baseUnitPrice = normalizePrice(variant?.price ?? product.price);
    if (baseUnitPrice <= 0) throw new Error(`${product.name} için geçerli fiyat bulunamadı.`);
    const discountResult = automaticDiscountForItem({
      productId,
      categoryIds: [...new Set(categoriesByProduct.get(productId) || [])],
      collectionIds: [...new Set(collectionsByProduct.get(productId) || [])],
      quantity: 1,
      unitPrice: baseUnitPrice,
    }, discountSettings);
    const discountedUnitPrice = Number(Math.max(0.01, baseUnitPrice - discountResult.discount).toFixed(2));
    const productImages = imagesByProduct.get(productId) || [];
    const imageUrl = variant?.image_url || (variant?.id ? imageByVariant.get(String(variant.id)) : null) || product.main_image_url || productImages[0]?.image_url || null;

    return {
      productId,
      variantId: variant?.id ? String(variant.id) : null,
      productSlug: String(product.slug),
      productName: String(product.name),
      variantName: variant?.option_summary ? String(variant.option_summary) : null,
      quantity,
      unitPrice: baseUnitPrice,
      totalPrice: Number((discountedUnitPrice * quantity).toFixed(2)),
      imageUrl: imageUrl ? String(imageUrl) : null,
      categoryIds: [...new Set(categoriesByProduct.get(productId) || [])],
      collectionIds: [...new Set(collectionsByProduct.get(productId) || [])],
    };
  });
}

function toDraftItemPayload(item: NormalizedOrderItem): DraftItemPayload {
  return { ...item };
}

async function saveCustomerAddress(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  profileId: string | null,
  customer: NormalizedCustomer
) {
  const payload = {
    profile_id: profileId,
    full_name: customer.fullName,
    phone: customer.phone,
    email: customer.email,
    city: customer.city,
    district: customer.district,
    neighborhood: customer.neighborhood || null,
    address_line: customer.addressLine,
    postal_code: customer.postalCode || null,
  };

  if (profileId) {
    const { data: existingAddress, error: existingError } = await supabase
      .from("customer_addresses")
      .select("id")
      .eq("profile_id", profileId)
      .eq("phone", customer.phone)
      .eq("city", customer.city)
      .eq("district", customer.district)
      .eq("address_line", customer.addressLine)
      .maybeSingle();

    if (existingError) throw new Error(`Adres kontrol edilemedi: ${existingError.message}`);
    if (existingAddress?.id) return existingAddress.id as string;

    const { count } = await supabase
      .from("customer_addresses")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId);

    const { data: address, error: addressError } = await supabase
      .from("customer_addresses")
      .insert({
        ...payload,
        is_default: Number(count || 0) === 0,
      })
      .select("id")
      .single();

    if (addressError) throw new Error(`Adres kaydedilemedi: ${addressError.message}`);
    if (!address) throw new Error("Adres kaydedilemedi: Supabase adres kaydı dönmedi.");

    return address.id as string;
  }

  const { data: address, error: addressError } = await supabase
    .from("customer_addresses")
    .insert(payload)
    .select("id")
    .single();

  if (addressError) throw new Error(`Adres kaydedilemedi: ${addressError.message}`);
  if (!address) throw new Error("Adres kaydedilemedi: Supabase adres kaydı dönmedi.");

  return address.id as string;
}

async function getReviewCouponDiscount(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  code: string | undefined,
  subtotalAfterOtherDiscounts: number,
  profileId?: string | null,
) {
  const cleanCode = asCleanString(code).toUpperCase();
  if (!cleanCode || !profileId || subtotalAfterOtherDiscounts <= 0) {
    return { found: false, code: null as string | null, discount: 0, applied: null as AppliedBenefit | null };
  }

  const { data, error } = await supabase
    .from("review_reward_coupons")
    .select("id, code, discount_percent, status, usage_limit, used_count, expires_at, profile_id")
    .eq("code", cleanCode)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error || !data) return { found: false, code: null as string | null, discount: 0, applied: null as AppliedBenefit | null };
  if (data.status !== "active") throw new Error("Bu yorum indirimi artık aktif değil.");
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) throw new Error("Bu yorum indiriminin süresi dolmuş.");
  if (Number(data.used_count || 0) >= Number(data.usage_limit || 1)) throw new Error("Bu yorum indirimi daha önce kullanılmış.");

  const percent = Math.max(0, Math.min(100, Number(data.discount_percent || 10)));
  const discount = Number(((subtotalAfterOtherDiscounts * percent) / 100).toFixed(2));
  return {
    found: true,
    code: String(data.code),
    discount,
    applied: {
      id: String(data.id || data.code),
      code: String(data.code),
      name: "Yorum indirimi",
      source: "review" as const,
      discount,
      freeShipping: false,
    },
  };
}

async function shippingConfiguration(supabase: ReturnType<typeof getSupabaseAdmin>, subtotal: number) {
  const envFee = Math.max(0, Number(process.env.SHIPPING_FEE || 79.9));
  const envThreshold = Math.max(0, Number(process.env.FREE_SHIPPING_THRESHOLD || 2000));
  let fee = envFee;
  let freeThreshold = envThreshold;

  const { data } = await supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "shipping_settings")
    .maybeSingle();

  const storedSettings = data?.setting_value as Record<string, unknown> | null;
  const storedThreshold = Number(storedSettings?.freeShippingThreshold);
  const storedFee = Number(storedSettings?.customerShippingFee ?? storedSettings?.shippingFee);
  if (Number.isFinite(storedThreshold) && storedThreshold >= 0) freeThreshold = storedThreshold;
  if (Number.isFinite(storedFee) && storedFee >= 0) fee = storedFee;

  return subtotal >= freeThreshold ? 0 : fee;
}

async function calculateCheckoutPricing({
  supabase,
  items,
  couponCode,
  customerEmail,
  profileId,
  requestedRewardDiscount = 0,
  requestedRewardPoints = 0,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  items: NormalizedOrderItem[];
  couponCode?: string | null;
  customerEmail?: string | null;
  profileId?: string | null;
  requestedRewardDiscount?: number;
  requestedRewardPoints?: number;
}) {
  // Checkout ürünleri veritabanındaki baz fiyattan gelir. Storefront'ta görünen
  // ürün/koleksiyon indirimi burada aynı kuralla tam bir kez uygulanır; böylece
  // indirim checkout toplamına yansır. Uygun kuponlar ise bu indirimli tutarın
  // ardından uygulanır ve ayrıca bir indirim olarak kaydedilir.
  const subtotal = Number(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2));
  const baseShippingFee = await shippingConfiguration(supabase, subtotal);
  const settings = await loadDiscountCampaignSettings();
  const checkoutSettings = settings;
  const discountItems = items.map((item) => ({
    productId: item.productId,
    categoryIds: item.categoryIds,
    collectionIds: item.collectionIds,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));

  const automatic = await evaluateDiscounts({
    items: discountItems,
    customerEmail: customerEmail || null,
    profileId: profileId || null,
    shippingFee: baseShippingFee,
    settings: checkoutSettings,
  });
  const afterAutomatic = Math.max(0, subtotal - automatic.automaticDiscount - automatic.couponDiscount);
  let rewardPointsAvailable = 0;
  if (profileId) {
    const { data: rewardProfile, error: rewardProfileError } = await supabase
      .from("profiles")
      .select("reward_points_balance")
      .eq("id", profileId)
      .maybeSingle();
    if (rewardProfileError) throw new Error(`ROSTA Points bakiyesi alınamadı: ${rewardProfileError.message}`);
    rewardPointsAvailable = Math.max(0, Math.floor(Number(rewardProfile?.reward_points_balance || 0)));
  }

  const requestedSafePoints = Math.max(0, Math.floor(Number(requestedRewardPoints || 0)));
  const rewardPointsUsed = Math.min(requestedSafePoints, rewardPointsAvailable);
  const maxRewardDiscount = Math.floor(rewardPointsUsed / RUTH_POINTS_PER_TL);
  const rewardDiscountTotal = Number(Math.min(afterAutomatic, normalizeDiscount(requestedRewardDiscount), maxRewardDiscount).toFixed(2));
  const actuallyUsedRewardPoints = Math.min(rewardPointsUsed, Math.round(rewardDiscountTotal * RUTH_POINTS_PER_TL));
  const afterRewards = Math.max(0, afterAutomatic - rewardDiscountTotal);

  let couponDiscountTotal = 0;
  let couponCodeResult: string | null = null;
  let freeShipping = automatic.freeShipping;
  let applied = [...automatic.applied];

  const cleanCoupon = asCleanString(couponCode).toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
  if (cleanCoupon) {
    const reviewCoupon = await getReviewCouponDiscount(supabase, cleanCoupon, afterRewards, profileId);
    if (reviewCoupon.found) {
      couponDiscountTotal = Math.min(afterRewards, reviewCoupon.discount);
      couponCodeResult = reviewCoupon.code;
      if (reviewCoupon.applied) applied.push(reviewCoupon.applied);
    } else {
      const couponEvaluation = await evaluateDiscounts({
        items: discountItems,
        couponCode: cleanCoupon,
        customerEmail: customerEmail || null,
        profileId: profileId || null,
        shippingFee: baseShippingFee,
        settings: checkoutSettings,
      });
      couponDiscountTotal = Math.min(afterRewards, couponEvaluation.couponDiscount);
      couponCodeResult = couponEvaluation.couponCode;
      freeShipping = freeShipping || couponEvaluation.freeShipping;
      for (const benefit of couponEvaluation.applied.filter((entry) => entry.source !== "automatic")) {
        if (!applied.some((entry) => entry.id === benefit.id && entry.code === benefit.code)) applied.push(benefit);
      }
    }
  }

  const automaticDiscountTotal = Number((automatic.automaticDiscount + automatic.couponDiscount).toFixed(2));
  const discountTotal = Number(Math.min(subtotal, automaticDiscountTotal + rewardDiscountTotal + couponDiscountTotal).toFixed(2));
  const shippingFee = freeShipping ? 0 : baseShippingFee;
  const totalAmount = Number(Math.max(0, subtotal + shippingFee - discountTotal).toFixed(2));

  return {
    subtotal,
    baseShippingFee,
    shippingFee,
    automaticDiscountTotal,
    rewardDiscountTotal,
    rewardPointsAvailable,
    rewardPointsUsed: actuallyUsedRewardPoints,
    couponDiscountTotal,
    discountTotal,
    totalAmount,
    couponCode: couponCodeResult,
    appliedDiscounts: applied,
    freeShipping,
  };
}

async function getProfileIdFromAuthToken(authToken: string | null | undefined, customer: NormalizedCustomer) {
  if (!authToken) return null;

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(authToken);
  if (userError || !userData.user) {
    throw new Error("Üyelik oturumu doğrulanamadı.");
  }

  const user = userData.user;
  const fullName = customer.fullName || (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "");
  const phone = customer.phone || (typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : "");

  const phoneNormalized = normalizePhone(phone);
  const profilePayload = {
    auth_user_id: user.id,
    email: user.email || customer.email,
    full_name: fullName || null,
    phone: phone || null,
    phone_normalized: phoneNormalized || null,
  };

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "auth_user_id" })
    .select("id")
    .single();

  if (profileError && profileError.message.toLocaleLowerCase("tr-TR").includes("phone_normalized")) {
    const { phone_normalized: _phoneNormalized, ...fallbackProfilePayload } = profilePayload;

    const fallbackResult = await supabase
      .from("profiles")
      .upsert(fallbackProfilePayload, { onConflict: "auth_user_id" })
      .select("id")
      .single();

    profile = fallbackResult.data;
    profileError = fallbackResult.error;
  }

  if (profileError) throw new Error(`Profil kaydedilemedi: ${profileError.message}`);
  if (!profile) throw new Error("Profil kaydedilemedi: Supabase profil kaydı dönmedi.");

  return profile.id as string;
}

async function getQuoteIdentity(authToken?: string | null, email?: string | null) {
  const supabase = getSupabaseAdmin();
  let profileId: string | null = null;
  let customerEmail = asCleanString(email).toLowerCase() || null;
  if (!authToken) return { profileId, customerEmail };

  const { data, error } = await supabase.auth.getUser(authToken);
  if (error || !data.user) return { profileId, customerEmail };
  customerEmail = data.user.email?.toLowerCase() || customerEmail;
  const profileResult = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!profileResult.error && profileResult.data?.id) profileId = String(profileResult.data.id);
  return { profileId, customerEmail };
}

export async function createCheckoutQuote({
  items: cartItems,
  couponCode,
  authToken,
  customerEmail,
  rewards,
}: {
  items: CheckoutCartItemInput[];
  couponCode?: string | null;
  authToken?: string | null;
  customerEmail?: string | null;
  rewards?: CheckoutRewardsInput | null;
}) {
  const supabase = getSupabaseAdmin();
  const items = await normalizeCartItemsFromDatabase(supabase, cartItems);
  const identity = await getQuoteIdentity(authToken, customerEmail);
  const pricing = await calculateCheckoutPricing({
    supabase,
    items,
    couponCode,
    customerEmail: identity.customerEmail,
    profileId: identity.profileId,
    requestedRewardDiscount: rewards?.useRuthPoints ? normalizeDiscount(rewards.requestedDiscount) : 0,
    requestedRewardPoints: Math.max(0, Math.min(Number(rewards?.pointsUsed || 0), RUTHIE_MAX_DEMO_POINTS)),
  });
  return {
    ...pricing,
    currency: "TRY",
    couponValid: Boolean(pricing.couponCode),
  };
}

export async function repriceExistingCheckoutDraft({
  draft,
  authToken,
  rewards,
  coupon,
}: {
  draft: CreatedCheckoutDraft & { draftId: string };
  authToken?: string | null;
  rewards?: CheckoutRewardsInput | null;
  coupon?: CheckoutCouponInput | null;
}) {
  const supabase = getSupabaseAdmin();
  const profileId = await getProfileIdFromAuthToken(authToken, draft.customer);
  const pricing = await calculateCheckoutPricing({
    supabase,
    items: draft.items,
    couponCode: coupon?.code || null,
    customerEmail: draft.customer.email,
    profileId,
    requestedRewardDiscount: rewards?.useRuthPoints ? Number(rewards.requestedDiscount || 0) : 0,
    requestedRewardPoints: rewards?.useRuthPoints ? Number(rewards.pointsUsed || 0) : 0,
  });

  const updatePayload = {
    profile_id: profileId,
    subtotal: pricing.subtotal,
    shipping_fee: pricing.shippingFee,
    discount_total: pricing.discountTotal,
    automatic_discount_total: pricing.automaticDiscountTotal,
    reward_discount_total: pricing.rewardDiscountTotal,
    reward_points_used: pricing.rewardPointsUsed,
    coupon_code: pricing.couponCode,
    coupon_discount_total: pricing.couponDiscountTotal,
    applied_discounts: pricing.appliedDiscounts,
    total_amount: pricing.totalAmount,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("checkout_drafts").update(updatePayload).eq("id", draft.draftId);
  if (error) throw new Error(`Ödeme linki indirimi kaydedilemedi: ${error.message}`);

  return {
    ...draft,
    profileId,
    ...pricing,
  };
}

export async function createCheckoutDraft({
  customer: customerInput,
  items: cartItems,
  authToken,
  existingDraftToken,
  rewards,
  coupon,
  attribution,
}: {
  customer: CheckoutCustomerInput;
  items: CheckoutCartItemInput[];
  authToken?: string | null;
  existingDraftToken?: string | null;
  rewards?: CheckoutRewardsInput | null;
  coupon?: CheckoutCouponInput | null;
  attribution?: CheckoutAttributionInput | null;
}): Promise<CreatedCheckoutDraft> {
  const supabase = getSupabaseAdmin();
  const customer = normalizeCustomer(customerInput);
  const profileId = await getProfileIdFromAuthToken(authToken, customer);
  const items = await normalizeCartItemsFromDatabase(supabase, cartItems);
  const requestedRewardDiscount = rewards?.useRuthPoints ? normalizeDiscount(rewards.requestedDiscount) : 0;
  const requestedRewardPoints = Math.max(0, Math.min(Number(rewards?.pointsUsed || 0), RUTHIE_MAX_DEMO_POINTS));
  const pricing = await calculateCheckoutPricing({
    supabase,
    items,
    couponCode: coupon?.code,
    customerEmail: customer.email,
    profileId,
    requestedRewardDiscount,
    requestedRewardPoints,
  });
  const { subtotal, shippingFee, rewardDiscountTotal, couponDiscountTotal, automaticDiscountTotal, discountTotal, totalAmount } = pricing;
  const currency = "TRY";
  const token = asCleanString(existingDraftToken);
  let existingDraft: {
    id: string;
    merchant_oid: string | null;
    order_no: string | null;
    resume_token?: string | null;
    status?: string | null;
    order_id?: string | null;
    paytr_token?: string | null;
  } | null = null;
  let matchedDraft = false;

  if (token) {
    const queryParts = [`resume_token.eq.${token}`, `merchant_oid.eq.${token}`, `order_no.eq.${token}`];
    if (isUuid(token)) queryParts.push(`id.eq.${token}`);

    const { data: existing, error: existingError } = await supabase
      .from("checkout_drafts")
      .select("id, merchant_oid, order_no, resume_token, status, order_id, paytr_token")
      .or(queryParts.join(","))
      .maybeSingle();

    matchedDraft = Boolean(!existingError && existing);
    if (
      !existingError &&
      existing &&
      !existing.order_id &&
      existing.status === "waiting" &&
      !existing.paytr_token
    ) {
      existingDraft = existing;
    }
  }

  const orderNo = existingDraft?.order_no || makeOrderNo();
  const merchantOid = existingDraft?.merchant_oid || orderNo;
  const resumeToken = existingDraft?.resume_token || (matchedDraft ? makeResumeToken() : token || makeResumeToken());

  const draftPayload = {
    merchant_oid: merchantOid,
    order_no: orderNo,
    profile_id: profileId,
    customer,
    items: items.map(toDraftItemPayload),
    subtotal,
    shipping_fee: shippingFee,
    discount_total: discountTotal,
    coupon_code: pricing.couponCode,
    coupon_discount_total: couponDiscountTotal,
    automatic_discount_total: automaticDiscountTotal,
    reward_discount_total: rewardDiscountTotal,
    reward_points_used: pricing.rewardPointsUsed,
    applied_discounts: pricing.appliedDiscounts,
    total_amount: totalAmount,
    currency,
    status: "waiting",
    resume_token: resumeToken,
    attribution: attribution || null,
    updated_at: new Date().toISOString(),
  };

  const draftResult = existingDraft
    ? await supabase
        .from("checkout_drafts")
        .update(draftPayload)
        .eq("id", existingDraft.id)
        .select("id")
        .single()
    : await supabase
        .from("checkout_drafts")
        .insert(draftPayload)
        .select("id")
        .single();

  const draft = draftResult.data;
  const draftError = draftResult.error;

  if (draftError) {
    if (draftError.message.toLocaleLowerCase("tr-TR").includes("checkout_drafts")) {
      throw new Error("Ödeme taslak tablosu yok. Supabase'de supabase/PAYTR-CHECKOUT-DRAFTS-SQL.sql dosyasını çalıştır.");
    }

    throw new Error(`Ödeme taslağı oluşturulamadı: ${draftError.message}`);
  }

  if (!draft) throw new Error("Ödeme taslağı oluşturulamadı: Supabase kayıt dönmedi.");

  return {
    draftId: String(draft.id),
    resumeToken,
    orderNo,
    merchantOid,
    customer,
    items,
    subtotal,
    shippingFee,
    discountTotal,
    totalAmount,
    currency,
  };
}

export async function updateCheckoutDraftPaytrRequest({
  merchantOid,
  paytrToken,
  paytrRequest,
}: {
  merchantOid: string;
  paytrToken: string;
  paytrRequest: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("checkout_drafts")
    .update({
      paytr_token: paytrToken,
      paytr_request: paytrRequest,
      status: "waiting",
      failed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_oid", merchantOid);

  if (error) throw new Error(`Ödeme taslağı güncellenemedi: ${error.message}`);
}


async function buildOrderAttribution(supabase: any, draft: CheckoutDraftRow) {
  const input = draft.attribution || {};
  const visitorId = asCleanString(input.visitor_id);
  const purchaseSessionId = asCleanString(input.session_id);
  let events: any[] = [];
  if (visitorId) {
    const result = await supabase.from("analytics_events")
      .select("session_id,event_name,path,metadata,created_at,user_agent")
      .filter("metadata->>visitor_id", "eq", visitorId)
      .order("created_at", { ascending: true }).limit(5000);
    if (!result.error) events = result.data || [];
  }
  if (!events.length && purchaseSessionId) {
    const result = await supabase.from("analytics_events")
      .select("session_id,event_name,path,metadata,created_at,user_agent")
      .eq("session_id", purchaseSessionId).order("created_at", { ascending: true }).limit(1000);
    if (!result.error) events = result.data || [];
  }

  type SessionSummary = {
    first: number; last: number; active: number; source: any; pageViews: number; productViews: number;
    cartAdds: number; checkouts: number; pages: string[]; products: Map<string, { slug: string; name: string; views: number }>;
    device: any; country: string; city: string;
  };
  const sessions = new Map<string, SessionSummary>();
  const timeline: any[] = [];
  const products = new Map<string, { slug: string; name: string; views: number; cart_adds: number }>();
  let totalPageViews = 0, totalProductViews = 0, totalCartAdds = 0, totalCheckouts = 0;

  for (const event of events) {
    const id = String(event.session_id || "");
    if (!id) continue;
    const t = new Date(event.created_at).getTime();
    const meta = event.metadata || {};
    const row: SessionSummary = sessions.get(id) || {
      first: t, last: t, active: 0, source: meta, pageViews: 0, productViews: 0, cartAdds: 0, checkouts: 0,
      pages: [], products: new Map<string, { slug: string; name: string; views: number }>(), device: meta, country: String(meta.country || ""), city: String(meta.city || ""),
    };
    row.first = Math.min(row.first, t); row.last = Math.max(row.last, t);
    row.active = Math.max(row.active, Number(meta.active_seconds || 0));
    if (event.event_name === "session_start") row.source = meta || row.source;
    if (meta.device_type || meta.browser || meta.os) row.device = meta;
    if (meta.country) row.country = String(meta.country); if (meta.city) row.city = String(meta.city);

    const path = String(event.path || meta.pathname || "");
    if (event.event_name === "page_view") {
      row.pageViews += 1; totalPageViews += 1;
      if (path && row.pages[row.pages.length - 1] !== path) row.pages.push(path);
    }
    if (event.event_name === "product_view") {
      row.productViews += 1; totalProductViews += 1;
      const slug = String(meta.product_slug || path.split("/products/")[1] || "");
      const name = String(meta.product_name || slug || "Ürün");
      if (slug) {
        const rp = row.products.get(slug) || { slug, name, views: 0 }; rp.views += 1; row.products.set(slug, rp);
        const all = products.get(slug) || { slug, name, views: 0, cart_adds: 0 }; all.views += 1; products.set(slug, all);
      }
    }
    if (event.event_name === "cart_add") {
      row.cartAdds += 1; totalCartAdds += 1;
      const slug = String(meta.product_slug || ""); const name = String(meta.product_name || slug || "Ürün");
      if (slug) { const all = products.get(slug) || { slug, name, views: 0, cart_adds: 0 }; all.cart_adds += 1; products.set(slug, all); }
    }
    if (event.event_name === "checkout_view" || event.event_name === "payment_start") { row.checkouts += 1; totalCheckouts += 1; }
    if (["page_view", "product_view", "cart_add", "checkout_view", "payment_start"].includes(String(event.event_name))) {
      timeline.push({ event: event.event_name, path: path || null, product_slug: meta.product_slug || null, product_name: meta.product_name || null, at: event.created_at });
    }
    sessions.set(id, row);
  }

  const ordered = [...sessions.entries()].sort((a, b) => a[1].first - b[1].first);
  const foundIndex = ordered.findIndex(([id]) => id === purchaseSessionId);
  const purchaseIndex = foundIndex >= 0 ? foundIndex : Math.max(0, ordered.length - 1);
  const purchase = sessions.get(purchaseSessionId) || ordered[purchaseIndex]?.[1];
  const duration = (row: SessionSummary | undefined) => row ? Math.max(row.active, Math.round((row.last - row.first) / 1000)) : 0;
  const sourceData: any = purchase?.source || input;
  const firstEventAt = events[0]?.created_at ? new Date(events[0].created_at) : null;
  const purchaseAt = new Date();
  const decisionSeconds = firstEventAt ? Math.max(0, Math.round((purchaseAt.getTime() - firstEventAt.getTime()) / 1000)) : 0;

  const email = String(draft.customer?.email || "").trim().toLowerCase();
  let previousOrderCount = 0, previousLifetimeValue = 0;
  if (email) {
    const previous = await supabase.from("orders").select("total_amount").eq("customer_email", email).eq("payment_status", "paid");
    if (!previous.error) {
      previousOrderCount = (previous.data || []).length;
      previousLifetimeValue = (previous.data || []).reduce((sum: number, row: any) => sum + Number(row.total_amount || 0), 0);
    }
  }

  const heatScore = Math.max(1, Math.min(100,
    15 + Math.min(25, ordered.length * 5) + Math.min(20, totalProductViews * 2) + Math.min(20, totalCartAdds * 6) + Math.min(10, totalCheckouts * 4) + (previousOrderCount > 0 ? 10 : 0)
  ));
  const productList = [...products.values()].sort((a, b) => (b.views + b.cart_adds * 3) - (a.views + a.cart_adds * 3)).slice(0, 20);
  const firstTouch = (events.find((event) => event.event_name === "session_start")?.metadata?.first_touch || sourceData.first_touch || null);

  return {
    traffic_source: asCleanString(sourceData.source) || "unknown",
    traffic_medium: asCleanString(sourceData.medium) || null,
    traffic_campaign: asCleanString(sourceData.campaign) || null,
    traffic_referrer: asCleanString(sourceData.referrer) || null,
    visitor_id: visitorId || null,
    purchase_session_id: purchaseSessionId || null,
    session_count_before_purchase: ordered.length || 1,
    purchase_session_number: purchaseIndex + 1,
    total_session_duration_seconds: ordered.reduce((sum, [, row]) => sum + duration(row), 0),
    purchase_session_duration_seconds: duration(purchase),
    attribution_data: {
      landing_page: sourceData.landing_page || input.landing_page || null,
      first_touch: firstTouch,
      last_touch: { source: sourceData.source || "unknown", medium: sourceData.medium || null, campaign: sourceData.campaign || null, content: sourceData.content || null, term: sourceData.term || null },
      first_visit_at: firstEventAt?.toISOString() || input.started_at || null,
      purchase_at: purchaseAt.toISOString(),
      decision_time_seconds: decisionSeconds,
      page_views: totalPageViews,
      product_views: totalProductViews,
      cart_adds: totalCartAdds,
      checkout_starts: totalCheckouts,
      products: productList,
      timeline: timeline.slice(-120),
      device: purchase ? {
        type: purchase.device?.device_type || null, browser: purchase.device?.browser || null, os: purchase.device?.os || null,
        screen: purchase.device?.screen_width && purchase.device?.screen_height ? `${purchase.device.screen_width}x${purchase.device.screen_height}` : null,
        country: purchase.country || null, city: purchase.city || null,
      } : null,
      customer: {
        is_first_order: previousOrderCount === 0,
        previous_order_count: previousOrderCount,
        lifetime_value_before_order: Number(previousLifetimeValue.toFixed(2)),
        lifetime_value_after_order: Number((previousLifetimeValue + Number(draft.total_amount || 0)).toFixed(2)),
        heat_score: heatScore,
        segment: previousOrderCount > 0 ? "Tekrar Müşteri" : heatScore >= 75 ? "Çok Sıcak" : heatScore >= 50 ? "İlgili" : "Hızlı Karar",
      },
      sessions: ordered.map(([id, row], i) => ({
        session_id: id, number: i + 1, duration_seconds: duration(row), source: row.source?.source || "unknown",
        medium: row.source?.medium || null, campaign: row.source?.campaign || null, landing_page: row.source?.landing_page || null,
        started_at: new Date(row.first).toISOString(), ended_at: new Date(row.last).toISOString(), page_views: row.pageViews,
        product_views: row.productViews, cart_adds: row.cartAdds, checkout_starts: row.checkouts, pages: row.pages.slice(0, 30),
      })),
    },
  };
}

async function applyOrderInventory(supabase: ReturnType<typeof getSupabaseAdmin>, orderId: string) {
  const { error } = await supabase.rpc("apply_order_stock", { p_order_id: orderId });
  if (error) {
    throw new Error(`Stok düşürülemedi: ${error.message}. RUTH-TUM-SISTEM-FIX.sql dosyasını Supabase'te çalıştır.`);
  }
}

async function synchronizePaidOrderSideEffects({
  supabase,
  draft,
  orderId,
  callbackPayload,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  draft: CheckoutDraftRow;
  orderId: string;
  callbackPayload: Record<string, string>;
}) {
  // PayTR callback tekrar gelebilir. Her adım yeniden çalıştırılabilir/idempotent tutulur.
  await applyOrderInventory(supabase, orderId);

  const appliedDiscounts = Array.isArray(draft.applied_discounts) ? draft.applied_discounts : [];
  const usedReviewCoupon = appliedDiscounts.some(
    (item) => item.source === "review" && item.code === draft.coupon_code,
  );

  if (draft.coupon_code && usedReviewCoupon) {
    const { error: reviewCouponError } = await supabase
      .from("review_reward_coupons")
      .update({
        status: "used",
        used_count: 1,
        used_order_id: orderId,
        used_at: new Date().toISOString(),
      })
      .eq("code", String(draft.coupon_code));

    if (reviewCouponError) {
      throw new Error(`Yorum kuponu kullanımı kaydedilemedi: ${reviewCouponError.message}`);
    }
  }

  await recordDiscountRedemptions({
    applied: appliedDiscounts,
    orderId,
    orderNo: draft.order_no,
    profileId: draft.profile_id,
    customerEmail: draft.customer?.email || null,
  });

  if (draft.profile_id) {
    const pointsUsed = Math.max(
      0,
      Math.floor(Number(draft.reward_points_used || Number(draft.reward_discount_total || 0) * RUTH_POINTS_PER_TL)),
    );
    if (pointsUsed > 0) {
      const { error: spentPointsError } = await supabase.rpc("adjust_rosta_points", {
        p_profile_id: draft.profile_id,
        p_amount: -pointsUsed,
        p_reason: `${draft.order_no} siparişinde kullanılan ROSTA Points`,
        p_transaction_type: "order_spent",
        p_reference_type: "order",
        p_reference_id: orderId,
        p_admin_profile_id: null,
      });
      if (spentPointsError) {
        throw new Error(`${spentPointsError.message}.`);
      }
    }

    const pointsEarned = Math.max(0, Math.floor(Number(draft.total_amount || 0)));
    if (pointsEarned > 0) {
      const { error: earnedPointsError } = await supabase.rpc("adjust_rosta_points", {
        p_profile_id: draft.profile_id,
        p_amount: pointsEarned,
        p_reason: `${draft.order_no} siparişinden kazanılan ROSTA Points`,
        p_transaction_type: "order_earned",
        p_reference_type: "order",
        p_reference_id: orderId,
        p_admin_profile_id: null,
      });
      if (earnedPointsError) {
        throw new Error(`${earnedPointsError.message}.`);
      }
    }
  }

  const callbackChargedAmount = Number(callbackPayload.total_amount || 0) / 100;
  const chargedAmount = Number.isFinite(callbackChargedAmount) && callbackChargedAmount > 0
    ? Number(callbackChargedAmount.toFixed(2))
    : Number(draft.total_amount || 0);

  const paymentPayload = {
    order_id: orderId,
    provider: "paytr",
    merchant_oid: draft.merchant_oid,
    amount: chargedAmount,
    currency: draft.currency || "TRY",
    status: "paid",
    paytr_token: draft.paytr_token || null,
    paytr_response: draft.paytr_request || null,
    callback_payload: callbackPayload,
    paid_at: new Date().toISOString(),
  };

  const { data: existingPayments, error: paymentLookupError } = await supabase
    .from("payments")
    .select("id")
    .eq("merchant_oid", draft.merchant_oid)
    .limit(1);

  if (paymentLookupError) {
    throw new Error(`Ödeme kaydı kontrol edilemedi: ${paymentLookupError.message}`);
  }

  const existingPaymentId = existingPayments?.[0]?.id ? String(existingPayments[0].id) : null;
  const paymentResult = existingPaymentId
    ? await supabase.from("payments").update(paymentPayload).eq("id", existingPaymentId)
    : await supabase.from("payments").insert(paymentPayload);

  if (paymentResult.error) {
    throw new Error(`Ödeme kaydı oluşturulamadı: ${paymentResult.error.message}`);
  }

  const { error: draftUpdateError } = await supabase
    .from("checkout_drafts")
    .update({
      status: "paid",
      order_id: orderId,
      callback_payload: callbackPayload,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", draft.id);

  if (draftUpdateError) {
    throw new Error(`Ödeme taslağı kapatılamadı: ${draftUpdateError.message}`);
  }
}

export async function createPaidOrderFromCheckoutDraft({
  merchantOid,
  callbackPayload,
}: {
  merchantOid: string;
  callbackPayload: Record<string, string>;
}) {
  const supabase = getSupabaseAdmin();

  const { data: rawDraft, error: draftError } = await supabase
    .from("checkout_drafts")
    .select("*")
    .eq("merchant_oid", merchantOid)
    .maybeSingle();

  if (draftError) throw new Error(`Ödeme taslağı alınamadı: ${draftError.message}`);
  if (!rawDraft) return null;

  const draft = rawDraft as CheckoutDraftRow;

  const { data: existingOrder, error: existingOrderError } = await supabase
    .from("orders")
    .select("id, order_no, payment_status")
    .eq("order_no", draft.order_no)
    .maybeSingle();

  if (existingOrderError) {
    throw new Error(`Mevcut sipariş kontrol edilemedi: ${existingOrderError.message}`);
  }

  if (existingOrder?.id) {
    const orderId = String(existingOrder.id);
    const wasAlreadyPaid = String(existingOrder.payment_status || "") === "paid";

    if (!wasAlreadyPaid) {
      const { error: orderPaymentError } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          subtotal: Number(draft.subtotal || 0),
          shipping_fee: Number(draft.shipping_fee || 0),
          discount_total: Number(draft.discount_total || 0),
          automatic_discount_total: Number(draft.automatic_discount_total || 0),
          reward_discount_total: Number(draft.reward_discount_total || 0),
          reward_points_used: Math.max(0, Math.floor(Number(draft.reward_points_used || 0))),
          coupon_code: draft.coupon_code || null,
          coupon_discount_total: Number(draft.coupon_discount_total || 0),
          applied_discounts: draft.applied_discounts || [],
          total_amount: Number(draft.total_amount || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (orderPaymentError) throw new Error(`Manuel sipariş ödeme durumu güncellenemedi: ${orderPaymentError.message}`);
    }

    await synchronizePaidOrderSideEffects({ supabase, draft, orderId, callbackPayload });
    return {
      orderId,
      orderNo: String(existingOrder.order_no),
      alreadyPaid: wasAlreadyPaid,
      totalAmount: Number(draft.total_amount || 0),
      currency: draft.currency || "TRY",
      customerEmail: draft.customer?.email || "",
      customerPhone: draft.customer?.phone || "",
      attribution: draft.attribution || null,
      itemIds: (draft.items || []).map((item) => item.productSlug || item.productId).filter(Boolean),
      itemCount: (draft.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    };
  }

  // Taslak paid görünse bile sipariş kaydı yoksa callback'i yeniden işleyip kaydı tamamla.
  const customer = draft.customer;
  const items = Array.isArray(draft.items) ? draft.items : [];
  if (!items.length) throw new Error("Ödeme taslağında sipariş ürünü bulunamadı.");

  const addressId = await saveCustomerAddress(supabase, draft.profile_id, customer);
  const orderAttribution = await buildOrderAttribution(supabase, draft);

  const baseOrderPayload = {
    order_no: draft.order_no,
    profile_id: draft.profile_id,
    customer_name: customer.fullName,
    customer_email: customer.email,
    customer_phone: customer.phone,
    shipping_address_id: addressId,
    shipping_address_text: [customer.addressLine, `${customer.district}/${customer.city}`].filter(Boolean).join(", "),
    shipping_city: customer.city,
    shipping_town: customer.district,
    shipping_neighborhood: customer.neighborhood || null,
    shipping_address_line: customer.addressLine,
    shipping_postal_code: customer.postalCode || null,
    subtotal: Number(draft.subtotal || 0),
    shipping_fee: Number(draft.shipping_fee || 0),
    discount_total: Number(draft.discount_total || 0),
    automatic_discount_total: Number(draft.automatic_discount_total || 0),
    reward_discount_total: Number(draft.reward_discount_total || 0),
    reward_points_used: Math.max(0, Math.floor(Number(draft.reward_points_used || 0))),
    coupon_code: draft.coupon_code || null,
    coupon_discount_total: Number(draft.coupon_discount_total || 0),
    applied_discounts: draft.applied_discounts || [],
    total_amount: Number(draft.total_amount || 0),
    currency: draft.currency || "TRY",
    payment_status: "paid",
    customer_note: customer.note || null,
    ...orderAttribution,
  };

  // Eski ve yeni orders_status_check sürümleriyle geriye uyumlu kayıt.
  let order: { id: string } | null = null;
  let orderError: any = null;
  for (const candidate of ["paid", "created", null] as const) {
    const payload = candidate ? { ...baseOrderPayload, status: candidate } : baseOrderPayload;
    const result = await supabase.from("orders").insert(payload).select("id").single();
    if (!result.error && result.data) {
      order = result.data;
      orderError = null;
      break;
    }
    orderError = result.error;
    const isStatusConstraint = result.error?.code === "23514" || String(result.error?.message || "").includes("orders_status_check");
    if (!isStatusConstraint) break;
  }

  if (orderError) throw new Error(`Sipariş kaydedilemedi: ${orderError.message}`);
  if (!order) throw new Error("Sipariş kaydedilemedi: Supabase sipariş kaydı dönmedi.");

  const orderId = String(order.id);
  const orderItems = items.map((item) => ({
    order_id: orderId,
    product_id: item.productId,
    variant_id: item.variantId,
    product_slug: item.productSlug,
    product_name: item.productName,
    variant_name: item.variantName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.totalPrice,
    image_url: item.imageUrl,
  }));

  const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
  if (itemsError) {
    await supabase.from("order_items").delete().eq("order_id", orderId);
    await supabase.from("orders").delete().eq("id", orderId);
    throw new Error(`Sipariş ürünleri kaydedilemedi: ${itemsError.message}`);
  }

  try {
    await synchronizePaidOrderSideEffects({ supabase, draft, orderId, callbackPayload });
  } catch (error) {
    // Stok hiç düşmediyse yarım siparişi temizlemek güvenlidir. Stok düştükten sonraki
    // ödeme/kupon adımları hata verirse siparişi koruruz; PayTR callback tekrarı tamamlar.
    const { data: stockMovement } = await supabase
      .from("inventory_movements")
      .select("id")
      .eq("order_id", orderId)
      .limit(1);
    if (!stockMovement?.length) {
      await supabase.from("order_items").delete().eq("order_id", orderId);
      await supabase.from("orders").delete().eq("id", orderId);
    }
    throw error;
  }

  return {
    orderId,
    orderNo: draft.order_no,
    alreadyPaid: false,
    totalAmount: Number(draft.total_amount || 0),
    currency: draft.currency || "TRY",
    customerEmail: customer.email || "",
    customerPhone: customer.phone || "",
    attribution: draft.attribution || null,
    itemIds: items.map((item) => item.productSlug || item.productId).filter(Boolean),
    itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  };
}

export async function markCheckoutDraftFailed({
  merchantOid,
  callbackPayload,
}: {
  merchantOid: string;
  callbackPayload: Record<string, string>;
}) {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("checkout_drafts")
    .update({
      status: "failed",
      callback_payload: callbackPayload,
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("merchant_oid", merchantOid);
}

// Eski route bozulmasın diye alias bırakıldı.
// Bu artık gerçek sipariş oluşturmaz; sadece ödeme taslağı oluşturur.
export const createOrderDraft = createCheckoutDraft;
