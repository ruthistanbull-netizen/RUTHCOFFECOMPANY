"use client";

import { Check, Flame, MailCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { adminRequest } from "@/lib/adminApi";

type JsonRecord = Record<string, unknown>;
type EmailLog = { template_key?: string | null; status?: string | null };
type MoneyPart = { amountMinor?: number; currency?: string };
type OrderPricing = {
  subtotal?: MoneyPart;
  discount?: MoneyPart;
  pointsDiscount?: MoneyPart;
  shipping?: MoneyPart;
  tax?: MoneyPart;
  total?: MoneyPart;
};
type DetailOrderItem = {
  id?: string;
  product_id?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
};
type InsightOrder = {
  id: string;
  session_count_before_purchase?: number | null;
  purchase_session_number?: number | null;
  total_session_duration_seconds?: number | null;
  purchase_session_duration_seconds?: number | null;
  attribution_data?: JsonRecord | null;
  currency?: string | null;
  total_amount?: number | null;
  subtotal?: number | null;
  shipping_fee?: number | null;
  discount_total?: number | null;
  reward_discount_total?: number | null;
  tax_total?: number | null;
  pricing?: OrderPricing | null;
  order_items?: DetailOrderItem[];
};
type CustomerSummary = { isMember?: boolean; rewardPoints?: number };
type DiscountPricing = {
  productId: string;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  discountPercentage: number;
  hasDiscount: boolean;
};

const textMap: Record<string, string> = {
  Fulfillment: "Sipariş süreci",
  Medium: "Geliş kanalı",
  Referrer: "Siteye geldiği yer",
  Provider: "Ödeme altyapısı",
  Method: "Ödeme yöntemi",
  "Traffic Source": "Müşteri nereden geldi",
  "Traffic Medium": "Geliş kanalı",
  "Purchase Session": "Satın alana kadarki ziyaret",
  "Total Sessions": "Toplam ziyaret sayısı",
  instagram_organic: "Instagram organik",
  organic_social: "Organik sosyal medya",
  paid_social: "Ücretli sosyal medya",
  storefront: "Online mağaza",
  Storefront: "Online mağaza",
  direct: "Doğrudan ziyaret",
  referral: "Başka bir siteden yönlendirme",
  organic: "Organik trafik",
  pending: "Bekliyor",
  waiting: "Bekliyor",
  paid: "Ödendi",
  succeeded: "Ödendi",
  failed: "Başarısız",
  refunded: "İade edildi",
  cancelled: "İptal edildi",
  created: "Oluşturuldu",
  confirmed: "Onaylandı",
  in_production: "Hazırlanıyor",
  preparing: "Hazırlanıyor",
  processing: "İşleniyor",
  quality_control: "Kalite kontrol",
  ready_to_ship: "Kargoya hazır",
  shipped: "Kargoya verildi",
  in_transit: "Kargoda",
  out_for_delivery: "Dağıtımda",
  delivered: "Teslim edildi",
  completed: "Tamamlandı",
  fulfilled: "Tamamlandı",
};

const hideLabels = [
  "State Version",
  "Durum Sürümü",
  "Handler",
  "Kargo İşlem Kodu",
  "Profile ID",
  "Adres ID",
  "Sağlayıcı Referansı",
  "Quote ID",
  "Visitor ID",
  "Session ID",
  "Kaynak Sistem",
  "Siparişin geldiği sistem",
  "Ters Kargo",
];

const renameLabels: Record<string, string> = {
  Kaynak: "Müşteri nereden geldi",
  "Trafik Kanalı": "Geliş kanalı",
  "Yönlendiren Kaynak": "Siteye geldiği yer",
  "Satın Alma Oturumu": "Satın alana kadarki ziyaret",
  "Toplam Oturum": "Toplam ziyaret sayısı",
  "Toplam Süre": "Sitede geçirdiği toplam süre",
  "Satın Alma Süresi": "Sipariş verene kadar geçen süre",
  Oluşturma: "Sipariş oluşturulma zamanı",
  "İptal Zamanı": "İptal zamanı",
};

const renameSections: Record<string, string> = {
  "Operasyon Durumu": "Sipariş Durumu",
  "Fiyat ve İndirim Kırılımı": "Tutar Özeti",
  "Ödeme Detayları": "Ödeme",
  "Trafik ve Satın Alma Yolculuğu": "Satın Alma Yolculuğu",
  "E-posta ve Sistem Kayıtları": "Bildirim ve Tarihler",
  "Hızlı Operasyonlar": "İşlemler",
};

const emailStages = [
  { key: "received", label: "Sipariş alındı", templates: ["order_created", "order_lifecycle_received"] },
  { key: "ready", label: "Kargoya hazır", templates: ["order_lifecycle_ready"] },
  { key: "shipped", label: "Kargonuz yolda", templates: ["order_shipped", "order_lifecycle_shipped"] },
  { key: "delivered", label: "Teslim edildi", templates: ["order_lifecycle_delivered"] },
] as const;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function heatScore(order: InsightOrder) {
  const attribution = asRecord(order.attribution_data);
  const customer = asRecord(attribution.customer);
  const saved = asNumber(customer.heat_score);
  if (saved > 0) return Math.max(0, Math.min(100, Math.round(saved)));
  const score = Math.min(35, asNumber(attribution.page_views) * 0.35)
    + Math.min(25, asNumber(attribution.cart_adds) * 7)
    + Math.min(25, asNumber(attribution.checkout_starts) * 5)
    + Math.min(15, asNumber(order.session_count_before_purchase || order.purchase_session_number) * 1.5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function heatLabel(score: number) {
  return score >= 75 ? "Sıcak müşteri" : score >= 45 ? "Ilık müşteri" : "Soğuk müşteri";
}

function heatReason(order: InsightOrder, score: number) {
  const attribution = asRecord(order.attribution_data);
  const customer = asRecord(attribution.customer);
  const sessions = Math.max(1, Math.round(asNumber(order.session_count_before_purchase || order.purchase_session_number) || 1));
  const productViews = Math.max(0, Math.round(asNumber(attribution.product_views)));
  const pageViews = Math.max(0, Math.round(asNumber(attribution.page_views)));
  const cartAdds = Math.max(0, Math.round(asNumber(attribution.cart_adds)));
  const checkoutStarts = Math.max(0, Math.round(asNumber(attribution.checkout_starts)));
  const previousOrders = Math.max(0, Math.round(asNumber(customer.previous_order_count)));

  const facts: string[] = [];
  if (sessions > 1) facts.push(`${sessions} ayrı ziyarette geri dönmesi`);
  else facts.push("satın almayı tek ziyarette tamamlaması");
  if (productViews > 0) facts.push(`${productViews} ürün görüntülemesi`);
  else if (pageViews > 0) facts.push(`${pageViews} sayfa görüntülemesi`);
  if (cartAdds > 0) facts.push(`${cartAdds} kez sepete ürün eklemesi`);
  if (checkoutStarts > 0) facts.push(`${checkoutStarts} kez ödeme adımına gelmesi`);
  if (previousOrders > 0) facts.push(`${previousOrders} önceki siparişinin bulunması`);

  const behavior = facts.length
    ? `Bu puan; ${facts.join(", ")} dikkate alınarak verildi.`
    : "Bu puan, bu sipariş için kaydedilen satın alma davranışlarına göre verildi.";
  const interpretation = score >= 75
    ? "Davranışları güçlü satın alma niyeti gösteriyor."
    : score >= 45
      ? "İlgi var ancak satın alma sinyalleri henüz en güçlü seviyede değil."
      : "Satın alma öncesinde sınırlı etkileşim kaydedilmiş.";
  return `${behavior} ${interpretation}`;
}

function durationText(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  if (!safe) return "Süre kaydı yok";
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return minutes ? `${minutes} dk ${rest} sn` : `${rest} sn`;
}

function inferredDuration(order: InsightOrder) {
  const attribution = asRecord(order.attribution_data);
  const start = new Date(String(attribution.first_visit_at || attribution.started_at || "")).getTime();
  const end = new Date(String(attribution.purchase_at || attribution.core_finalized_at || "")).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 1000) : 0;
}

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function moneyPart(part: MoneyPart | undefined, fallback: number) {
  return part?.amountMinor != null ? Number(part.amountMinor || 0) / 100 : Number(fallback || 0);
}

function findBody() {
  const dialogs = [...document.querySelectorAll<HTMLElement>('aside[role="dialog"]')];
  const dialog = dialogs.find((node) => node.querySelector("h2")?.textContent?.trim().startsWith("Sipariş #"));
  return dialog?.querySelector<HTMLElement>(":scope > div.flex-1") || null;
}

function findCard(root: HTMLElement, title: string) {
  const titleNode = [...root.querySelectorAll<HTMLElement>("h2,h3")].find((node) => node.textContent?.trim() === title);
  return titleNode?.closest<HTMLElement>("section") || null;
}

function cardBody(card: HTMLElement | null) {
  if (!card) return null;
  return [...card.children].find((child) => child instanceof HTMLElement && child.tagName === "DIV") as HTMLElement | null;
}

function findLabel(body: HTMLElement, label: string) {
  return [...body.querySelectorAll<HTMLElement>("p")].find(
    (node) => node.textContent?.trim().toLocaleLowerCase("tr-TR") === label.toLocaleLowerCase("tr-TR"),
  );
}

function findValue(body: HTMLElement, label: string) {
  return findLabel(body, label)?.parentElement?.children?.[1] as HTMLElement | undefined;
}

function setValue(body: HTMLElement, label: string, value: string) {
  const node = findValue(body, label);
  if (!node || node.textContent?.trim() === value) return;
  node.textContent = value;
  node.classList.remove("font-mono", "break-all");
}

function setRowVisible(body: HTMLElement, label: string, visible: boolean) {
  const row = findLabel(body, label)?.parentElement as HTMLElement | null;
  if (!row) return;
  const next = visible ? "" : "none";
  if (row.style.display !== next) row.style.display = next;
}

function translateText(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue?.trim() || "";
    if (textMap[value] && node.nodeValue) node.nodeValue = node.nodeValue.replace(value, textMap[value]);
    node = walker.nextNode();
  }
}

function friendlyReferrer(value: string) {
  if (!value || value === "—") return "Doğrudan ziyaret";
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host.includes("instagram.com")) return "Instagram'dan geldi";
    if (host.includes("facebook.com") || host.includes("fb.com")) return "Facebook'tan geldi";
    if (host.includes("google.")) return "Google'dan geldi";
    return `${host} üzerinden geldi`;
  } catch {
    return textMap[value] || value.replaceAll("_", " ");
  }
}

