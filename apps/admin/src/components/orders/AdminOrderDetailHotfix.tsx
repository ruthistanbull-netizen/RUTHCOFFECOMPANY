"use client";

import { AlertTriangle, Check, RefreshCw, Truck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function normalizedText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

function findOrderDialog() {
  return [...document.querySelectorAll<HTMLElement>('aside[role="dialog"]')]
    .find((node) => node.querySelector("h2")?.textContent?.trim().startsWith("Sipariş #")) || null;
}

function findCard(dialog: HTMLElement, title: string) {
  const heading = [...dialog.querySelectorAll<HTMLElement>("h2,h3")]
    .find((node) => node.textContent?.trim() === title);
  return heading?.closest<HTMLElement>("section") || null;
}

function findShippingButton(root: ParentNode) {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => {
    const text = normalizedText(button.textContent);
    return text === "kargo kodu oluştur" || text === "kargo oluştur";
  }) || null;
}

function mergeHandlers(liveHandlers: Handler[], quotes: Quote[]) {
  const byCode = new Map<string, Handler>();

  for (const handler of liveHandlers) {
    const code = String(handler.code || "").trim();
    if (!code) continue;
    byCode.set(code, {
      ...handler,
      code,
      name: String(handler.name || code).trim() || code,
    });
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
    adminRequest<{ handlers?: Handler[] }>("/api/shipping/basit-kargo/handlers", {
      force: true,
      ttlMs: 0,
      staleMs: 0,
    }),
    adminRequest<{ quotes?: Quote[] }>("/api/shipping/basit-kargo/quotes", {
      method: "POST",
      body: JSON.stringify({ packages }),
    }),
  ]);

  const liveHandlers = handlerResult.status === "fulfilled" && Array.isArray(handlerResult.value.handlers)
    ? handlerResult.value.handlers
    : [];
  const quotes = quoteResult.status === "fulfilled" && Array.isArray(quoteResult.value.quotes)
    ? quoteResult.value.quotes.filter((quote) => quote?.handlerCode && Number.isFinite(Number(quote.price)))
    : [];

  return { handlers: mergeHandlers(liveHandlers, quotes), quotes };
}

function chooseDefaultHandler(handlers: Handler[], quotes: Quote[]) {
  const quotedCodes = new Set(quotes.map((quote) => quote.handlerCode));
  return handlers.find((handler) => !handler.automatic && quotedCodes.has(handler.code))?.code
    || handlers.find((handler) => !handler.automatic)?.code
    || handlers[0]?.code
    || "ECONOMIC";
}

