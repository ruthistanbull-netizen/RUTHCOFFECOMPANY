"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, CreditCard, RefreshCw, Shield, ShoppingBag, Truck } from "lucide-react";
import { LoadingIndicator, Skeleton } from "@ruth-commerce/ui";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PaytrIframePayment } from "@/components/checkout/PaytrIframePayment";
import { useCart } from "@/components/cart/CartProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { getRuthAttribution, trackRuthEvent } from "@/components/analytics/SiteAnalytics";
import { formatPrice } from "@/lib/formatPrice";
import {
  makeRuthieOrderRewardKey,
  pointsForOrderTotal,
  pointsToLira,
  savePendingRuthieOrderReward,
} from "@/lib/rewards";
import { useRostaPointsSettings } from "@/lib/useRostaPointsSettings";

type CheckoutForm = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string;
  note: string;
};

type PricingQuote = {
  subtotal: number;
  baseShippingFee: number;
  shippingFee: number;
  automaticDiscountTotal: number;
  rewardDiscountTotal: number;
  rewardPointsAvailable: number;
  rewardPointsUsed: number;
  couponDiscountTotal: number;
  discountTotal: number;
  totalAmount: number;
  couponCode: string | null;
  freeShipping: boolean;
};

type AccountDiscount = {
  code: string;
  title: string;
  discountPercent: number;
  expiresAt?: string | null;
};

type PaymentState = {
  iframeUrl: string;
  orderNo: string;
  merchantOid: string;
  testMode: boolean;
  fingerprint: string;
};

type LoadedCheckoutDraft = {
  orderNo?: string | null;
};

const initialForm: CheckoutForm = {
  fullName: "",
  email: "",
  phone: "",
  city: "",
  district: "",
  addressLine: "",
  postalCode: "",
  note: "",
};

const CHECKOUT_DRAFT_TOKEN_KEY = "ruth-checkout-draft-token";
const inputClass = "mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark";

function makeLocalDraftToken() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function hasRecoverableCheckoutContact(customer: CheckoutForm) {
  const email = customer.email.trim().toLocaleLowerCase("tr-TR");
  const phoneDigits = customer.phone.replace(/\D/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phoneDigits.length >= 10;
}

function RequiredMark() {
  return <span className="required-star" aria-hidden="true">*</span>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth">
      {label} {required ? <RequiredMark /> : null}
      {children}
    </label>
  );
}