function simplify(body: HTMLElement, order: InsightOrder) {
  const fallback = inferredDuration(order);
  const total = asNumber(order.total_session_duration_seconds) || fallback;
  const purchase = asNumber(order.purchase_session_duration_seconds) || fallback;

  setValue(body, "Toplam Süre", durationText(total));
  setValue(body, "Sitede geçirdiği toplam süre", durationText(total));
  setValue(body, "Satın Alma Süresi", durationText(purchase));
  setValue(body, "Sipariş verene kadar geçen süre", durationText(purchase));

  const referrer = findValue(body, "Yönlendiren Kaynak")?.textContent?.trim()
    || findValue(body, "Siteye geldiği yer")?.textContent?.trim()
    || "";
  if (referrer) {
    setValue(body, "Yönlendiren Kaynak", friendlyReferrer(referrer));
    setValue(body, "Siteye geldiği yer", friendlyReferrer(referrer));
  }

  for (const label of hideLabels) setRowVisible(body, label, false);
  setRowVisible(body, "Ürün Adedi", false);

  for (const [oldLabel, newLabel] of Object.entries(renameLabels)) {
    const node = findLabel(body, oldLabel);
    if (node && node.textContent !== newLabel) node.textContent = newLabel;
  }

  for (const [oldTitle, newTitle] of Object.entries(renameSections)) {
    const heading = [...body.querySelectorAll<HTMLElement>("h2,h3")].find((node) => node.textContent?.trim() === oldTitle);
    if (heading) heading.textContent = newTitle;
  }

  const cardProgram = findValue(body, "Kart Programı")?.textContent?.trim() || "";
  setRowVisible(body, "Kart Programı", Boolean(cardProgram && cardProgram !== "—"));

  const installmentFee = findValue(body, "Taksit Farkı")?.textContent?.trim() || "";
  setRowVisible(body, "Taksit Farkı", Boolean(installmentFee && installmentFee !== "—" && !/^₺?\s*0([,.]00)?\s*₺?$/.test(installmentFee)));

  const cancelledAt = findValue(body, "İptal zamanı")?.textContent?.trim() || findValue(body, "İptal Zamanı")?.textContent?.trim() || "";
  setRowVisible(body, "İptal zamanı", Boolean(cancelledAt && cancelledAt !== "—"));
  setRowVisible(body, "İptal Zamanı", Boolean(cancelledAt && cancelledAt !== "—"));

  const deliveredAt = findValue(body, "Teslim Zamanı")?.textContent?.trim() || "";
  setRowVisible(body, "Teslim Zamanı", Boolean(deliveredAt && deliveredAt !== "—"));

  const campaign = findValue(body, "Kampanya")?.textContent?.trim() || "";
  setRowVisible(body, "Kampanya", Boolean(campaign && campaign !== "—"));

  for (const paragraph of body.querySelectorAll<HTMLElement>("p")) {
    const text = paragraph.textContent?.trim() || "";
    if (text.startsWith("Hesaplama:") || text.startsWith("Ödeme özeti fallback nedeni:")) paragraph.style.display = "none";
  }

  const raw = [...body.querySelectorAll<HTMLElement>("summary")].find((node) => /Ham (ilişkilendirme|attribution) verisi/i.test(node.textContent || ""));
  if (raw?.parentElement) raw.parentElement.style.display = "none";
}