export function AdminOrderDetailHotfix() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order") || "";
  const [mountTarget, setMountTarget] = useState<HTMLElement | null>(null);
  const [order, setOrder] = useState<ShippingOrder | null>(null);
  const [handlers, setHandlers] = useState<Handler[]>(automaticHandlers);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedHandler, setSelectedHandler] = useState("ECONOMIC");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const applyCarrierData = useCallback((carrierData: CarrierData) => {
    const nextHandlers = carrierData.handlers.length ? carrierData.handlers : automaticHandlers;
    setHandlers(nextHandlers);
    setQuotes(carrierData.quotes);
    setSelectedHandler((current) => nextHandlers.some((handler) => handler.code === current)
      ? current
      : chooseDefaultHandler(nextHandlers, carrierData.quotes));
  }, []);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setError(null);
      setSuccess(null);
      setCreating(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSuccess(null);

    void Promise.all([
      adminRequest<{ orders?: ShippingOrder[] }>("/api/orders?range=all&payment=all&q=", {
        force: true,
        ttlMs: 0,
        staleMs: 0,
      }),
      loadCarrierData(),
    ]).then(([orderResult, carrierData]) => {
      if (cancelled) return;
      const nextOrder = (orderResult.orders || []).find((item) => item.id === orderId) || null;
      if (!nextOrder) throw new Error("Sipariş bilgisi bulunamadı. Sayfayı yenileyip tekrar dene.");
      setOrder(nextOrder);
      applyCarrierData(carrierData);
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "Kargo firmaları hazırlanamadı.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [applyCarrierData, orderId]);

  useEffect(() => {
    if (!orderId) {
      setMountTarget(null);
      return;
    }

    let currentMount: HTMLElement | null = null;
    let currentNativeButton: HTMLButtonElement | null = null;

    const restoreNativeButton = () => {
      if (!currentNativeButton) return;
      currentNativeButton.style.removeProperty("display");
      delete currentNativeButton.dataset.orderShippingNativeButton;
      currentNativeButton = null;
    };

    const sync = () => {
      const dialog = findOrderDialog();
      const card = dialog ? findCard(dialog, "Kargo ve Teslimat") : null;
      const nativeButton = card ? findShippingButton(card) : null;

      if (!card || !nativeButton) {
        restoreNativeButton();
        if (currentMount?.isConnected) currentMount.remove();
        currentMount = null;
        setMountTarget(null);
        return;
      }

      if (currentNativeButton && currentNativeButton !== nativeButton) restoreNativeButton();
      currentNativeButton = nativeButton;
      currentNativeButton.dataset.orderShippingNativeButton = "true";
      currentNativeButton.style.display = "none";

      let nextMount = card.querySelector<HTMLElement>('[data-order-shipping-inline-mount="true"]');
      if (!nextMount) {
        nextMount = document.createElement("div");
        nextMount.dataset.orderShippingInlineMount = "true";
        const actionRow = nativeButton.parentElement;
        if (actionRow?.parentElement === card) card.insertBefore(nextMount, actionRow);
        else card.appendChild(nextMount);
      }

      currentMount = nextMount;
      setMountTarget((current) => current === nextMount ? current : nextMount);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      restoreNativeButton();
      if (currentMount?.isConnected) currentMount.remove();
      setMountTarget(null);
    };
  }, [orderId]);

  const refreshCarriers = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      applyCarrierData(await loadCarrierData());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kargo firmaları yenilenemedi.");
    } finally {
      setRefreshing(false);
    }
  }, [applyCarrierData]);

  const createShipment = useCallback(async () => {
    if (!order || !selectedHandler || creating) return;
    const address = order.shipping_address_line || order.shipping_address_text || "";
    if (!order.shipping_city || !order.shipping_town || !address) {
      setError(`${order.order_no} için il, ilçe ve açık adres tamamlanmadan kargo oluşturulamaz.`);
      return;
    }

    const handler = handlers.find((item) => item.code === selectedHandler);
    const quote = quotes.find((item) => item.handlerCode === selectedHandler);
    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await adminRequest("/api/shipping/basit-kargo/shipments", {
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
      });
      setSuccess(`${handler?.name || selectedHandler} ile kargo kodu oluşturuldu.`);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kargo kodu oluşturulamadı.");
      setCreating(false);
    }
  }, [creating, handlers, order, quotes, selectedHandler]);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>("button");
      if (!button) return;
      const text = normalizedText(button.textContent);
      if (text !== "kargo kodu oluştur" && text !== "kargo oluştur" && text !== "seçili firmayla oluştur") return;
      const dialog = button.closest<HTMLElement>('aside[role="dialog"]');
      if (!dialog || !dialog.querySelector("h2")?.textContent?.trim().startsWith("Sipariş #")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void createShipment();
    };

    window.addEventListener("click", onClickCapture, true);
    return () => window.removeEventListener("click", onClickCapture, true);
  }, [createShipment]);

  const quoteMap = useMemo(() => new Map(quotes.map((quote) => [quote.handlerCode, quote])), [quotes]);
  const livePrices = useMemo(() => quotes.map((quote) => Number(quote.price)).filter(Number.isFinite), [quotes]);
  const cheapestPrice = livePrices.length ? Math.min(...livePrices) : null;
  const selected = handlers.find((handler) => handler.code === selectedHandler);

  if (!mountTarget) return null;

  return createPortal(
    <div className="mt-3 border-t border-border-subtle pt-3" data-order-shipping-inline-picker="true">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Kargo firması</p>
          <p className="mt-1 text-xs text-muted">Kargo kodunu oluşturmadan önce firmayı seç.</p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-small)] border border-border-subtle bg-surface-primary px-2.5 text-[10px] font-semibold text-muted transition hover:bg-surface-secondary disabled:opacity-50"
          onClick={() => void refreshCarriers()}
          disabled={refreshing || creating}
        >
          <RefreshCw className={`${refreshing ? styles.spin : ""} h-3.5 w-3.5`} />
          Yenile
        </button>
      </div>

      {loading ? (
        <div className={styles.loading} role="status"><RefreshCw className={styles.spin} /><strong>Kargo firmaları hazırlanıyor</strong></div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert"><AlertTriangle /><span>{error}</span></div>
      ) : null}

      {success ? (
        <div className={styles.success} role="status"><Check /><span>{success}</span></div>
      ) : null}

      {!loading ? (
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
                  name="order-detail-shipping-handler"
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-muted">Seçili firma: <strong className="text-main">{selected?.name || selectedHandler}</strong></span>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 text-xs font-semibold text-accent-foreground transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          onClick={() => void createShipment()}
          disabled={creating || loading || !order || !selectedHandler || Boolean(success)}
        >
          {creating ? <RefreshCw className={`${styles.spin} h-4 w-4`} /> : success ? <Check className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
          {creating ? "Kargo kodu oluşturuluyor" : success ? "Kargo kodu oluşturuldu" : "Seçili firmayla oluştur"}
        </button>
      </div>
    </div>,
    mountTarget,
  );
}
