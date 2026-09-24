"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, CreditCard, RefreshCw, Shield, ShoppingBag, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { useCart } from "@/components/cart/CartProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { getRuthAttribution, trackRuthEvent } from "@/components/analytics/SiteAnalytics";
import {
  ROSTA_POINTS_UPDATED_EVENT,
  ROSTA_WELCOME_POINTS,
  calculateRostaPoints,
  grantRostaWelcomePoints,
  pointsToLira,
  makeRostaOrderRewardKey,
  pointsForOrderTotal,
  savePendingRostaOrderReward,
} from "@/lib/rewards";

type CheckoutForm = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  district: string;
  neighborhood: string;
  addressLine: string;
  postalCode: string;
  note: string;
};

type SavedAddress = {
  full_name: string;
  phone: string;
  email: string | null;
  city: string;
  district: string;
  neighborhood: string | null;
  address_line: string;
  postal_code: string | null;
};

type AccountDiscount = {
  code: string;
  title: string;
  discountPercent: number;
  expiresAt?: string | null;
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

const initialForm: CheckoutForm = {
  fullName: "",
  email: "",
  phone: "",
  city: "",
  district: "",
  neighborhood: "",
  addressLine: "",
  postalCode: "",
  note: "",
};

const CHECKOUT_DRAFT_TOKEN_KEY = "rosta-checkout-draft-token";

type CardForm = {
  ccOwner: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
};

type InstallmentOption = {
  count: number;
  rate: number;
};

type CardInfo = {
  brand: string;
  bank: string;
  schema: string;
  cardType: string;
  businessCard: string;
  isCreditCard: boolean;
};

type DirectPayment = {
  action: string;
  fields: Record<string, string>;
  orderNo: string;
  testMode: boolean;
  fingerprint: string;
};

type LoadedCheckoutDraft = {
  orderNo: string;
  merchantOid: string;
  subtotal: number;
  shippingFee: number;
  discountTotal: number;
  totalAmount: number;
  currency: string;
  source: string | null;
};

const initialCardForm: CardForm = {
  ccOwner: "",
  cardNumber: "",
  expiryDate: "",
  cvv: "",
};

function makeLocalDraftToken() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}


function hasRecoverableCheckoutContact(customer: CheckoutForm) {
  const email = customer.email.trim().toLocaleLowerCase("tr-TR");
  const phoneDigits = customer.phone.replace(/\D/g, "");
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const hasPhone = phoneDigits.length >= 10;

  return hasEmail || hasPhone;
}

function formatCardNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function isValidCardNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 16) return false;
  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}