export function PaytrIframeCheckoutClient() {
  const { items, subtotal, isReady, replaceCartItems } = useCart();
  const { user, session } = useAuth();
  const rewardSettings = useRostaPointsSettings();
  const searchParams = useSearchParams();
  const externalDraftToken = searchParams.get("draft") || "";
  const openPaymentDirectly = searchParams.get("payment") === "1";

  const [form, setForm] = useState<CheckoutForm>(initialForm);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(openPaymentDirectly ? 2 : 1);
  const [checkoutDraftToken, setCheckoutDraftToken] = useState("");
  const [loadedCheckoutDraft, setLoadedCheckoutDraft] = useState<LoadedCheckoutDraft | null>(null);
  const [pricingQuote, setPricingQuote] = useState<PricingQuote | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);

  const [availableRuthiePoints, setAvailableRuthiePoints] = useState(0);
  const [requestedRuthiePoints, setRequestedRuthiePoints] = useState(0);
  const [isRuthiePointsOpen, setIsRuthiePointsOpen] = useState(false);

  const [availableDiscounts, setAvailableDiscounts] = useState<AccountDiscount[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; title?: string; discountPercent?: number } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteFeedbackOwner, setQuoteFeedbackOwner] = useState<string | null>(null);

  const [isLoadingDraft, setIsLoadingDraft] = useState(Boolean(externalDraftToken));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkoutStepsRef = useRef<HTMLDivElement | null>(null);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);

  const selectedRuthiePoints = user
    ? Math.min(availableRuthiePoints, Math.max(0, Math.floor(requestedRuthiePoints)))
    : 0;
  const localRuthieDiscount = Math.min(subtotal, pointsToLira(selectedRuthiePoints));
  const quoteSubtotal = Number(pricingQuote?.subtotal ?? subtotal);
  const baseShippingFee = Number(pricingQuote?.baseShippingFee || 0);
  const shippingFee = Number(pricingQuote?.shippingFee || 0);
  const automaticDiscount = Number(pricingQuote?.automaticDiscountTotal || 0);
  const ruthieDiscount = Number(pricingQuote?.rewardDiscountTotal ?? localRuthieDiscount);
  const couponDiscount = Number(pricingQuote?.couponDiscountTotal || 0);
  const totalDiscount = Number(pricingQuote?.discountTotal ?? (automaticDiscount + ruthieDiscount + couponDiscount));
  const checkoutTotal = Number(pricingQuote?.totalAmount ?? Math.max(0, subtotal - localRuthieDiscount));
  const normalCheckoutTotal = Number((quoteSubtotal + baseShippingFee).toFixed(2));

  const ruthiePointOptions = Array.from(
    { length: Math.max(0, Math.floor(availableRuthiePoints / 500)) },
    (_, index) => (index + 1) * 500,
  );

  const paymentFingerprint = useMemo(
    () => JSON.stringify({
      items: items.map((item) => ({ key: item.key, quantity: item.quantity })),
      form,
      coupon: appliedCoupon?.code || null,
      points: selectedRuthiePoints,
      total: checkoutTotal,
    }),
    [appliedCoupon?.code, checkoutTotal, form, items, selectedRuthiePoints],
  );

  const checkoutSteps = [
    { id: 1 as const, title: "Bilgiler", helper: "İletişim & Adres" },
    { id: 2 as const, title: "Sipariş", helper: "Kontrol" },
    { id: 3 as const, title: "Ödeme", helper: "PayTR" },
  ];

  useEffect(() => {
    const token = externalDraftToken || window.localStorage.getItem(CHECKOUT_DRAFT_TOKEN_KEY) || makeLocalDraftToken();
    window.localStorage.setItem(CHECKOUT_DRAFT_TOKEN_KEY, token);
    setCheckoutDraftToken(token);
  }, [externalDraftToken]);

  useEffect(() => {
    if (!user) return;
    setForm((current) => ({
      ...current,
      fullName: current.fullName || String(user.user_metadata?.full_name || ""),
      email: current.email || user.email || "",
      phone: current.phone || String(user.user_metadata?.phone || ""),
    }));
  }, [user]);

  useEffect(() => {
    if (!session?.access_token) {
      setAvailableRuthiePoints(0);
      setAvailableDiscounts([]);
      return;
    }

    fetch("/api/rewards/balance", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data) => {
        if (data?.ok) setAvailableRuthiePoints(Math.max(0, Math.floor(Number(data.points || 0))));
      })
      .catch(() => undefined);

    fetch("/api/account/addresses", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data) => {
        const address = data?.ok ? data.addresses?.[0] : null;
        if (!address) return;
        setForm((current) => current.addressLine ? current : ({
          ...current,
          fullName: current.fullName || address.full_name || "",
          email: current.email || address.email || "",
          phone: current.phone || address.phone || "",
          city: address.city || "",
          district: address.district || "",
          addressLine: address.address_line || "",
          postalCode: address.postal_code || "",
        }));
      })
      .catch(() => undefined);

    setCouponLoading(true);
    fetch("/api/review-coupons/list", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data) => {
        if (!data?.ok) return;
        const discounts = (data.discounts || []) as AccountDiscount[];
        setAvailableDiscounts(discounts);
        const savedCode = window.localStorage.getItem("ruth-selected-discount-code");
        const savedDiscount = discounts.find((discount) => discount.code === savedCode);
        if (savedDiscount) {
          setAppliedCoupon({
            code: savedDiscount.code,
            title: savedDiscount.title,
            discountPercent: Number(savedDiscount.discountPercent || 10),
          });
          setCouponInput(savedDiscount.code);
          window.localStorage.removeItem("ruth-selected-discount-code");
        }
      })
      .catch(() => undefined)
      .finally(() => setCouponLoading(false));
  }, [session?.access_token]);

  useEffect(() => {
    if (!isReady || !externalDraftToken) {
      setIsLoadingDraft(false);
      return;
    }

    fetch(`/api/checkout-draft?draft=${encodeURIComponent(externalDraftToken)}`, { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!response.ok || !data.ok) throw new Error(data.error || "Sepet bağlantısı açılamadı.");
        const customer = data.customer || {};
        setForm((current) => ({
          ...current,
          fullName: customer.fullName || current.fullName,
          email: customer.email || current.email,
          phone: customer.phone || current.phone,
          city: customer.city || current.city,
          district: customer.district || current.district,
          addressLine: customer.addressLine || current.addressLine,
          postalCode: customer.postalCode || current.postalCode,
          note: customer.note || current.note,
        }));
        replaceCartItems(data.items || []);
        setLoadedCheckoutDraft(data.draft || null);
        setDraftNotice(
          openPaymentDirectly
            ? "Sipariş bilgilerin hazır. Siparişini kontrol edip güvenli ödeme ekranına geçebilirsin."
            : "Sepetin geri yüklendi. Ödemeye kaldığın yerden devam edebilirsin.",
        );
        if (openPaymentDirectly) setCheckoutStep(2);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Sepet bağlantısı açılamadı."))
      .finally(() => setIsLoadingDraft(false));
  }, [externalDraftToken, isReady, openPaymentDirectly, replaceCartItems]);

  useEffect(() => {
    if (!payment || payment.fingerprint === paymentFingerprint) return;
    setPayment(null);
    if (checkoutStep === 3) setCheckoutStep(2);
  }, [checkoutStep, payment, paymentFingerprint]);

  useEffect(() => {
    if (!isReady || !items.length) {
      setPricingQuote(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void requestPricingQuote(appliedCoupon?.code || null, false);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, items, appliedCoupon?.code, selectedRuthiePoints, session?.access_token, form.email]);

  const updateField = (field: keyof CheckoutForm, value: string) => {
    setPayment(null);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const scrollCheckoutTop = () => {
    window.setTimeout(() => {
      checkoutStepsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const validateCheckoutDetails = () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim()) {
      setError("Devam etmek için ad soyad, telefon ve e-posta bilgilerini doldur.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Geçerli bir e-posta adresi gir.");
      return false;
    }
    if (!form.city.trim() || !form.district.trim() || !form.addressLine.trim()) {
      setError("Devam etmek için il, ilçe ve açık adres bilgilerini doldur.");
      return false;
    }
    return true;
  };

  const goToCheckoutStep = (step: 1 | 2 | 3) => {
    if (step === 2 && !validateCheckoutDetails()) return;
    if (step === 3 && !payment) return;
    setCheckoutStep(step);
    setError(null);
    scrollCheckoutTop();
  };

  async function saveRecoverableCheckoutDraft(source: string) {
    if (openPaymentDirectly || !checkoutDraftToken || !items.length || !hasRecoverableCheckoutContact(form)) return;
    try {
      const response = await fetch("/api/checkout-draft/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          resumeToken: checkoutDraftToken,
          customer: form,
          items,
          source,
          attribution: getRuthAttribution(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok && data.resumeToken) {
        window.localStorage.setItem(CHECKOUT_DRAFT_TOKEN_KEY, data.resumeToken);
        setCheckoutDraftToken(data.resumeToken);
      }
    } catch {
      // Taslak kaydı ödeme akışını engellemez.
    }
  }

  async function continueToOrderReview() {
    setError(null);
    if (!validateCheckoutDetails()) return;
    await saveRecoverableCheckoutDraft("checkout_details_completed");
    setCheckoutStep(2);
    scrollCheckoutTop();
  }

  async function requestPricingQuote(code: string | null, showMessage: boolean, feedbackOwner: string | null = null) {
    if (!items.length) return null;
    setQuoteLoading(true);
    setQuoteFeedbackOwner(feedbackOwner);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const response = await fetch("/api/discounts/quote", {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({
          items: items.map((item) => ({ key: item.key, id: item.id, slug: item.slug, quantity: item.quantity })),
          couponCode: code || null,
          customerEmail: form.email || user?.email || null,
          rewards: {
            useRuthPoints: selectedRuthiePoints > 0,
            requestedDiscount: localRuthieDiscount,
            pointsUsed: selectedRuthiePoints,
          },
          draftToken: openPaymentDirectly ? externalDraftToken : null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "İndirim hesaplanamadı.");
      setPricingQuote(data.quote as PricingQuote);
      if (Number.isFinite(Number(data.quote?.rewardPointsAvailable))) {
        setAvailableRuthiePoints(Math.max(0, Math.floor(Number(data.quote.rewardPointsAvailable))));
      }
      if (showMessage) setCouponMessage(null);
      return data.quote as PricingQuote;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "İndirim hesaplanamadı.";
      if (showMessage) setCouponMessage(message);
      else if (code) {
        setAppliedCoupon(null);
        setCouponMessage(message);
      }
      return null;
    } finally {
      setQuoteLoading(false);
      setQuoteFeedbackOwner(null);
    }
  }

  const selectRuthiePointAmount = (amount: number) => {
    setPayment(null);
    setRequestedRuthiePoints(Math.min(availableRuthiePoints, Math.max(0, Math.floor(amount))));
  };

  const applyCouponCode = async () => {
    const code = couponInput.trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
    if (!code) {
      setCouponMessage("Kupon kodunu yaz.");
      return;
    }
    const quote = await requestPricingQuote(code, true, "coupon-input");
    if (!quote) return;
    setAppliedCoupon({ code, title: "Kupon kodu" });
    setPayment(null);
  };

  const selectAccountDiscount = async (discount: AccountDiscount) => {
    const quote = await requestPricingQuote(discount.code, true, `discount:${discount.code}`);
    if (!quote) return;
    setAppliedCoupon({
      code: discount.code,
      title: discount.title,
      discountPercent: Number(discount.discountPercent || 10),
    });
    setCouponInput(discount.code);
    setPayment(null);
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponMessage(null);
    setPayment(null);
  };

  async function startPayment(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (isSubmitting) return;

    if (!validateCheckoutDetails()) {
      setCheckoutStep(1);
      scrollCheckoutTop();
      return;
    }

    if (payment && payment.fingerprint === paymentFingerprint) {
      setCheckoutStep(3);
      window.setTimeout(() => paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await saveRecoverableCheckoutDraft("payment_start");
      trackRuthEvent("payment_start", {
        item_count: items.length,
        subtotal,
        discount_total: totalDiscount,
        total_amount: checkoutTotal,
        reward_points_used: selectedRuthiePoints,
        coupon_code: appliedCoupon?.code || null,
        payment_flow: "iframe_v2",
      });

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const response = await fetch("/api/paytr/create-payment", {
        method: "POST",
        headers,
        cache: "no-store",
        body: JSON.stringify({
          customer: form,
          draftToken: openPaymentDirectly ? externalDraftToken : checkoutDraftToken,
          items: items.map((item) => ({ key: item.key, id: item.id, slug: item.slug, quantity: item.quantity })),
          rewards: {
            useRuthPoints: selectedRuthiePoints > 0,
            requestedDiscount: ruthieDiscount,
            pointsUsed: selectedRuthiePoints,
          },
          coupon: appliedCoupon ? { code: appliedCoupon.code } : null,
          attribution: getRuthAttribution(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.iframeUrl) {
        throw new Error(data.error || "PayTR güvenli ödeme ekranı hazırlanamadı.");
      }

      if (data.resumeToken) {
        window.localStorage.setItem(CHECKOUT_DRAFT_TOKEN_KEY, data.resumeToken);
        setCheckoutDraftToken(data.resumeToken);
      }

      if (user) {
        savePendingRuthieOrderReward({
          orderKey: makeRuthieOrderRewardKey(data.orderNo || checkoutDraftToken),
          orderNo: data.orderNo || null,
          totalAmount: checkoutTotal,
          pointsToEarn: pointsForOrderTotal(checkoutTotal),
          pointsUsed: selectedRuthiePoints,
        });
      }

      setPayment({
        iframeUrl: data.iframeUrl,
        orderNo: data.orderNo,
        merchantOid: data.merchantOid,
        testMode: Boolean(data.testMode),
        fingerprint: paymentFingerprint,
      });
      setCheckoutStep(3);
      window.setTimeout(() => paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (caught) {
      setCheckoutStep(2);
      setError(caught instanceof Error ? caught.message : "Ödeme başlatılamadı.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const rewardsAndCoupons = (
    <div className="space-y-4">
      <div className="rounded-xl border border-gold/15 bg-white text-sm">
        {user ? (
          <>
            <button
              type="button"
              onClick={() => setIsRuthiePointsOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-cream/70"
              aria-expanded={isRuthiePointsOpen}
            >
              <span>
                <span className="block font-heading text-sm text-ink">ROSTA Points Kullan</span>
                <span className="mt-1 block text-xs leading-5 text-muted-ruth">
                  Hesabında {availableRuthiePoints.toLocaleString("tr-TR")} ROSTA Points var.
                </span>
                {selectedRuthiePoints > 0 ? (
                  <span className="mt-1 block text-xs font-medium text-gold-dark">
                    Seçilen: {selectedRuthiePoints.toLocaleString("tr-TR")} Points · -{formatPrice(ruthieDiscount, "TRY")}
                  </span>
                ) : null}
              </span>
              <ChevronDown
                size={18}
                className={`shrink-0 text-gold-dark transition-transform duration-300 ${isRuthiePointsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isRuthiePointsOpen ? (
              <div className="border-t border-gold/10 px-4 pb-4 pt-3">
                {availableRuthiePoints > 0 ? (
                  <div>
                    <p className="text-xs leading-5 text-muted-ruth">
                      Kullanmak istediğin puanı seç. Hepsini kullan dediğinde hesabındaki kullanılabilir puanın tamamı uygulanır.
                    </p>
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        onClick={() => selectRuthiePointAmount(0)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs transition ${selectedRuthiePoints === 0 ? "border-gold-dark bg-cream text-ink" : "border-gold/15 bg-white text-ink hover:border-gold-dark"}`}
                      >
                        <span>Puan kullanma</span><span>0 TL</span>
                      </button>
                      {ruthiePointOptions.map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => selectRuthiePointAmount(amount)}
                          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs transition ${selectedRuthiePoints === amount ? "border-gold-dark bg-ink text-cream" : "border-gold/15 bg-white text-ink hover:border-gold-dark"}`}
                        >
                          <span>{amount.toLocaleString("tr-TR")} Points</span>
                          <span>-{formatPrice(pointsToLira(amount), "TRY")}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => selectRuthiePointAmount(availableRuthiePoints)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-medium uppercase tracking-wide-luxe transition ${selectedRuthiePoints === availableRuthiePoints ? "border-gold-dark bg-ink text-cream" : "border-gold/15 bg-white text-ink hover:border-gold-dark"}`}
                      >
                        <span>Hepsini Kullan</span>
                        <span>{availableRuthiePoints.toLocaleString("tr-TR")} Points</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-gold/10 bg-cream/70 px-3 py-2 text-xs leading-5 text-muted-ruth">
                    Kullanılabilir ROSTA Points bulunmuyor. Alışveriş tamamladıkça puanın burada görünecek.
                  </p>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="px-4 py-4 text-sm">
            <p className="font-heading text-ink">ROSTA Points</p>
            <p className="mt-1 text-xs leading-5 text-muted-ruth">
              Üye ol, {rewardSettings.signupPoints.toLocaleString("tr-TR")} ROSTA Points kazan ve ödeme adımında {formatPrice(pointsToLira(rewardSettings.signupPoints), "TRY")} indirim kullan.
            </p>
            <Link href="/login?redirect=/checkout" className="mt-3 inline-block text-xs uppercase tracking-wide-luxe text-gold-dark underline underline-offset-4">
              Giriş Yap / Üye Ol
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gold/10 bg-white p-4 text-sm">
        <p className="font-heading text-ink">İndirim Kullan</p>
        <p className="mt-1 text-xs leading-5 text-muted-ruth">Kupon kodunu veya hesabındaki yorum indirimini kullan.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={couponInput}
            onChange={(event) => setCouponInput(event.target.value.toLocaleUpperCase("tr-TR").replace(/\s+/g, ""))}
            placeholder="KUPON KODU"
            className="min-w-0 flex-1 rounded-lg border border-gold/15 bg-ivory px-3 py-2.5 text-sm uppercase outline-none transition focus:border-gold-dark"
          />
          <button
            type="button"
            onClick={() => void applyCouponCode()}
            disabled={quoteLoading}
            aria-busy={quoteLoading && quoteFeedbackOwner === "coupon-input" || undefined}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gold-dark bg-ink px-4 py-2 text-xs uppercase tracking-wide-luxe text-cream disabled:opacity-50"
          >
            {quoteLoading && quoteFeedbackOwner === "coupon-input" ? <><LoadingIndicator size="sm" label="Kupon uygulanıyor" /> Uygulanıyor</> : "Uygula"}
          </button>
        </div>
        {appliedCoupon ? (
          <button type="button" onClick={clearCoupon} className="mt-2 text-xs text-gold-dark underline underline-offset-4">
            {appliedCoupon.code} kodunu kaldır
          </button>
        ) : null}
        {user ? (
          <div className="mt-3 space-y-2">
            {couponLoading ? (
              <Skeleton className="h-12 rounded-lg" />
            ) : availableDiscounts.length ? (
              availableDiscounts.map((discount) => {
                const selected = appliedCoupon?.code === discount.code;
                const feedbackOwner = `discount:${discount.code}`;
                const applying = quoteLoading && quoteFeedbackOwner === feedbackOwner;
                return (
                  <button
                    key={discount.code}
                    type="button"
                    disabled={quoteLoading}
                    aria-busy={applying || undefined}
                    onClick={() => selected ? clearCoupon() : void selectAccountDiscount(discount)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition disabled:opacity-50 ${selected ? "border-gold-dark bg-ink text-cream" : "border-gold/15 bg-cream text-ink hover:border-gold-dark"}`}
                  >
                    <span className="flex items-center gap-2 font-heading text-sm">{applying ? <LoadingIndicator size="sm" label={`${discount.title || "İndirim"} uygulanıyor`} /> : null}{discount.title || "Yorum indirimi"}</span>
                    <span className={`mt-1 block text-xs ${selected ? "text-cream/75" : "text-muted-ruth"}`}>
                      %{discount.discountPercent} indirim · Ödemede kullan
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="rounded-lg border border-gold/10 bg-cream px-3 py-3 text-xs leading-5 text-muted-ruth">
                Hesabında kullanılabilir indirim yok.
              </p>
            )}
          </div>
        ) : (
          <Link href="/login?redirect=/checkout" className="mt-3 inline-block text-xs uppercase tracking-wide-luxe text-gold-dark underline underline-offset-4">
            İndirimlerini görmek için giriş yap
          </Link>
        )}
        {couponMessage ? <p className="mt-2 text-xs leading-5 text-muted-ruth">{couponMessage}</p> : null}
      </div>
    </div>
  );

  if (!isReady || isLoadingDraft) {
    return (
      <div className="min-h-screen bg-ivory px-4 pb-24 pt-32" role="status" aria-busy="true" aria-label="Ödeme bilgileri yükleniyor">
        <div className="mx-auto max-w-4xl">
          <Skeleton className="h-8 w-44 rounded" />
          <Skeleton className="mt-5 h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory px-4 pt-20 text-center">
        <div>
          <ShoppingBag className="mx-auto mb-5 text-gold-dark" size={32} />
          <h1 className="font-heading text-3xl">{error ? "Ödeme bağlantısı açılamadı" : "Sepetin boş"}</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-ruth">
            {error || "Ödeme adımına geçmek için önce sepetine bir parça ekle."}
          </p>
          <Link href="/products" className="mt-7 inline-block bg-ink px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream">
            Ürünleri Keşfet
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-ivory px-4 pb-24 pt-24 md:px-8 md:pt-32">
      <div className="mx-auto w-full max-w-7xl min-w-0">
        <div className="mb-6 text-center md:mb-10">
          <p className="mb-3 text-xs uppercase tracking-wide-luxe text-gold-dark">Ödeme</p>
          <h1 className="font-heading text-4xl md:text-5xl">
            {checkoutStep === 1 ? "Teslimat Bilgileri" : checkoutStep === 2 ? "Siparişini Kontrol Et" : "Güvenli Ödeme"}
          </h1>
          <p className="mx-auto mt-3 hidden max-w-xl text-sm leading-7 text-muted-ruth md:block">
            {checkoutStep === 1
              ? "İletişim ve teslimat bilgilerini tek adımda tamamla."
              : checkoutStep === 2
                ? "Ürünlerini kontrol et, ROSTA Points ve indirimlerini seç; ardından ödeme ekranına geç."
                : "Kart ve taksit seçeneklerini PayTR güvenli ödeme ekranında tamamla."}
          </p>
        </div>

        <div ref={checkoutStepsRef} className="mb-6 scroll-mt-24 rounded-2xl border border-gold/15 bg-cream p-3 shadow-sm md:scroll-mt-32">
          <div className="grid grid-cols-3 gap-2">
            {checkoutSteps.map((step, index) => {
              const isActive = checkoutStep === step.id;
              const isDone = checkoutStep > step.id;
              const isLocked = step.id === 3 && !payment;
              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={isLocked}
                  onClick={() => goToCheckoutStep(step.id)}
                  className={`rounded-xl px-2 py-3 text-center transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    isActive
                      ? "bg-ink text-cream shadow-md"
                      : isDone
                        ? "bg-gold/15 text-ink"
                        : "bg-ivory text-muted-ruth"
                  }`}
                >
                  <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-current text-[11px] font-medium">
                    {index + 1}
                  </span>
                  <span className="block font-heading text-[0.72rem] uppercase tracking-[0.16em] sm:text-xs">{step.title}</span>
                  <span className="mt-1 hidden text-[10px] opacity-75 sm:block">{step.helper}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={startPayment}
          onBlurCapture={() => void saveRecoverableCheckoutDraft("checkout_field_blur")}
          className={checkoutStep === 2
            ? "grid w-full min-w-0 max-w-full gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:gap-6"
            : "w-full min-w-0 max-w-full"}
        >
          {checkoutStep === 1 ? (
            <section className="mx-auto w-full max-w-4xl space-y-6">
              <div className="rounded-xl border border-gold/15 bg-cream p-4 md:p-6">
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-wide-luxe text-gold-dark">İletişim Bilgileri</p>
                  <h2 className="mt-1 font-heading text-lg text-ink">Sana ulaşabileceğimiz bilgiler</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Ad Soyad" required>
                    <input required autoComplete="name" value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Telefon" required>
                    <input required type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} className={inputClass} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="E-posta" required>
                      <input required type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} className={inputClass} />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gold/15 bg-cream p-4 md:p-6">
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-wide-luxe text-gold-dark">Teslimat Adresi</p>
                  <h2 className="mt-1 font-heading text-lg text-ink">Siparişin nereye gelsin?</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="İl" required>
                    <input required autoComplete="address-level1" value={form.city} onChange={(event) => updateField("city", event.target.value)} className={inputClass} />
                  </Field>
                  <Field label="İlçe" required>
                    <input required autoComplete="address-level2" value={form.district} onChange={(event) => updateField("district", event.target.value)} className={inputClass} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Posta Kodu (isteğe bağlı)">
                      <input inputMode="numeric" autoComplete="postal-code" maxLength={10} value={form.postalCode} onChange={(event) => updateField("postalCode", event.target.value.replace(/[^0-9A-Za-z -]/g, ""))} className={inputClass} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Açık Adres" required>
                      <textarea required autoComplete="street-address" rows={4} value={form.addressLine} onChange={(event) => updateField("addressLine", event.target.value)} className={`${inputClass} resize-none`} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Sipariş Notu">
                      <textarea rows={3} value={form.note} onChange={(event) => updateField("note", event.target.value)} className={`${inputClass} resize-none`} />
                    </Field>
                  </div>
                </div>

                {error ? (
                  <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{error}</p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void continueToOrderReview()}
                  className="mt-6 w-full rounded-full bg-ink px-6 py-4 text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark sm:w-auto sm:min-w-56"
                >
                  Siparişi Kontrol Et
                </button>
              </div>
            </section>
          ) : null}

          {checkoutStep === 2 ? (
            <>
              <section className="min-w-0 space-y-5">
                <div className="overflow-hidden rounded-xl border border-gold/15 bg-white">
                  <div className="border-b border-gold/10 bg-ivory/70 px-4 py-3 md:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide-luxe text-gold-dark">Sipariş Önizlemesi</p>
                        <h2 className="mt-1 font-heading text-base text-ink">Aldığın Ürünler</h2>
                      </div>
                      {loadedCheckoutDraft?.orderNo ? (
                        <span className="rounded-full border border-gold/20 bg-cream px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-ruth">
                          {loadedCheckoutDraft.orderNo}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="divide-y divide-gold/10">
                    {items.map((item) => {
                      const variants = Array.from(new Set(
                        [item.finish, item.size]
                          .map((value) => String(value || "").trim())
                          .filter((value) => value && value.toLocaleLowerCase("tr-TR") !== "standart"),
                      ));
                      return (
                        <div
                          key={item.key}
                          className="grid min-w-0 grid-cols-[54px_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[60px_minmax(0,1fr)_auto] md:grid-cols-[68px_minmax(0,1fr)_auto] md:px-5"
                        >
                          <div className="h-16 overflow-hidden rounded-lg border border-gold/15 bg-ivory md:h-20">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full place-items-center font-heading text-lg text-gold-dark">R</div>
                            )}
                          </div>
                          <div className="min-w-0 self-center">
                            <h3 className="font-heading text-sm leading-5 text-ink">{item.name}</h3>
                            <p className="mt-0.5 text-[11px] leading-5 text-muted-ruth">{variants.length ? variants.join(" · ") : "Standart ürün"}</p>
                            <p className="mt-1 text-[11px] text-muted-ruth">Adet: {item.quantity}</p>
                          </div>
                          <strong className="col-span-2 self-center text-right text-sm text-ink sm:col-span-1 sm:whitespace-nowrap">
                            {formatPrice(Number(item.price || 0) * Number(item.quantity || 1), "TRY")}
                          </strong>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid gap-3 border-t border-gold/10 bg-ivory/55 px-4 py-3 md:grid-cols-2 md:px-5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide-luxe text-muted-ruth">Teslim Alacak Kişi</p>
                      <p className="mt-1.5 font-heading text-sm text-ink">{form.fullName || "—"}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-ruth">{form.phone || "—"}</p>
                      <p className="text-xs leading-5 text-muted-ruth">{form.email || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide-luxe text-muted-ruth">Teslimat Adresi</p>
                      <p className="mt-1.5 text-xs leading-5 text-ink">
                        {[form.addressLine, [form.district, form.city].filter(Boolean).join(" / ")].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {rewardsAndCoupons}

                <button
                  type="button"
                  onClick={() => goToCheckoutStep(1)}
                  className="rounded-full border border-gold/25 px-5 py-3 text-[11px] uppercase tracking-wide-luxe text-ink transition hover:border-gold-dark"
                >
                  Bilgileri Düzenle
                </button>
              </section>

              <aside className="w-full min-w-0 max-w-full xl:sticky xl:top-28 xl:self-start">
                <div className="rounded-xl border border-gold/15 bg-cream p-4 md:p-6">
                  <h2 className="font-heading text-lg">Ödeme Özeti</h2>
                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between text-muted-ruth">
                      <span>Ara toplam</span><span>{formatPrice(quoteSubtotal, "TRY")}</span>
                    </div>
                    <div className="flex justify-between text-muted-ruth">
                      <span>Kargo</span><span>{shippingFee > 0 ? formatPrice(shippingFee, "TRY") : "Ücretsiz"}</span>
                    </div>
                    {(automaticDiscount > 0 || ruthieDiscount > 0 || couponDiscount > 0) ? (
                      <div className="rounded-lg border border-gold/10 bg-ivory/75 p-3 text-sm">
                        <p className="mb-2 text-[10px] uppercase tracking-wide-luxe text-muted-ruth">Kullanılan indirim ve puanlar</p>
                        {automaticDiscount > 0 ? (
                          <div className="flex justify-between text-gold-dark">
                            <span>Otomatik ürün/kampanya indirimi</span><span>-{formatPrice(automaticDiscount, "TRY")}</span>
                          </div>
                        ) : null}
                        {ruthieDiscount > 0 ? (
                          <div className="flex justify-between text-gold-dark">
                            <span>{selectedRuthiePoints.toLocaleString("tr-TR")} ROSTA Points</span><span>-{formatPrice(ruthieDiscount, "TRY")}</span>
                          </div>
                        ) : null}
                        {couponDiscount > 0 ? (
                          <div className="mt-1 flex justify-between text-gold-dark">
                            <span>{appliedCoupon?.title || "Kupon indirimi"}</span><span>-{formatPrice(couponDiscount, "TRY")}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="border-t border-gold/15 pt-4">
                      {checkoutTotal < normalCheckoutTotal ? (
                        <>
                          <div className="flex items-center justify-between text-sm text-muted-ruth">
                            <span>Siparişin normal fiyatı</span>
                            <span className="line-through opacity-70">{formatPrice(normalCheckoutTotal, "TRY")}</span>
                          </div>
                          <div className="mt-2 flex items-end justify-between gap-4 font-heading">
                            <span className="text-base">İndirimli toplam</span>
                            <span className="text-2xl text-ink">{formatPrice(checkoutTotal, "TRY")}</span>
                          </div>
                          <p className="mt-2 text-right text-xs font-medium text-gold-dark">
                            Toplam {formatPrice(Math.max(0, normalCheckoutTotal - checkoutTotal), "TRY")} avantaj sağladın.
                          </p>
                        </>
                      ) : (
                        <div className="flex items-end justify-between gap-4 font-heading">
                          <span className="text-base">Toplam</span><span className="text-2xl text-ink">{formatPrice(checkoutTotal, "TRY")}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {draftNotice ? (
                    <p className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs leading-5 text-green-700">{draftNotice}</p>
                  ) : null}
                  {error ? (
                    <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{error}</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmitting || quoteLoading}
                    aria-busy={isSubmitting || undefined}
                    className="mt-5 flex w-full items-center justify-center gap-2 bg-ink px-5 py-3.5 text-center text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? <><LoadingIndicator size="sm" label="Ödeme hazırlanıyor" /> Ödeme hazırlanıyor...</> : <><CreditCard size={15} /> Ödeme Yap</>}
                  </button>

                  <div className="mt-10 grid grid-cols-3 gap-3 text-center">
                    {[
                      { icon: Truck, title: "Kargo", lines: ["2.000₺ Üzeri Ücretsiz Kargo"] },
                      { icon: Shield, title: "Güvenli", lines: ["PAYTR ile Güvenli Ödeme"] },
                      { icon: RefreshCw, title: "Değişim", lines: ["Destek ile hızlı süreç", "14 Gün içerisinde iade ve değişim"] },
                    ].map((item) => (
                      <div key={item.title} className="rounded-lg border border-gold/15 bg-cream px-2 py-4">
                        <item.icon className="mx-auto mb-2 text-gold-dark" size={18} />
                        <p className="text-[10px] uppercase tracking-wide-luxe text-muted-ruth">{item.title}</p>
                        <div className="mt-2 space-y-1">
                          {item.lines.map((line) => (
                            <p key={line} className="mx-auto max-w-[7.2rem] text-[10px] leading-4 text-muted-ruth">{line}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </>
          ) : null}

          {checkoutStep === 3 && payment ? (
            <section ref={paymentSectionRef} className="mx-auto w-full max-w-5xl scroll-mt-24">
              <PaytrIframePayment iframeUrl={payment.iframeUrl} orderNo={payment.orderNo} testMode={payment.testMode} />
            </section>
          ) : null}
        </form>
      </div>
    </div>
  );
}