function ensureAnchorAfter(reference: HTMLElement | null, key: string) {
  if (!reference?.parentElement) return null;
  const parent = reference.parentElement;
  let anchor = [...parent.children].find((child) => child instanceof HTMLElement && child.dataset.orderEnhancerAnchor === key) as HTMLElement | undefined;
  if (!anchor) {
    anchor = document.createElement("div");
    anchor.dataset.orderEnhancerAnchor = key;
    reference.after(anchor);
  } else if (reference.nextElementSibling !== anchor) {
    reference.after(anchor);
  }
  return anchor;
}

function ensureAnchorInside(card: HTMLElement | null, key: string) {
  const body = cardBody(card);
  if (!body) return null;
  let anchor = body.querySelector<HTMLElement>(`[data-order-enhancer-anchor="${key}"]`);
  if (!anchor) {
    anchor = document.createElement("div");
    anchor.dataset.orderEnhancerAnchor = key;
    body.append(anchor);
  }
  return anchor;
}

function cleanDeliveryAddress(body: HTMLElement) {
  const recipient = findValue(body, "Alıcı")?.textContent?.trim() || "";
  setRowVisible(body, "Alıcı", false);
  const addressCard = findCard(body, "Teslimat Adresi");
  const addressBody = cardBody(addressCard);
  const paragraph = addressBody?.querySelector<HTMLElement>("p.text-sm");
  if (!paragraph || !recipient) return;
  const text = paragraph.textContent?.trim() || "";
  if (!text.startsWith(recipient)) return;
  const next = text.slice(recipient.length).replace(/^\s*,\s*/, "");
  if (next && paragraph.textContent !== next) paragraph.textContent = next;
}