function formatExpiryDate(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

function parseExpiryDate(value: string) {
  const digits = value.replace(/\D/g, "");
  return {
    month: digits.slice(0, 2),
    year: digits.slice(2, 4),
  };
}

function RequiredMark() {
  return <span className="required-star" aria-hidden="true">*</span>;
}

export function CheckoutClient() {
  const {
    items,
    subtotal,
    isReady,
    removeItem,
    updateQuantity,
    replaceCartItems,
  } = useCart();
  const searchParams = useSearchParams();
  const draftToken = searchParams.get("draft") || "";
  const openPaymentDirectly = searchParams.get("payment") === "1";
  const { user, session } = useAuth();
  const [form, setForm] = useState<CheckoutForm>(initialForm);
  const [directPayment, setDirectPayment] = useState<DirectPayment | null>(null);
  const [cardForm, setCardForm] = useState<CardForm>(initialCardForm);
  const [cardInfo, setCardInfo] = useState<CardInfo | null>(null);
  const [installmentOptions, setInstallmentOptions] = useState<InstallmentOption[]>([]);
  const [selectedInstallment, setSelectedInstallment] = useState(0);
  const [isCardOptionsLoading, setIsCardOptionsLoading] = useState(false);
  const [cardOptionsMessage, setCardOptionsMessage] = useState<string | null>(null);
  const [paytrTestMode, setPaytrTestMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [useRostaPoints, setUseRostaPoints] = useState(true);
  const [requestedRostaPoints, setRequestedRostaPoints] = useState(0);
  const [isRostaPointsOpen, setIsRostaPointsOpen] = useState(false);
  const [availableDiscounts, setAvailableDiscounts] = useState<AccountDiscount[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent?: number; title?: string } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [pricingQuote, setPricingQuote] = useState<PricingQuote | null>(null);
  const [rewardRefreshKey, setRewardRefreshKey] = useState(0);
  const [birthdayPoints, setBirthdayPoints] = useState(0);
  const [serverRewardPoints, setServerRewardPoints] = useState<number | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(openPaymentDirectly ? 3 : 1);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [loadedCheckoutDraft, setLoadedCheckoutDraft] = useState<LoadedCheckoutDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutDraftToken, setCheckoutDraftToken] = useState("");
  const [, setPaymentReached] = useState(false);
  const paymentSectionRef = useRef<HTMLDivElement | null>(null);
  const checkoutStepsRef = useRef<HTMLDivElement | null>(null);
  const paymentFormElementRef = useRef<HTMLFormElement | null>(null);
  const formRef = useRef<CheckoutForm>(initialForm);
  const itemsRef = useRef(items);
  const draftTokenRef = useRef("");
  const draftSaveTimerRef = useRef<number | null>(null);
  const lastDraftSignatureRef = useRef("");

  const updateField = (field: keyof CheckoutForm, value: string) => {
    setDirectPayment(null);
    setForm((current) => {
      const next = { ...current, [field]: value };
      formRef.current = next;
      return next;
    });
  };

  const ensureCheckoutDraftToken = () => {
    const current = draftTokenRef.current || checkoutDraftToken;
    if (current) return current;
    if (typeof window === "undefined") return "";

    const savedToken =
      window.localStorage.getItem(CHECKOUT_DRAFT_TOKEN_KEY) ||
      makeLocalDraftToken();
    window.localStorage.setItem(CHECKOUT_DRAFT_TOKEN_KEY, savedToken);
    draftTokenRef.current = savedToken;
    setCheckoutDraftToken(savedToken);
    return savedToken;
  };

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    draftTokenRef.current = checkoutDraftToken;
  }, [checkoutDraftToken]);

  useEffect(() => {
    ensureCheckoutDraftToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    grantRostaWelcomePoints();
    setRewardRefreshKey((current) => current + 1);
  }, [user]);

  useEffect(() => {
    const refresh = () => setRewardRefreshKey((current) => current + 1);
    window.addEventListener(ROSTA_POINTS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ROSTA_POINTS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);


  useEffect(() => {
    if (!isReady || !draftToken || draftLoaded) return;

    let cancelled = false;

    const loadCheckoutDraft = async () => {
      try {
        const response = await fetch(
          `/api/checkout-draft?draft=${encodeURIComponent(draftToken)}`,
        );
        const data = await response.json();

        if (!response.ok || !data.ok) {
          if (!cancelled) setError(data.error || "Sepet bağlantısı açılamadı.");
          return;
        }

        if (cancelled) return;

        setForm((current) => ({
          ...current,
          fullName: data.customer?.fullName || current.fullName,
          email: data.customer?.email || current.email,
          phone: data.customer?.phone || current.phone,
          city: data.customer?.city || current.city,
          district: data.customer?.district || current.district,
          neighborhood: data.customer?.neighborhood || current.neighborhood,
          addressLine: data.customer?.addressLine || current.addressLine,
          postalCode: data.customer?.postalCode || current.postalCode,
          note: data.customer?.note || current.note,
        }));

        replaceCartItems(data.items || []);
        setLoadedCheckoutDraft(data.draft || null);
        if (openPaymentDirectly) {
          const restoredToken = String(draftToken || "");
          if (restoredToken) {
            window.localStorage.setItem(CHECKOUT_DRAFT_TOKEN_KEY, restoredToken);
            draftTokenRef.current = restoredToken;
            setCheckoutDraftToken(restoredToken);
          }
          // Manuel ödeme linkinde de normal ödeme ekranındaki ROSTA Points ve kupon akışı çalışır.
          // Taslaktan yalnızca ürün/kargo tabanı alınır; canlı fiyat teklifi kullanıcı oturumuna göre yeniden hesaplanır.
          setPricingQuote({
            subtotal: Number(data.draft?.subtotal || 0),
            baseShippingFee: Number(data.draft?.shippingFee || 0),
            shippingFee: Number(data.draft?.shippingFee || 0),
            automaticDiscountTotal: 0,
            rewardDiscountTotal: 0,
            rewardPointsAvailable: 0,
            rewardPointsUsed: 0,
            couponDiscountTotal: 0,
            discountTotal: 0,
            totalAmount: Number(data.draft?.subtotal || 0) + Number(data.draft?.shippingFee || 0),
            couponCode: null,
            freeShipping: Number(data.draft?.shippingFee || 0) <= 0,
          });
        }
        setDraftNotice(
          openPaymentDirectly
            ? "Sipariş bilgilerin hazır. Kart bilgilerini girerek ödemeyi tamamlayabilirsin."
            : "Sepetin geri yüklendi. Ödemeye kaldığın yerden devam edebilirsin.",
        );
        if (openPaymentDirectly) {
          setCheckoutStep(3);
          setPaymentReached(true);
          window.setTimeout(() => paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        }
        setDraftLoaded(true);
      } catch {
        if (!cancelled) setError("Sepet bağlantısı açılamadı.");
      }
    };

    loadCheckoutDraft();

    return () => {
      cancelled = true;
    };
  }, [draftLoaded, draftToken, isReady, openPaymentDirectly, replaceCartItems]);

  useEffect(() => {
    if (!isReady || items.length === 0) return;
    trackRuthEvent("checkout_view", {
      item_count: items.length,
      subtotal,
    });
  }, [isReady, items.length, subtotal]);

  const saveRecoverableCheckoutDraft = async (
    useBeacon = false,
    options: {
      customer?: CheckoutForm;
      items?: typeof items;
      source?: string;
    } = {},
  ) => {
    if (openPaymentDirectly) return;
    const activeForm = options.customer || formRef.current;
    const activeItems = options.items || itemsRef.current;
    const activeToken = ensureCheckoutDraftToken();

    if (
      !isReady ||
      activeItems.length === 0 ||
      !activeToken ||
      !hasRecoverableCheckoutContact(activeForm)
    )
      return;

    const payloadObject = {
      resumeToken: activeToken,
      customer: activeForm,
      items: activeItems,
      source: options.source || "contact_captured",
      attribution: getRuthAttribution(),
    };
    const payload = JSON.stringify(payloadObject);
    const signature = JSON.stringify({
      token: activeToken,
      customer: {
        fullName: activeForm.fullName,
        email: activeForm.email,
        phone: activeForm.phone,
        city: activeForm.city,
        district: activeForm.district,
        addressLine: activeForm.addressLine,
      },
      items: activeItems.map((item) => ({
        key: item.key,
        quantity: item.quantity,
      })),
      source: payloadObject.source,
    });

    if (!useBeacon && lastDraftSignatureRef.current === signature) return;

    if (
      useBeacon &&
      typeof navigator !== "undefined" &&
      "sendBeacon" in navigator
    ) {
      const sent = navigator.sendBeacon(
        "/api/checkout-draft/save",
        new Blob([payload], { type: "application/json" }),
      );
      if (sent) return;
    }

    const response = await fetch("/api/checkout-draft/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: useBeacon,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok && data.resumeToken) {
      window.localStorage.setItem(CHECKOUT_DRAFT_TOKEN_KEY, data.resumeToken);
      draftTokenRef.current = data.resumeToken;
      setCheckoutDraftToken(data.resumeToken);
      lastDraftSignatureRef.current = signature;
    }
  };

  useEffect(() => {
    if (
      !isReady ||
      items.length === 0 ||
      !checkoutDraftToken ||
      !hasRecoverableCheckoutContact(form)
    )
      return;

    const timer = window.setTimeout(() => {
      saveRecoverableCheckoutDraft(false, { source: "contact_captured" }).catch(
        () => {
          // Terk sepet kaydı müşteri deneyimini bozmasın.
        },
      );
    }, 120);

    return () => window.clearTimeout(timer);
  }, [checkoutDraftToken, form, isReady, items]);

  useEffect(() => {
    const saveOnExit = () => {
      if (draftSaveTimerRef.current)
        window.clearTimeout(draftSaveTimerRef.current);
      saveRecoverableCheckoutDraft(true, { source: "checkout_exit" }).catch(
        () => {},
      );
    };

    const saveOnVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveOnExit();
    };

    window.addEventListener("pagehide", saveOnExit);
    window.addEventListener("beforeunload", saveOnExit);
    document.addEventListener("visibilitychange", saveOnVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", saveOnExit);
      window.removeEventListener("beforeunload", saveOnExit);
      document.removeEventListener("visibilitychange", saveOnVisibilityChange);
    };
  }, [checkoutDraftToken, form, isReady, items]);

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
    if (!session?.access_token) return;

    let cancelled = false;

    const loadSavedAddress = async () => {
      try {
        const response = await fetch("/api/account/addresses", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const data = await response.json();
        if (!response.ok || !data.ok || cancelled) return;

        const address = (data.addresses?.[0] || null) as SavedAddress | null;
        if (!address) return;

        setForm((current) => {
          if (current.city || current.district || current.addressLine)
            return current;

          return {
            ...current,
            fullName: current.fullName || address.full_name || "",
            email: current.email || address.email || "",
            phone: current.phone || address.phone || "",
            city: address.city || "",
            district: address.district || "",
            neighborhood: address.neighborhood || "",
            addressLine: address.address_line || "",
            postalCode: address.postal_code || "",
          };
        });
      } catch {
        // Adres otomatik doldurulamazsa ödeme adımı yine normal devam eder.
      }
    };

    loadSavedAddress();

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) {
      setBirthdayPoints(0);
      setServerRewardPoints(null);
      return;
    }

    Promise.all([
      fetch("/api/rewards/birthday", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }).then((response) => response.json()),
      fetch("/api/rewards/balance", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }).then((response) => response.json()),
    ])
      .then(([birthdayData, balanceData]) => {
        if (birthdayData?.ok) {
          setBirthdayPoints(Number(birthdayData.birthdayPoints || 0));
          if (Number.isFinite(Number(birthdayData.rewardPointsBalance))) {
            setServerRewardPoints(Math.max(0, Math.floor(Number(birthdayData.rewardPointsBalance))));
          }
        }
        if (balanceData?.ok) {
          setServerRewardPoints(Math.max(0, Math.floor(Number(balanceData.points || 0))));
        }
      })
      .catch(() => undefined);
  }, [session?.access_token, rewardRefreshKey]);

  const rewardSummary = calculateRostaPoints({ isLoggedIn: Boolean(user), birthdayPoints });
  void rewardRefreshKey;
  const maxRostaPointsForCheckout = user
    ? Math.max(0, Math.floor(serverRewardPoints ?? rewardSummary.totalPoints))
    : 0;
  const rostaPointOptions = Array.from(
    { length: Math.max(0, Math.floor(maxRostaPointsForCheckout / 500)) },
    (_, index) => (index + 1) * 500,
  );
  const selectedRostaPoints = user && useRostaPoints
    ? Math.min(maxRostaPointsForCheckout, Math.max(0, Math.floor(Number(requestedRostaPoints || 0))))
    : 0;
  const localRostaPointDiscount = Math.min(subtotal, pointsToLira(selectedRostaPoints));
  const localCouponBase = Math.max(0, subtotal - localRostaPointDiscount);
  const localCouponDiscount = appliedCoupon?.discountPercent
    ? Number(((localCouponBase * appliedCoupon.discountPercent) / 100).toFixed(2))
    : 0;
  const quoteSubtotal = Number(pricingQuote?.subtotal ?? subtotal);
  const automaticDiscount = Number(pricingQuote?.automaticDiscountTotal || 0);
  const rostaPointDiscount = Number(pricingQuote?.rewardDiscountTotal ?? localRostaPointDiscount);
  const couponDiscount = Number(pricingQuote?.couponDiscountTotal ?? localCouponDiscount);
  const shippingFee = Number(pricingQuote?.shippingFee || 0);
  const baseShippingFee = Number(pricingQuote?.baseShippingFee || 0);
  const totalDiscount = Number(pricingQuote?.discountTotal ?? (automaticDiscount + rostaPointDiscount + couponDiscount));
  const checkoutTotal = Number(pricingQuote?.totalAmount ?? Math.max(0, subtotal - localRostaPointDiscount - localCouponDiscount));
  const selectedInstallmentOption = installmentOptions.find((option) => option.count === selectedInstallment) || null;
  const installmentRate = selectedInstallmentOption?.rate || 0;
  const installmentTotal = selectedInstallment > 0
    ? Number((checkoutTotal / ((100 - installmentRate) / 100)).toFixed(2))
    : checkoutTotal;
  const installmentFee = Number(Math.max(0, installmentTotal - checkoutTotal).toFixed(2));
  const installmentMonthly = selectedInstallment > 0
    ? Number((installmentTotal / selectedInstallment).toFixed(2))
    : installmentTotal;
  const normalCheckoutTotal = Number((quoteSubtotal + baseShippingFee).toFixed(2));
  const rostaPointsToUse = selectedRostaPoints;
  const cartQuoteSignature = useMemo(
    () => JSON.stringify(items.map((item) => ({ key: item.key, slug: item.slug, quantity: item.quantity }))),
    [items],
  );
  const paymentRequestFingerprint = useMemo(
    () =>
      JSON.stringify({
        cart: cartQuoteSignature,
        customer: form,
        coupon: appliedCoupon?.code || null,
        points: rostaPointsToUse,
        total: installmentTotal,
        installment: selectedInstallment,
        installmentRate,
      }),
    [appliedCoupon?.code, cartQuoteSignature, form, installmentRate, installmentTotal, rostaPointsToUse, selectedInstallment],
  );

  useEffect(() => {
    if (directPayment && directPayment.fingerprint !== paymentRequestFingerprint) {
      setDirectPayment(null);
    }
  }, [directPayment, paymentRequestFingerprint]);

  useEffect(() => {
    const binNumber = cardForm.cardNumber.replace(/\D/g, "").slice(0, 8);
    if (binNumber.length < 6 || checkoutStep !== 3) {
      setCardInfo(null);
      setInstallmentOptions([]);
      setSelectedInstallment(0);
      setCardOptionsMessage(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsCardOptionsLoading(true);
      setCardOptionsMessage(null);
      try {
        const response = await fetch("/api/paytr/direct/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ binNumber }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Kart bilgisi sorgulanamadı.");
        if (cancelled) return;
        setCardInfo(data.card || null);
        const options = Array.isArray(data.installments)
          ? data.installments
              .map((option: unknown) => {
                const record = option && typeof option === "object" ? option as Record<string, unknown> : {};
                return { count: Math.trunc(Number(record.count)), rate: Number(record.rate) };
              })
              .filter((item: InstallmentOption) =>
                item.count >= 2 && item.count <= 12 && Number.isFinite(item.rate) && item.rate >= 0 && item.rate < 100
              )
          : [];
        setInstallmentOptions(options);
        setSelectedInstallment(0);
        setPaytrTestMode(Boolean(data.testMode));
        setCardOptionsMessage(data.warning || null);
      } catch (caughtError) {
        if (cancelled) return;
        setCardInfo(null);
        setInstallmentOptions([]);
        setSelectedInstallment(0);
        setCardOptionsMessage(caughtError instanceof Error ? caughtError.message : "Taksit seçenekleri alınamadı.");
      } finally {
        if (!cancelled) setIsCardOptionsLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cardForm.cardNumber, checkoutStep]);

  useEffect(() => {
    if (!user || maxRostaPointsForCheckout <= 0) {
      setRequestedRostaPoints(0);
      setUseRostaPoints(false);
      return;
    }

    setRequestedRostaPoints((current) => Math.min(Math.max(0, Math.floor(Number(current || 0))), maxRostaPointsForCheckout));
  }, [maxRostaPointsForCheckout, user]);

  const selectRostaPointAmount = (amount: number) => {
    const safeAmount = Math.min(maxRostaPointsForCheckout, Math.max(0, Math.floor(Number(amount || 0))));
    setUseRostaPoints(safeAmount > 0);
    setRequestedRostaPoints(safeAmount);
  };

  const useAllRostaPoints = () => {
    selectRostaPointAmount(maxRostaPointsForCheckout);
  };

  useEffect(() => {
    if (!session?.access_token) {
      setAvailableDiscounts([]);
      setAppliedCoupon(null);
      setCouponMessage(null);
      return;
    }

    let alive = true;
    setCouponLoading(true);

    fetch("/api/review-coupons/list", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (!alive || !data?.ok) return;
        const discounts = (data.discounts || []) as AccountDiscount[];
        setAvailableDiscounts(discounts);

        const savedCode = typeof window !== "undefined" ? window.localStorage.getItem("rosta-selected-discount-code") : null;
        const savedDiscount = discounts.find((discount) => discount.code === savedCode);
        if (savedDiscount) {
          setAppliedCoupon({ code: savedDiscount.code, discountPercent: Number(savedDiscount.discountPercent || 10), title: savedDiscount.title });
          setCouponMessage(null);
          window.localStorage.removeItem("rosta-selected-discount-code");
        }
      })
      .catch(() => undefined)
      .finally(() => alive && setCouponLoading(false));

    return () => { alive = false; };
  }, [session?.access_token]);

  const requestPricingQuote = async (code: string | null, showMessage = false) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const response = await fetch("/api/discounts/quote", {
      method: "POST",
      headers,
      body: JSON.stringify({
        items: items.map((item) => ({ key: item.key, id: item.id, slug: item.slug, quantity: item.quantity })),
        couponCode: code || null,
        customerEmail: form.email || user?.email || null,
        rewards: {
          useRostaPoints: Boolean(user && useRostaPoints),
          requestedDiscount: localRostaPointDiscount,
          pointsUsed: selectedRostaPoints,
        },
        draftToken: openPaymentDirectly ? draftToken : null,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "İndirim hesaplanamadı.");
    setPricingQuote(data.quote as PricingQuote);
    if (Number.isFinite(Number(data.quote?.rewardPointsAvailable))) {
      setServerRewardPoints(Math.max(0, Math.floor(Number(data.quote.rewardPointsAvailable))));
    }
    if (showMessage && code) {
      const saved = Number(data.quote?.couponDiscountTotal || 0);
      const shippingText = data.quote?.freeShipping ? " ve ücretsiz kargo" : "";
      setCouponMessage(null);
    }
    return data.quote as PricingQuote;
  };

  useEffect(() => {
    if (!isReady || !items.length) {
      setPricingQuote(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      requestPricingQuote(appliedCoupon?.code || null)
        .catch((quoteError) => {
          if (!active) return;
          setPricingQuote(null);
          if (appliedCoupon?.code) {
            setCouponMessage(quoteError instanceof Error ? quoteError.message : "Kupon uygulanamadı.");
            setAppliedCoupon(null);
          }
        })
        .finally(() => active && setQuoteLoading(false));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // cartQuoteSignature sepet içeriğinin stabil özetidir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartQuoteSignature, appliedCoupon?.code, selectedRostaPoints, useRostaPoints, session?.access_token, form.email, isReady, openPaymentDirectly]);

  const selectAccountDiscount = async (discount: AccountDiscount) => {
    try {
      setQuoteLoading(true);
      await requestPricingQuote(discount.code, true);
      setAppliedCoupon({ code: discount.code, discountPercent: Number(discount.discountPercent || 10), title: discount.title });
      setCouponInput(discount.code);
    } catch (couponError) {
      setCouponMessage(couponError instanceof Error ? couponError.message : "İndirim uygulanamadı.");
    } finally {
      setQuoteLoading(false);
    }
  };

  const applyCouponCode = async () => {
    const code = couponInput.trim().toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
    if (!code) {
      setCouponMessage("Kupon kodunu yaz.");
      return;
    }
    try {
      setQuoteLoading(true);
      await requestPricingQuote(code, true);
      setAppliedCoupon({ code, title: "Kupon kodu" });
    } catch (couponError) {
      setAppliedCoupon(null);
      setCouponMessage(couponError instanceof Error ? couponError.message : "Kupon uygulanamadı.");
    } finally {
      setQuoteLoading(false);
    }
  };

  const clearAccountDiscount = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponMessage(null);
    setPricingQuote(null);
  };

  const checkoutSteps = [
    { id: 1 as const, title: "Bilgiler", helper: "İletişim" },
    { id: 2 as const, title: "Adres", helper: "Teslimat" },
    { id: 3 as const, title: "Ödeme", helper: "Kart" },
  ];

  const scrollCheckoutTop = () => {
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      const target = checkoutStepsRef.current;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 0);
  };

  const validateContactStep = () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim()) {
      setError("Devam etmek için ad soyad, telefon ve e-posta bilgilerini doldur.");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Geçerli bir e-posta adresi gir.");
      return false;
    }

    return true;
  };

  const validateAddressStep = () => {
    if (!form.city.trim() || !form.district.trim() || !form.addressLine.trim()) {
      setError("Devam etmek için il, ilçe ve açık adres bilgilerini doldur.");
      return false;
    }

    return true;
  };

  const goToCheckoutStep = (step: 1 | 2 | 3) => {
    setCheckoutStep(step);
    setError(null);
    scrollCheckoutTop();
    if (step === 3) setPaymentReached(true);
  };

  const goNextStep = () => {
    setError(null);

    if (checkoutStep === 1) {
      if (!validateContactStep()) return;
      saveRecoverableCheckoutDraft(false, { source: "contact_step_completed" }).catch(() => {});
      goToCheckoutStep(2);
      return;
    }

    if (checkoutStep === 2) {
      if (!validateAddressStep()) return;
      saveRecoverableCheckoutDraft(false, { source: "address_step_completed" }).catch(() => {});
      goToCheckoutStep(3);
    }
  };

  const goPreviousStep = () => {
    if (checkoutStep === 2) goToCheckoutStep(1);
    if (checkoutStep === 3) goToCheckoutStep(2);
  };

  const startPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (isSubmitting) return;

    try {
      if (!validateContactStep()) {
        setCheckoutStep(1);
        scrollCheckoutTop();
        return;
      }

      if (!validateAddressStep()) {
        setCheckoutStep(2);
        scrollCheckoutTop();
        return;
      }

      const cardDigits = cardForm.cardNumber.replace(/\D/g, "");
      if (cardForm.ccOwner.trim().length < 3) throw new Error("Kart sahibinin adını ve soyadını gir.");
      if (!isValidCardNumber(cardDigits)) throw new Error("Geçerli bir kart numarası gir.");
      const expiry = parseExpiryDate(cardForm.expiryDate);
      if (!/^(0[1-9]|1[0-2])$/.test(expiry.month) || !/^\d{2}$/.test(expiry.year)) {
        throw new Error("Son kullanma tarihini AA/YY şeklinde gir.");
      }
      const now = new Date();
      const expiryYear = 2000 + Number(expiry.year);
      const expiryMonth = Number(expiry.month);
      if (expiryYear < now.getFullYear() || (expiryYear === now.getFullYear() && expiryMonth < now.getMonth() + 1)) {
        throw new Error("Kartın son kullanma tarihi geçmiş.");
      }
      if (!/^\d{3}$/.test(cardForm.cvv)) throw new Error("Geçerli, 3 haneli bir CVV kodu gir.");
      if (selectedInstallment > 0 && (!cardInfo?.isCreditCard || !installmentOptions.some((item) => item.count === selectedInstallment))) {
        throw new Error("Bu kart için PayTR tarafından doğrulanmış bir taksit seçeneği seç.");
      }

      setIsSubmitting(true);
      setPaymentReached(true);
      trackRuthEvent("payment_start", {
        item_count: items.length,
        subtotal,
        discount_total: totalDiscount,
        total_amount: installmentTotal,
        base_total_amount: checkoutTotal,
        installment_fee: installmentFee,
        reward_points_used: rostaPointsToUse,
        coupon_code: appliedCoupon?.code || null,
        installment_count: selectedInstallment,
      });

      if (!openPaymentDirectly) {
        await saveRecoverableCheckoutDraft(false, { source: "payment_start" });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      // Kart numarası, CVV ve son kullanma tarihi bu isteğe dahil edilmez.
      // Sunucudan yalnızca PayTR'ye gönderilecek imzalı sipariş alanları alınır.
      const response = await fetch("/api/paytr/direct/prepare", {
        method: "POST",
        headers,
        body: JSON.stringify({
          customer: form,
          draftToken: openPaymentDirectly ? draftToken : (draftTokenRef.current || checkoutDraftToken),
          items: items.map((item) => ({
            key: item.key,
            id: item.id,
            slug: item.slug,
            quantity: item.quantity,
          })),
          rewards: {
            useRostaPoints: Boolean(user && useRostaPoints),
            requestedDiscount: rostaPointDiscount,
            pointsUsed: rostaPointsToUse,
          },
          coupon: appliedCoupon ? { code: appliedCoupon.code } : null,
          attribution: getRuthAttribution(),
          payment: {
            installmentCount: selectedInstallment,
            cardType: selectedInstallment > 0 ? cardInfo?.brand || "" : "",
            binNumber: cardForm.cardNumber.replace(/\D/g, "").slice(0, 8),
          },
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Ödeme hazırlanamadı.");

      if (data.resumeToken) {
        window.localStorage.setItem(CHECKOUT_DRAFT_TOKEN_KEY, data.resumeToken);
        draftTokenRef.current = data.resumeToken;
        setCheckoutDraftToken(data.resumeToken);
      }

      if (user) {
        const orderKey = makeRostaOrderRewardKey(data.orderNo || draftTokenRef.current || checkoutDraftToken);
        savePendingRostaOrderReward({
          orderKey,
          orderNo: data.orderNo || null,
          totalAmount: installmentTotal,
          pointsToEarn: pointsForOrderTotal(checkoutTotal),
          pointsUsed: rostaPointsToUse,
        });
      }

      const prepared: DirectPayment = {
        action: data.action,
        fields: data.fields || {},
        orderNo: data.orderNo,
        testMode: Boolean(data.testMode),
        fingerprint: paymentRequestFingerprint,
      };
      setDirectPayment(prepared);
      setPaytrTestMode(Boolean(data.testMode));

      // React tarafından yönetilen checkout formunu doğrudan PayTR'ye göndermiyoruz.
      // Böylece yeniden render sırasında paytr_token alanının silinmesi, aynı isimli alanların
      // çakışması veya checkout alanlarının yanlışlıkla PayTR'ye gitmesi mümkün olmaz.
      const paytrForm = document.createElement("form");
      paytrForm.method = "POST";
      paytrForm.action = prepared.action;
      paytrForm.acceptCharset = "UTF-8";
      paytrForm.style.display = "none";

      const paytrFields: Record<string, string> = {
        ...prepared.fields,
        cc_owner: cardForm.ccOwner.trim(),
        card_number: cardDigits,
        expiry_month: expiry.month,
        expiry_year: expiry.year,
        cvv: cardForm.cvv,
        // Bu entegrasyonda Non-3D hiçbir koşulda kullanılmaz.
        non_3d: "0",
        non3d_test_failed: "0",
      };

      const requiredPaytrFields = [
        "merchant_id", "user_ip", "merchant_oid", "email", "payment_type",
        "payment_amount", "installment_count", "currency", "test_mode", "non_3d",
        "merchant_ok_url", "merchant_fail_url", "user_name", "user_address",
        "user_phone", "user_basket", "paytr_token", "cc_owner", "card_number",
        "expiry_month", "expiry_year", "cvv",
      ];
      const missingField = requiredPaytrFields.find((name) => !String(paytrFields[name] ?? "").trim());
      if (missingField) throw new Error(`PayTR ödeme alanı eksik: ${missingField}`);

      Object.entries(paytrFields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        paytrForm.appendChild(input);
      });

      document.body.appendChild(paytrForm);
      paytrForm.submit();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ödeme başlatılamadı.");
      window.setTimeout(() => paymentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      setIsSubmitting(false);
    }
  };

  if (!isReady || (draftToken && !draftLoaded && !error)) {
    return (
      <div className="min-h-screen bg-ivory px-4 pb-24 pt-32">
        <div className="mx-auto max-w-4xl">
          <div className="h-8 w-44 animate-pulse rounded bg-cream" />
          <div className="mt-5 h-64 animate-pulse rounded-xl bg-cream" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory px-4 pt-20 text-center">
        <div>
          <ShoppingBag className="mx-auto mb-5 text-gold-dark" size={32} />
          <h1 className="font-heading text-3xl">{error ? "Ödeme bağlantısı açılamadı" : "Sepetin boş"}</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-ruth">
            {error || "Ödeme adımına geçmek için önce sepetine bir parça ekle."}
          </p>
          <Link
            href="/products"
            className="mt-7 inline-block bg-ink px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream"
          >
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
          <p className="mb-3 text-xs uppercase tracking-wide-luxe text-gold-dark">
            Ödeme
          </p>
          <h1 className="font-heading text-4xl md:text-5xl">
            {openPaymentDirectly ? "Siparişini Kontrol Et" : "Sipariş Bilgileri"}
          </h1>
          <p className="mx-auto mt-3 hidden max-w-xl text-sm leading-7 text-muted-ruth md:block">
            {openPaymentDirectly
              ? "Ürünlerini ve teslimat bilgilerini kontrol et, ardından kart bilgilerini girerek ödemeyi tamamla."
              : (
                <>
                  Teslimat bilgilerini tamamla, ardından kart bilgilerini girerek siparişini tamamla.
                  {user
                    ? " Giriş yaptığın için ROSTA Points indirimin ödeme adımında aktif olabilir."
                    : " Üye olmadan da sipariş verebilirsin; ROSTA Points kullanmak için giriş yap."}
                </>
              )}
          </p>
        </div>

        <form
          ref={paymentFormElementRef}
          onSubmit={startPayment}
          method="post"
          acceptCharset="UTF-8"
          autoComplete="on"
          onBlurCapture={() => {
            saveRecoverableCheckoutDraft(false, {
              source: "checkout_field_blur",
            }).catch(() => {});
          }}
          className="grid w-full min-w-0 max-w-full gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:gap-6"
        >
          <section className="min-w-0 space-y-6">
            {!openPaymentDirectly && <div ref={checkoutStepsRef} className="scroll-mt-24 rounded-2xl border border-gold/15 bg-cream p-3 shadow-sm md:scroll-mt-32">
              <div className="grid grid-cols-3 gap-2">
                {checkoutSteps.map((step, stepIndex) => {
                  const isActive = checkoutStep === step.id;
                  const isDone = checkoutStep > step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        if (step.id === 1) goToCheckoutStep(1);
                        if (step.id === 2 && validateContactStep()) goToCheckoutStep(2);
                        if (step.id === 3 && validateContactStep() && validateAddressStep()) goToCheckoutStep(3);
                      }}
                      className={`rounded-xl px-2 py-3 text-center transition ${
                        isActive
                          ? "bg-ink text-cream shadow-md"
                          : isDone
                            ? "bg-gold/15 text-ink"
                            : "bg-ivory text-muted-ruth"
                      }`}
                    >
                      <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-current text-[11px] font-medium">
                        {stepIndex + 1}
                      </span>
                      <span className="block font-heading text-[0.72rem] uppercase tracking-[0.16em] sm:text-xs">
                        {step.title}
                      </span>
                      <span className="mt-1 hidden text-[10px] opacity-75 sm:block">
                        {step.helper}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>}

            {checkoutStep === 1 && (
              <div className="min-w-0 overflow-hidden rounded-xl border border-gold/15 bg-cream p-4 md:p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth">
                    Ad Soyad <RequiredMark />
                    <input
                      required
                      autoComplete="name"
                      value={form.fullName}
                      onChange={(event) => updateField("fullName", event.target.value)}
                      className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                    />
                  </label>

                  <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth">
                    Telefon <RequiredMark />
                    <input
                      required
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(event) => updateField("phone", event.target.value)}
                      className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                    />
                  </label>

                  <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth sm:col-span-2">
                    E-posta <RequiredMark />
                    <input
                      required
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={goNextStep}
                  className="mt-6 w-full rounded-full bg-ink px-6 py-4 text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark sm:w-auto sm:min-w-52"
                >
                  Adrese Devam Et
                </button>
              </div>
            )}

            {checkoutStep === 2 && (
              <div className="rounded-xl border border-gold/15 bg-cream p-4 md:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth">
                    İl <RequiredMark />
                    <input
                      required
                      autoComplete="address-level1"
                      value={form.city}
                      onChange={(event) => updateField("city", event.target.value)}
                      className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                    />
                  </label>

                  <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth">
                    İlçe <RequiredMark />
                    <input
                      required
                      autoComplete="address-level2"
                      value={form.district}
                      onChange={(event) => updateField("district", event.target.value)}
                      className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                    />
                  </label>


                  <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth sm:col-span-2">
                    Posta Kodu <span className="normal-case tracking-normal opacity-70">(isteğe bağlı)</span>
                    <input
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={10}
                      value={form.postalCode}
                      onChange={(event) => updateField("postalCode", event.target.value.replace(/[^0-9A-Za-z -]/g, ""))}
                      className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                    />
                  </label>

                  <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth sm:col-span-2">
                    Açık Adres <RequiredMark />
                    <textarea
                      required
                      autoComplete="street-address"
                      rows={4}
                      value={form.addressLine}
                      onChange={(event) => updateField("addressLine", event.target.value)}
                      className="mt-2 w-full resize-none rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                    />
                  </label>

                  <label className="block text-xs uppercase tracking-wide-luxe text-muted-ruth sm:col-span-2">
                    Sipariş Notu
                    <textarea
                      rows={3}
                      value={form.note}
                      onChange={(event) => updateField("note", event.target.value)}
                      className="mt-2 w-full resize-none rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                    />
                  </label>
                </div>

                <div className="mt-6 grid gap-3 sm:flex sm:items-center">
                  <button
                    type="button"
                    onClick={goPreviousStep}
                    className="rounded-full border border-gold/25 px-6 py-4 text-xs uppercase tracking-wide-luxe text-ink transition hover:border-gold-dark"
                  >
                    Geri
                  </button>
                  <button
                    type="button"
                    onClick={goNextStep}
                    className="rounded-full bg-ink px-6 py-4 text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark sm:min-w-52"
                  >
                    Ödemeye Devam Et
                  </button>
                </div>
              </div>
            )}

            {checkoutStep === 3 && (
              <div
                ref={paymentSectionRef}
                onFocusCapture={() => setPaymentReached(true)}
                onMouseEnter={() => setPaymentReached(true)}
                className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-gold/15 bg-cream p-4 md:p-5"
              >
                <div className="mb-5 overflow-hidden rounded-xl border border-gold/15 bg-white">
                    <div className="border-b border-gold/10 bg-ivory/70 px-4 py-4 md:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide-luxe text-gold-dark">Sipariş Önizlemesi</p>
                          <h2 className="mt-1 font-heading text-lg text-ink">Aldığın Ürünler</h2>
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
                        const variantLabels = Array.from(new Set(
                          [item.finish, item.size]
                            .map((value) => String(value || "").trim())
                            .filter((value) => value && value.toLocaleLowerCase("tr-TR") !== "standart"),
                        ));
                        return (
                          <div key={item.key} className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 px-4 py-4 sm:grid-cols-[72px_minmax(0,1fr)_auto] md:grid-cols-[82px_minmax(0,1fr)_auto] md:px-5">
                            <div className="h-24 overflow-hidden rounded-lg border border-gold/15 bg-ivory md:h-28">
                              {item.image ? (
                                <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="grid h-full place-items-center font-heading text-xl text-gold-dark">R</div>
                              )}
                            </div>
                            <div className="min-w-0 self-center">
                              <h3 className="font-heading text-sm leading-5 text-ink md:text-base">{item.name}</h3>
                              {variantLabels.length > 0 ? (
                                <p className="mt-1 text-xs leading-5 text-muted-ruth">{variantLabels.join(" · ")}</p>
                              ) : (
                                <p className="mt-1 text-xs text-muted-ruth">Standart ürün</p>
                              )}
                              <p className="mt-2 text-xs text-muted-ruth">Adet: {item.quantity}</p>
                            </div>
                            <strong className="col-span-2 self-center text-right text-sm text-ink sm:col-span-1 sm:whitespace-nowrap">
                              {formatPrice(Number(item.price || 0) * Number(item.quantity || 1), "TRY")}
                            </strong>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 border-t border-gold/10 bg-ivory/55 px-4 py-4 md:grid-cols-2 md:px-5">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide-luxe text-muted-ruth">Teslim Alacak Kişi</p>
                        <p className="mt-2 font-heading text-sm text-ink">{form.fullName || "—"}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-ruth">{form.phone || "—"}</p>
                        <p className="text-xs leading-5 text-muted-ruth">{form.email || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide-luxe text-muted-ruth">Teslimat Adresi</p>
                        <p className="mt-2 text-sm leading-6 text-ink">
                          {[
                            form.addressLine,
                            [form.district, form.city].filter(Boolean).join(" / "),
                          ].filter(Boolean).join(", ") || "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                {paytrTestMode && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                    PayTR test modu açık. Direct API yetkisi açıldığında PayTR test kartlarıyla işlemi deneyebilirsin.
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-gold/15 bg-white p-4 md:p-5">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-heading text-base text-ink">Kart Bilgileri</p>
                      <p className="mt-1 text-[11px] leading-5 text-muted-ruth">Kart bilgilerini girerek siparişini tamamla.</p>
                    </div>
                    <CreditCard className="text-gold-dark" size={26} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-[11px] uppercase tracking-wide-luxe text-muted-ruth sm:col-span-2">
                      Kart Üzerindeki İsim <RequiredMark />
                      <input
                        name="cc_owner"
                        required
                        autoComplete="cc-name"
                        value={cardForm.ccOwner}
                        onChange={(event) => {
                          setDirectPayment(null);
                          setCardForm((current) => ({ ...current, ccOwner: event.target.value.slice(0, 50) }));
                        }}
                        placeholder="AD SOYAD"
                        className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                      />
                    </label>

                    <label className="block text-[11px] uppercase tracking-wide-luxe text-muted-ruth sm:col-span-2">
                      Kart Numarası <RequiredMark />
                      <input
                        autoComplete="cc-number"
                        inputMode="numeric"
                        required
                        maxLength={19}
                        value={cardForm.cardNumber}
                        onChange={(event) => {
                          setDirectPayment(null);
                          setCardForm((current) => ({ ...current, cardNumber: formatCardNumber(event.target.value) }));
                        }}
                        placeholder="0000 0000 0000 0000"
                        className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-base tracking-[0.12em] text-ink outline-none transition focus:border-gold-dark"
                      />
                      <input type="hidden" name="card_number" value={cardForm.cardNumber.replace(/\D/g, "")} />
                    </label>

                    <label className="block text-[11px] uppercase tracking-wide-luxe text-muted-ruth">
                      Son Kullanma Tarihi <RequiredMark />
                      <input
                        autoComplete="cc-exp"
                        inputMode="numeric"
                        required
                        value={cardForm.expiryDate}
                        onChange={(event) => {
                          setDirectPayment(null);
                          setCardForm((current) => ({ ...current, expiryDate: formatExpiryDate(event.target.value) }));
                        }}
                        placeholder="AA/YY"
                        maxLength={5}
                        className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-[0.12em] text-ink outline-none transition focus:border-gold-dark"
                      />
                      <input type="hidden" name="expiry_month" value={parseExpiryDate(cardForm.expiryDate).month} />
                      <input type="hidden" name="expiry_year" value={parseExpiryDate(cardForm.expiryDate).year} />
                    </label>

                    <label className="block text-[11px] uppercase tracking-wide-luxe text-muted-ruth sm:max-w-[220px]">
                      CVV <RequiredMark />
                      <input
                        name="cvv"
                        type="password"
                        required
                        maxLength={3}
                        autoComplete="cc-csc"
                        inputMode="numeric"
                        value={cardForm.cvv}
                        onChange={(event) => {
                          setDirectPayment(null);
                          setCardForm((current) => ({ ...current, cvv: event.target.value.replace(/\D/g, "").slice(0, 3) }));
                        }}
                        placeholder="000"
                        className="mt-2 w-full rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm normal-case tracking-normal text-ink outline-none transition focus:border-gold-dark"
                      />
                    </label>
                  </div>

                  {(cardInfo || isCardOptionsLoading || cardOptionsMessage) && (
                    <div className="mt-4 rounded-lg border border-gold/15 bg-ivory/70 px-4 py-3 text-xs leading-5">
                      {isCardOptionsLoading ? (
                        <span className="text-muted-ruth">Kart ve taksit seçenekleri kontrol ediliyor…</span>
                      ) : cardInfo ? (
                        <span className="text-ink">
                          {[
                            cardInfo.cardType === "credit" ? "Kredi kartı" : cardInfo.cardType === "debit" ? "Banka kartı" : null,
                            cardInfo.bank,
                            cardInfo.schema,
                            cardInfo.brand !== "none" ? cardInfo.brand.toUpperCase() : null,
                          ].filter(Boolean).join(" • ")}
                        </span>
                      ) : null}
                      {cardOptionsMessage && <p className="mt-1 text-amber-700">{cardOptionsMessage}</p>}
                    </div>
                  )}

                  {cardInfo?.isCreditCard && installmentOptions.length > 0 ? (
                    <div className="mt-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-wide-luxe text-muted-ruth">Taksit Seçenekleri</p>
                        {isCardOptionsLoading && <RefreshCw className="animate-spin text-gold-dark" size={15} />}
                      </div>
                      <div className="grid gap-2">
                        {[{ count: 0, rate: 0 }, ...installmentOptions].map((option) => {
                          const checked = selectedInstallment === option.count;
                          return (
                            <label
                              key={option.count}
                              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition ${
                                checked ? "border-gold-dark bg-gold/10" : "border-gold/15 bg-ivory hover:border-gold/35"
                              }`}
                            >
                              <span className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  value={option.count}
                                  checked={checked}
                                  onChange={() => {
                                    setDirectPayment(null);
                                    setSelectedInstallment(option.count);
                                  }}
                                  className="accent-[#9A7B52]"
                                />
                                <span className="text-sm font-medium text-ink">
                                  {option.count === 0 ? "Tek çekim" : `${option.count} taksit`}
                                </span>
                              </span>
                              <span className="text-right text-[11px] leading-5 text-muted-ruth">
                                {option.count === 0 ? (
                                  formatPrice(checkoutTotal, "TRY")
                                ) : (
                                  <>
                                    <strong className="block text-ink">{formatPrice(checkoutTotal / ((100 - option.rate) / 100), "TRY")}</strong>
                                    <span>{formatPrice((checkoutTotal / ((100 - option.rate) / 100)) / option.count, "TRY")} × {option.count}</span>
                                  </>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                {!openPaymentDirectly && (
                  <div className="mt-4 grid gap-3 sm:flex sm:items-center">
                    <button
                      type="button"
                      onClick={goPreviousStep}
                      className="rounded-full border border-gold/25 px-5 py-3 text-[11px] uppercase tracking-wide-luxe text-ink transition hover:border-gold-dark"
                    >
                      Adrese Dön
                    </button>
                  </div>
                )}
              </div>
            )}

          </section>

          <aside className={`${checkoutStep === 3 ? "block" : "hidden"} w-full min-w-0 max-w-full xl:sticky xl:top-28 xl:self-start`}>
            <div className="rounded-xl border border-gold/15 bg-cream p-4 md:p-6">
              <h2 className="font-heading text-lg">Ödeme Özeti</h2>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between text-muted-ruth">
                  <span>Ara toplam</span>
                  <span>{formatPrice(quoteSubtotal, "TRY")}</span>
                </div>
                <div className="flex justify-between text-muted-ruth">
                  <span>Kargo</span>
                  <span>{shippingFee > 0 ? formatPrice(shippingFee, "TRY") : "Ücretsiz"}</span>
                </div>

                <>
                <div className="rounded-xl border border-gold/15 bg-ivory text-sm">
                  {user ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsRostaPointsOpen((current) => !current)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-cream/70"
                        aria-expanded={isRostaPointsOpen}
                      >
                        <span>
                          <span className="block font-heading text-sm text-ink">ROSTA Points Kullan</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-ruth">
                            Hesabında {maxRostaPointsForCheckout.toLocaleString("tr-TR")} ROSTA Points var.
                          </span>
                          {selectedRostaPoints > 0 && (
                            <span className="mt-1 block text-xs font-medium text-gold-dark">
                              Seçilen: {selectedRostaPoints.toLocaleString("tr-TR")} Points · -{formatPrice(rostaPointDiscount, "TRY")}
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          size={18}
                          className={`shrink-0 text-gold-dark transition-transform duration-300 ${isRostaPointsOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {isRostaPointsOpen && (
                        <div className="border-t border-gold/10 px-4 pb-4 pt-3">
                          {maxRostaPointsForCheckout > 0 ? (
                            <div>
                              <p className="text-xs leading-5 text-muted-ruth">
                                Kullanmak istediğin puanı seç. Hepsini kullan dediğinde hesabındaki kullanılabilir puanın tamamı uygulanır.
                              </p>
                              <div className="mt-3 grid gap-2">
                                <button
                                  type="button"
                                  onClick={() => selectRostaPointAmount(0)}
                                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs transition ${selectedRostaPoints === 0 ? "border-gold-dark bg-cream text-ink" : "border-gold/15 bg-white text-ink hover:border-gold-dark"}`}
                                >
                                  <span>Puan kullanma</span>
                                  <span>0 TL</span>
                                </button>
                                {rostaPointOptions.map((amount) => {
                                  const selected = useRostaPoints && selectedRostaPoints === amount;
                                  return (
                                    <button
                                      key={amount}
                                      type="button"
                                      onClick={() => selectRostaPointAmount(amount)}
                                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs transition ${selected ? "border-gold-dark bg-ink text-cream" : "border-gold/15 bg-white text-ink hover:border-gold-dark"}`}
                                    >
                                      <span>{amount.toLocaleString("tr-TR")} Points</span>
                                      <span>-{formatPrice(pointsToLira(amount), "TRY")}</span>
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={useAllRostaPoints}
                                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-medium uppercase tracking-wide-luxe transition ${useRostaPoints && selectedRostaPoints === maxRostaPointsForCheckout ? "border-gold-dark bg-ink text-cream" : "border-gold/15 bg-white text-ink hover:border-gold-dark"}`}
                                >
                                  <span>Hepsini Kullan</span>
                                  <span>{maxRostaPointsForCheckout.toLocaleString("tr-TR")} Points</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="rounded-lg border border-gold/10 bg-cream/70 px-3 py-2 text-xs leading-5 text-muted-ruth">
                              Kullanılabilir ROSTA Points bulunmuyor. Alışveriş tamamladıkça puanın burada görünecek.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-4 text-sm">
                      <p className="font-heading text-ink">ROSTA Points</p>
                      <p className="mt-1 text-xs leading-5 text-muted-ruth">
                        Üye ol, {ROSTA_WELCOME_POINTS.toLocaleString("tr-TR")} ROSTA Points kazan ve ödeme adımında {formatPrice(200, "TRY")} indirim kullan.
                      </p>
                      <Link href="/login?redirect=/checkout" className="mt-3 inline-block text-xs uppercase tracking-wide-luxe text-gold-dark underline underline-offset-4">
                        Giriş Yap / Üye Ol
                      </Link>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-gold/10 bg-ivory p-4 text-sm">
                  <p className="font-heading text-ink">İndirim Kullan</p>
                  <p className="mt-1 text-xs leading-5 text-muted-ruth">Kupon kodunu veya hesabındaki yorum indirimini kullan.</p>
                  <div className="mt-3 flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-gold/15 bg-white px-3 py-2.5 text-sm uppercase outline-none transition focus:border-gold-dark"
                      value={couponInput}
                      onChange={(event) => setCouponInput(event.target.value.toLocaleUpperCase("tr-TR").replace(/\s+/g, ""))}
                      placeholder="KUPON KODU"
                    />
                    <button type="button" onClick={applyCouponCode} disabled={quoteLoading} className="rounded-lg border border-gold-dark bg-ink px-4 py-2 text-xs uppercase tracking-wide-luxe text-cream disabled:opacity-50">
                      {quoteLoading ? "..." : "Uygula"}
                    </button>
                  </div>
                  {appliedCoupon && (
                    <button type="button" onClick={clearAccountDiscount} className="mt-2 text-xs text-gold-dark underline underline-offset-4">
                      {appliedCoupon.code} kodunu kaldır
                    </button>
                  )}
                  {user ? (
                    <div className="mt-3 space-y-2">
                      {couponLoading ? (
                        <div className="h-12 animate-pulse rounded-lg bg-cream" />
                      ) : availableDiscounts.length ? (
                        availableDiscounts.map((discount) => {
                          const selected = appliedCoupon?.code === discount.code;
                          return (
                            <button
                              key={discount.code}
                              type="button"
                              onClick={() => selected ? clearAccountDiscount() : selectAccountDiscount(discount)}
                              className={`w-full rounded-lg border px-3 py-3 text-left transition ${selected ? "border-gold-dark bg-ink text-cream" : "border-gold/15 bg-cream text-ink hover:border-gold-dark"}`}
                            >
                              <span className="block font-heading text-sm">{discount.title || "Yorum indirimi"}</span>
                              <span className={`mt-1 block text-xs ${selected ? "text-cream/75" : "text-muted-ruth"}`}>%{discount.discountPercent} indirim · Ödemede kullan</span>
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
                  {couponMessage && <p className="mt-2 text-xs leading-5 text-muted-ruth">{couponMessage}</p>}
                </div>

                </>

                {(automaticDiscount > 0 || rostaPointDiscount > 0 || couponDiscount > 0) && (
                  <div className="rounded-lg border border-gold/10 bg-ivory/75 p-3 text-sm">
                    <p className="mb-2 text-[10px] uppercase tracking-wide-luxe text-muted-ruth">Kullanılan indirim ve puanlar</p>
                    {automaticDiscount > 0 && (
                      <div className="flex justify-between text-gold-dark">
                        <span>Otomatik ürün/kampanya indirimi</span>
                        <span>-{formatPrice(automaticDiscount, "TRY")}</span>
                      </div>
                    )}
                    {rostaPointDiscount > 0 && (
                      <div className="flex justify-between text-gold-dark">
                        <span>{rostaPointsToUse.toLocaleString("tr-TR")} ROSTA Points</span>
                        <span>-{formatPrice(rostaPointDiscount, "TRY")}</span>
                      </div>
                    )}
                    {couponDiscount > 0 && (
                      <div className="mt-1 flex justify-between text-gold-dark">
                        <span>{appliedCoupon?.title || "Kupon indirimi"}</span>
                        <span>-{formatPrice(couponDiscount, "TRY")}</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedInstallment > 0 && selectedInstallmentOption ? (
                  <div className="rounded-lg border border-gold/15 bg-ivory/75 p-3 text-sm">
                    <div className="flex justify-between text-muted-ruth">
                      <span>Peşin fiyat</span>
                      <span>{formatPrice(checkoutTotal, "TRY")}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-gold-dark">
                      <span>{selectedInstallment} taksit vade farkı (%{installmentRate.toLocaleString("tr-TR", { maximumFractionDigits: 4 })})</span>
                      <span>+{formatPrice(installmentFee, "TRY")}</span>
                    </div>
                    <div className="mt-2 flex justify-between font-medium text-ink">
                      <span>Aylık ödeme</span>
                      <span>{formatPrice(installmentMonthly, "TRY")} × {selectedInstallment}</span>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-gold/15 pt-4">
                  {selectedInstallment > 0 ? (
                    <div className="flex items-end justify-between gap-4 font-heading">
                      <span className="text-base">Taksitli toplam</span>
                      <span className="text-2xl text-ink">{formatPrice(installmentTotal, "TRY")}</span>
                    </div>
                  ) : checkoutTotal < normalCheckoutTotal ? (
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
                      <span className="text-base">Toplam</span>
                      <span className="text-2xl text-ink">{formatPrice(checkoutTotal, "TRY")}</span>
                    </div>
                  )}
                </div>
              </div>

              {draftNotice && (
                <p className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs leading-5 text-green-700">
                  {draftNotice}
                </p>
              )}

              {error && (
                <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-5 flex w-full items-center justify-center gap-2 bg-ink px-5 py-3.5 text-center text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CreditCard size={15} />
                {isSubmitting ? "Ödeme hazırlanıyor..." : "Ödeme Yap"}
              </button>

              <div className="mt-10 grid grid-cols-3 gap-3 text-center">
                {[
                  { icon: Truck, title: "Kargo", lines: ["Kargo ücreti sipariş ayarlarına göre hesaplanır"] },
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
        </form>
      </div>
    </div>
  );
}
