"use client";

import { AlertTriangle, Check, RefreshCw, Truck } from "lucide-react";
import { Modal } from "@ruth-commerce/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { adminRequest } from "@/lib/adminApi";
import { formatMoney } from "@/lib/format";

import styles from "./OrderShippingCarrierPicker.module.css";

type ShippingOrder = {
  id: string;
  order_no: string;
  shipping_city?: string | null;
  shipping_town?: string | null;
  shipping_neighborhood?: string | null;
  shipping_address_line?: string | null;
  shipping_address_text?: string | null;
};

type Handler = {
  code: string;
  name: string;
  logo?: string | null;
  automatic?: boolean;
};

type Quote = {
  handlerCode: string;
  price: number;
  desiKg?: number | null;
};

type CarrierData = {
  handlers: Handler[];
  quotes: Quote[];
};

const packages = [{ height: 1, width: 1, depth: 1, weight: 1 }];
const automaticHandlers: Handler[] = [
  { code: "ECONOMIC", name: "En Ekonomik (Otomatik)", automatic: true },
  { code: "FAST", name: "En Hızlı (Otomatik)", automatic: true },
];
const ORDER_LOOKUP_TIMEOUT_MS = 5_000;
const CARRIER_LOOKUP_TIMEOUT_MS = 5_500;
const CREATE_SHIPMENT_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizedButtonText(button: HTMLButtonElement) {
  return (button.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

function cardOrderNumber(button: HTMLButtonElement) {
  const value = button
    .closest<HTMLElement>(".cr-order-card")
    ?.querySelector<HTMLElement>(".cr-order-card__number strong")
    ?.textContent;
  return (value || "").replace(/^#/, "").trim();
}

function isOrderShippingButton(button: HTMLButtonElement) {
  const text = normalizedButtonText(button);
  if (text !== "kargo oluştur" && text !== "kargo kodu oluştur") return false;

  if (button.closest(".cr-order-card, .cr-order-detail-content")) return true;

  const drawer = button.closest<HTMLElement>('aside[role="dialog"]');
  const drawerTitle = drawer?.querySelector<HTMLElement>("h2")?.textContent?.trim() || "";
  return drawerTitle.startsWith("Sipariş #");
}

function mergeHandlers(liveHandlers: Handler[], quotes: Quote[]) {
  const byCode = new Map<string, Handler>();

  for (const handler of liveHandlers) {
    const code = String(handler.code || "").trim();
    if (!code) continue;
    byCode.set(code, { ...handler, code, name: String(handler.name || code).trim() || code });
  }

  for (const quote of quotes) {
    const code = String(quote.handlerCode || "").trim();
    if (code && !byCode.has(code)) byCode.set(code, { code, name: code });
  }

  const live = [...byCode.values()].sort((left, right) => left.name.localeCompare(right.name, "tr"));
  return [...live, ...automaticHandlers.filter((automatic) => !byCode.has(automatic.code))];
}

async function loadCarrierData(): Promise<CarrierData> {
  const [handlerResult, quoteResult] = await Promise.allSettled([
    withTimeout(
      adminRequest<{ handlers?: Handler[] }>("/api/shipping/basit-kargo/handlers"),
      CARRIER_LOOKUP_TIMEOUT_MS,
      "Kargo firmaları zamanında alınamadı.",
    ),
    withTimeout(
      adminRequest<{ quotes?: Quote[] }>("/api/shipping/basit-kargo/quotes", {
        method: "POST",
        body: JSON.stringify({ packages }),
      }),
      CARRIER_LOOKUP_TIMEOUT_MS,
      "Kargo fiyatları zamanında alınamadı.",
    ),
  ]);

  const liveHandlers = handlerResult.status === "fulfilled" && Array.isArray(handlerResult.value.handlers)
    ? handlerResult.value.handlers
    : [];
  const quotes = quoteResult.status === "fulfilled" && Array.isArray(quoteResult.value.quotes)
    ? quoteResult.value.quotes.filter((quote) => quote?.handlerCode && Number.isFinite(Number(quote.price)))
    : [];

  return { handlers: mergeHandlers(liveHandlers, quotes), quotes };
}

async function resolveOrder(button: HTMLButtonElement) {
  const orderNumber = cardOrderNumber(button);
  const selectedOrderId = new URLSearchParams(window.location.search).get("order");
  const result = await withTimeout(
    adminRequest<{ orders?: ShippingOrder[] }>(
      `/api/orders?range=all&payment=all&q=${encodeURIComponent(orderNumber)}`,
    ),
    ORDER_LOOKUP_TIMEOUT_MS,
    "Sipariş bilgisi zamanında alınamadı. Sayfayı yenileyip tekrar dene.",
  );
  const orders = Array.isArray(result.orders) ? result.orders : [];
  const order = selectedOrderId
    ? orders.find((item) => item.id === selectedOrderId)
    : orders.find((item) => String(item.order_no) === orderNumber);

  if (!order) throw new Error("Sipariş bilgisi bulunamadı. Sayfayı yenileyip tekrar dene.");
  return order;
}

export function OrderShippingCarrierPicker({ children }: { children: ReactNode }) {
  const carrierCacheRef = useRef<CarrierData | null>(null);
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<ShippingOrder | null>(null);
  const [handlers, setHandlers] = useState<Handler[]>(automaticHandlers);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedHandler, setSelectedHandler] = useState("ECONOMIC");
  const [loading, setLoading] = useState(false);
  const [refreshingCarriers, setRefreshingCarriers] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const close = useCallback(() => {
    if (creating) return;
    setOpen(false);
    setOrder(null);
    setError(null);
    setSuccess(null);
    setRefreshingCarriers(false);
  }, [creating]);

  const applyCarrierData = useCallback((carrierData: CarrierData) => {
    carrierCacheRef.current = carrierData;
    setHandlers(carrierData.handlers.length ? carrierData.handlers : automaticHandlers);
    setQuotes(carrierData.quotes);
    setSelectedHandler((current) => {
      if (carrierData.handlers.some((handler) => handler.code === current)) return current;
      const quotedCodes = new Set(carrierData.quotes.map((quote) => quote.handlerCode));
      const firstLive = carrierData.handlers.find((handler) => !handler.automatic && quotedCodes.has(handler.code))
        || carrierData.handlers.find((handler) => !handler.automatic)
        || carrierData.handlers[0]
        || automaticHandlers[0];
      return firstLive?.code || "ECONOMIC";
    });
  }, []);

  const openPicker = useCallback(async (button: HTMLButtonElement) => {
    setOpen(true);
    setLoading(true);
    setCreating(false);
    setError(null);
    setSuccess(null);
    setOrder(null);
    setHandlers(carrierCacheRef.current?.handlers?.length ? carrierCacheRef.current.handlers : automaticHandlers);
    setQuotes(carrierCacheRef.current?.quotes || []);
    setSelectedHandler("ECONOMIC");

    try {
      const nextOrder = await resolveOrder(button);
      setOrder(nextOrder);
      setLoading(false);

      if (carrierCacheRef.current) {
        applyCarrierData(carrierCacheRef.current);
        return;
      }

      setRefreshingCarriers(true);
      void loadCarrierData()
        .then((carrierData) => applyCarrierData(carrierData))
        .finally(() => setRefreshingCarriers(false));
    } catch (caught) {
      setLoading(false);
      setRefreshingCarriers(false);
      setError(caught instanceof Error ? caught.message : "Sipariş bilgisi alınamadı.");
    }
  }, [applyCarrierData]);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button || !isOrderShippingButton(button)) return;

      event.preventDefault();
      event.stopPropagation();
      void openPicker(button);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, [openPicker]);

  const createShipment = useCallback(async () => {
    if (!order || !selectedHandler) return;
    const address = order.shipping_address_line || order.shipping_address_text || "";
    if (!order.shipping_city || !address) {
      setError(`${order.order_no} için il ve açık adres tamamlanmadan kargo oluşturulamaz.`);
      return;
    }

    const handler = handlers.find((item) => item.code === selectedHandler);
    const quote = quotes.find((item) => item.handlerCode === selectedHandler);
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await withTimeout(
        adminRequest("/api/shipping/basit-kargo/shipments", {
          method: "POST",
          body: JSON.stringify({
            orderId: order.id,
            handlerCode: selectedHandler,
            handlerName: handler?.name || selectedHandler,
            quotedPrice: quote?.price ?? null,
            packages,
            recipient: {
              city: order.shipping_city || "",
              town: order.shipping_town || "",
              neighborhood: order.shipping_neighborhood || "",
              address,
            },
          }),
        }),
        CREATE_SHIPMENT_TIMEOUT_MS,
        "Kargo oluşturma servisi zamanında yanıt vermedi. Tekrar deneyebilirsin.",
      );
      setSuccess(`${handler?.name || selectedHandler} ile kargo kodu oluşturuldu.`);
      window.setTimeout(() => window.location.reload(), 650);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kargo kodu oluşturulamadı.");
      setCreating(false);
    }
  }, [handlers, order, quotes, selectedHandler]);

  const quoteMap = new Map(quotes.map((quote) => [quote.handlerCode, quote]));
  const livePrices = quotes.map((quote) => Number(quote.price)).filter(Number.isFinite);
  const cheapestPrice = livePrices.length ? Math.min(...livePrices) : null;

  return (
    <>
      <div className={styles.captureRoot}>{children}</div>
      <Modal
        open={open}
        title={order ? `#${order.order_no} için kargo firması` : "Kargo firması seç"}
        description="Kargo kodunun oluşturulacağı firmayı seç. Firma logoları ve canlı fiyatlar hazır oldukça aşağıda görünür."
        size="sm"
        onClose={close}
        dismissible={!creating}
        footer={
          <div className="cr-shared-overlay-actions">
            <button className="cr-button cr-button--secondary" type="button" onClick={close} disabled={creating}>Vazgeç</button>
            <button
              className="cr-button cr-button--primary"
              type="button"
              onClick={() => void createShipment()}
              disabled={creating || !order || !selectedHandler || Boolean(success)}
            >
              {creating ? <RefreshCw className={styles.spin} /> : success ? <Check /> : <Truck />}
              {creating ? "Oluşturuluyor" : success ? "Oluşturuldu" : "Seçili firmayla oluştur"}
            </button>
          </div>
        }
      >
        {loading ? (
          <div className={styles.loading} role="status"><RefreshCw className={styles.spin} /><strong>Sipariş bilgisi hazırlanıyor</strong></div>
        ) : null}

        {!loading && refreshingCarriers ? (
          <div className={styles.loading} role="status"><RefreshCw className={styles.spin} /><strong>Firma logoları ve fiyatlar güncelleniyor; otomatik seçenekler şu an kullanılabilir.</strong></div>
        ) : null}

        {error ? (
          <div className={styles.error} role="alert"><AlertTriangle /><span>{error}</span></div>
        ) : null}

        {success ? (
          <div className={styles.success} role="status"><Check /><span>{success}</span></div>
        ) : null}

        {!loading && order ? (
          <div className={styles.orderSummary}>
            <span>Teslimat</span>
            <strong>{[order.shipping_town, order.shipping_city].filter(Boolean).join(" / ") || "Adres eksik"}</strong>
          </div>
        ) : null}

        {!loading && handlers.length ? (
          <fieldset className={styles.carrierList} disabled={creating || Boolean(success)}>
            <legend className={styles.srOnly}>Kargo firması</legend>
            {handlers.map((handler) => {
              const quote = quoteMap.get(handler.code);
              const isCheapest = !handler.automatic && quote && cheapestPrice !== null && Number(quote.price) === cheapestPrice;
              return (
                <label
                  className={`${styles.carrierOption} ${selectedHandler === handler.code ? styles.carrierOptionSelected : ""}`}
                  key={handler.code}
                >
                  <input
                    className={styles.radio}
                    type="radio"
                    name="shipping-handler"
                    value={handler.code}
                    checked={selectedHandler === handler.code}
                    onChange={() => setSelectedHandler(handler.code)}
                  />
                  <span className={styles.logo} aria-hidden="true">
                    {handler.logo ? <img src={handler.logo} alt="" /> : <Truck />}
                  </span>
                  <span className={styles.carrierCopy}>
                    <strong>{handler.name}</strong>
                    <small>{handler.automatic ? "Firma sistem tarafından seçilir" : quote ? `${quote.desiKg || 1} desi canlı fiyat` : "Fiyat oluşturma sırasında hesaplanır"}</small>
                  </span>
                  <span className={styles.carrierMeta}>
                    {isCheapest ? <em>En uygun</em> : null}
                    <b>{quote ? formatMoney(Number(quote.price), "TRY") : "—"}</b>
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : null}
      </Modal>
    </>
  );
}