function orderLayout(body: HTMLElement) {
  const content = body.firstElementChild as HTMLElement | null;
  if (!content) return { customerTarget: null, pricingTarget: null, mailTarget: null };

  const products = findCard(body, "Sipariş Ürünleri");
  const customer = findCard(body, "Müşteri");
  const address = findCard(body, "Teslimat Adresi");
  const customerAddressGroup = customer?.parentElement && customer.parentElement === address?.parentElement ? customer.parentElement as HTMLElement : null;
  const cargo = findCard(body, "Kargo ve Teslimat");
  const operation = findCard(body, "Sipariş Durumu") || findCard(body, "Operasyon Durumu");
  const oldPricing = findCard(body, "Tutar Özeti") || findCard(body, "Fiyat ve İndirim Kırılımı");

  if (products && content.firstElementChild !== products) content.insertBefore(products, content.firstElementChild);
  if (products && customerAddressGroup && products.nextElementSibling !== customerAddressGroup) content.insertBefore(customerAddressGroup, products.nextElementSibling);
  if (customerAddressGroup && cargo && customerAddressGroup.nextElementSibling !== cargo) content.insertBefore(cargo, customerAddressGroup.nextElementSibling);

  if (oldPricing) {
    oldPricing.style.display = "none";
    oldPricing.setAttribute("aria-hidden", "true");
  }

  cleanDeliveryAddress(body);

  return {
    customerTarget: cardBody(customer),
    pricingTarget: ensureAnchorInside(products, "pricing"),
    mailTarget: ensureAnchorAfter(operation, "mail-progress"),
  };
}

function enhanceProductPrices(body: HTMLElement, order: InsightOrder | null, discounts: Record<string, DiscountPricing>) {
  const productsCard = findCard(body, "Sipariş Ürünleri");
  if (!productsCard || !order?.order_items?.length) return;
  const names = [...productsCard.querySelectorAll<HTMLElement>("p.truncate.text-sm.font-medium.text-main")];

  names.forEach((nameNode, index) => {
    const row = nameNode.closest<HTMLElement>("div.flex.items-center.gap-3");
    const item = order.order_items?.[index];
    if (!row || !item) return;
    const priceBox = [...row.children].find((child) => child instanceof HTMLElement && child.classList.contains("text-right")) as HTMLElement | undefined;
    if (!priceBox) return;

    const pricing = item.product_id ? discounts[String(item.product_id)] : undefined;
    const unitPrice = Number(item.unit_price || 0);
    const quantity = Math.max(1, Number(item.quantity || 1));
    const orderTotal = Number(item.total_price || unitPrice * quantity);
    const hasAppliedDiscount = Boolean(
      pricing?.hasDiscount
      && Number(pricing.originalPrice || 0) > unitPrice + 0.001
      && Math.abs(Number(pricing.discountedPrice || 0) - unitPrice) < 0.02,
    );

    const existing = priceBox.querySelector<HTMLElement>("[data-order-discount-price]");
    [...priceBox.children].forEach((child) => {
      if (!(child instanceof HTMLElement) || child === existing) return;
      const desired = hasAppliedDiscount ? "none" : "";
      if (child.style.display !== desired) child.style.display = desired;
    });

    if (!hasAppliedDiscount || !pricing) {
      existing?.remove();
      return;
    }

    const currency = order.currency || "TRY";
    const originalTotal = Number(pricing.originalPrice || 0) * quantity;
    const signature = [originalTotal, orderTotal, quantity, unitPrice, currency].join("|");
    let block = existing;
    if (!block) {
      block = document.createElement("div");
      block.dataset.orderDiscountPrice = "true";
      priceBox.append(block);
    }
    if (block.dataset.signature === signature) return;
    block.dataset.signature = signature;
    block.replaceChildren();

    const original = document.createElement("p");
    original.className = "text-[10px] text-subtle line-through";
    original.textContent = money(originalTotal, currency);
    const discounted = document.createElement("p");
    discounted.className = "text-sm font-semibold text-main";
    discounted.textContent = money(orderTotal, currency);
    const unit = document.createElement("p");
    unit.className = "text-[10px] text-muted";
    unit.textContent = `${quantity} adet · ${money(unitPrice, currency)}`;
    block.append(original, discounted, unit);
  });
}

export function ExactOrderDetailEnhancer() {
  const orderId = useSearchParams().get("order") || "";
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [customerTarget, setCustomerTarget] = useState<HTMLElement | null>(null);
  const [pricingTarget, setPricingTarget] = useState<HTMLElement | null>(null);
  const [mailTarget, setMailTarget] = useState<HTMLElement | null>(null);
  const [order, setOrder] = useState<InsightOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<InsightOrder | null>(null);
  const [customer, setCustomer] = useState<CustomerSummary>({ isMember: false, rewardPoints: 0 });
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [discounts, setDiscounts] = useState<Record<string, DiscountPricing>>({});

  useEffect(() => {
    const sync = () => {
      const body = findBody();
      setTarget(body);
      if (!body) {
        setCustomerTarget(null);
        setPricingTarget(null);
        setMailTarget(null);
        return;
      }
      if (body.parentElement) translateText(body.parentElement);
      if (order) simplify(body, order);
      const layout = orderLayout(body);
      setCustomerTarget(layout.customerTarget);
      setPricingTarget(layout.pricingTarget);
      setMailTarget(layout.mailTarget);
      enhanceProductPrices(body, detailOrder, discounts);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [detailOrder, discounts, order, orderId]);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    void Promise.all([
      adminRequest<{ order?: InsightOrder; customer?: CustomerSummary; emailLogs?: EmailLog[] }>(
        `/api/orders/insights?order_id=${encodeURIComponent(orderId)}`,
        { force: true, ttlMs: 0, staleMs: 0 },
      ),
      adminRequest<{ orders?: InsightOrder[] }>(
        "/api/orders?range=all&payment=all&q=",
        { force: true, ttlMs: 0, staleMs: 0 },
      ).catch(() => ({ orders: [] })),
      adminRequest<{ pricing?: DiscountPricing[] }>(
        "/api/products/discount-pricing",
        { force: true, ttlMs: 0, staleMs: 0 },
      ).catch(() => ({ pricing: [] })),
    ]).then(([insights, ordersResult, discountResult]) => {
      if (cancelled) return;
      setOrder(insights.order || null);
      setCustomer(insights.customer || { isMember: false, rewardPoints: 0 });
      setEmailLogs(insights.emailLogs || []);
      setDetailOrder((ordersResult.orders || []).find((entry) => String(entry.id) === orderId) || insights.order || null);
      setDiscounts(Object.fromEntries((discountResult.pricing || []).map((entry) => [String(entry.productId), entry])));
    }).catch(() => {
      if (!cancelled) {
        setOrder(null);
        setDetailOrder(null);
        setEmailLogs([]);
        setDiscounts({});
      }
    });
    return () => { cancelled = true; };
  }, [orderId]);

  const heat = useMemo(() => {
    if (!order) return null;
    const score = heatScore(order);
    return { score, label: heatLabel(score), reason: heatReason(order, score) };
  }, [order]);

  const mailProgress = useMemo(() => {
    const stages = emailStages.map((stage) => {
      const matches = emailLogs.filter((log) => stage.templates.some((template) => template === String(log.template_key || "")));
      const sent = matches.some((log) => String(log.status).toLowerCase() === "sent");
      const failed = !sent && matches.some((log) => String(log.status).toLowerCase() === "failed");
      return { ...stage, sent, failed };
    });
    return { stages, complete: stages.every((stage) => stage.sent) };
  }, [emailLogs]);

  const pricingSummary = useMemo(() => {
    if (!detailOrder) return null;
    const pricing = detailOrder.pricing || null;
    const currency = detailOrder.currency || "TRY";
    return {
      currency,
      subtotal: moneyPart(pricing?.subtotal, Number(detailOrder.subtotal || 0)),
      discount: Math.abs(moneyPart(pricing?.discount, Number(detailOrder.discount_total || 0))),
      points: Math.abs(moneyPart(pricing?.pointsDiscount, Number(detailOrder.reward_discount_total || 0))),
      shipping: moneyPart(pricing?.shipping, Number(detailOrder.shipping_fee || 0)),
      tax: moneyPart(pricing?.tax, Number(detailOrder.tax_total || 0)),
      total: moneyPart(pricing?.total, Number(detailOrder.total_amount || 0)),
    };
  }, [detailOrder]);

  if (!target || !heat) return null;

  return <>
    {customerTarget ? createPortal(
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border-subtle pt-4" data-friendly-customer-summary>
        <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-subtle">Üyelik durumu</p>
          <p className="mt-1 text-xs font-semibold text-main">{customer.isMember ? "Üye müşteri" : "Misafir müşteri"}</p>
          <p className="mt-1 text-[9px] leading-relaxed text-muted">{customer.isMember ? "Sitede hesabı bulunuyor." : "Hesap oluşturmadan sipariş vermiş."}</p>
        </div>
        <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-subtle">ROSTA Points</p>
          <p className="mt-1 text-xs font-semibold text-main">{Math.max(0, Number(customer.rewardPoints || 0)).toLocaleString("tr-TR")} puan</p>
          <p className="mt-1 text-[9px] leading-relaxed text-muted">Şu an kullanılabilir puan bakiyesi.</p>
        </div>
      </div>,
      customerTarget,
    ) : null}

    {pricingTarget && pricingSummary ? createPortal(
      <div className="mt-4 border-t border-border-subtle pt-4" data-order-pricing-summary>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Sipariş toplamı</p>
            <p className="mt-1 text-[11px] text-muted">Ürünler, indirimler ve kargo dahil</p>
          </div>
          <strong className="text-xl font-semibold text-main">{money(pricingSummary.total, pricingSummary.currency)}</strong>
        </div>
        <div className="mt-4 space-y-2 rounded-[var(--radius-small)] bg-surface-secondary p-3">
          <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted">Ara toplam</span><span className="font-medium text-main">{money(pricingSummary.subtotal, pricingSummary.currency)}</span></div>
          {pricingSummary.discount > 0 ? <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted">Uygulanan ürün indirimi</span><span className="font-semibold text-accent">−{money(pricingSummary.discount, pricingSummary.currency)}</span></div> : null}
          {pricingSummary.points > 0 ? <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted">ROSTA Points indirimi</span><span className="font-semibold text-accent">−{money(pricingSummary.points, pricingSummary.currency)}</span></div> : null}
          <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted">Kargo ücreti</span><span className="font-medium text-main">{pricingSummary.shipping > 0 ? money(pricingSummary.shipping, pricingSummary.currency) : "Ücretsiz"}</span></div>
          {pricingSummary.tax > 0 ? <div className="flex items-center justify-between gap-3 text-xs"><span className="text-muted">Vergi</span><span className="font-medium text-main">{money(pricingSummary.tax, pricingSummary.currency)}</span></div> : null}
        </div>
      </div>,
      pricingTarget,
    ) : null}

    {mailTarget ? createPortal(
      <section className="mb-5 rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4 shadow-card" data-order-mail-progress>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Müşteriye gönderilen mailler</p>
            <h3 className="mt-1 text-base font-semibold text-main">{mailProgress.complete ? "Mailler tamamlandı" : "Mail süreci devam ediyor"}</h3>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
            {mailProgress.complete ? <Check className="h-5 w-5" /> : <MailCheck className="h-5 w-5" />}
          </div>
        </div>
        <div className="relative mt-5">
          <div className="absolute left-[12.5%] right-[12.5%] top-2 grid grid-cols-3 overflow-hidden rounded-full">
            {mailProgress.stages.slice(0, -1).map((stage, index) => {
              const nextStage = mailProgress.stages[index + 1];
              const completedConnection = stage.sent && Boolean(nextStage?.sent);
              return <span key={`${stage.key}-line`} className={`h-1 ${completedConnection ? "bg-accent" : "bg-surface-tertiary"}`} />;
            })}
          </div>
          <div className="relative z-10 grid grid-cols-4 gap-1">
            {mailProgress.stages.map((stage) => (
              <div key={stage.key} className="flex flex-col items-center text-center">
                <span className={`h-5 w-5 rounded-full border-4 border-surface-primary ${stage.sent ? "bg-accent" : stage.failed ? "bg-danger" : "bg-surface-tertiary"}`} />
                <span className="mt-2 text-[9px] font-semibold leading-tight text-main">{stage.label}</span>
                <span className={`mt-1 text-[8px] ${stage.sent ? "text-accent" : stage.failed ? "text-danger" : "text-subtle"}`}>{stage.sent ? "Gönderildi" : stage.failed ? "Gönderilemedi" : "Bekliyor"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>,
      mailTarget,
    ) : null}

    {createPortal(
      <section className="mb-5 mt-5 rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Müşteri sıcaklığı</p>
            <h3 className="mt-1 text-base font-semibold text-main">{heat.label}</h3>
            <p className="mt-1 text-xs text-muted">Satın alma davranışlarına göre otomatik hesaplanır.</p>
          </div>
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-accent-soft text-accent">
            <Flame className="h-4 w-4" />
            <strong className="text-sm">{heat.score}</strong>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-tertiary"><div className="h-full rounded-full bg-accent" style={{ width: `${heat.score}%` }} /></div>
        <div className="mt-2 flex justify-between text-[9px] text-subtle"><span>Soğuk</span><span>Ilık</span><span>Sıcak</span></div>
        <div className="mt-3 rounded-[var(--radius-small)] bg-surface-secondary p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-subtle">Neden bu sıcaklık?</p>
          <p className="mt-1 text-[11px] leading-5 text-muted">{heat.reason}</p>
        </div>
      </section>,
      target,
    )}
  </>;
}
