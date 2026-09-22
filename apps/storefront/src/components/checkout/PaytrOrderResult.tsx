"use client";

import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { CoffeeBeanRain } from "@/components/rewards/CoffeeBeanRain";
import { OrderSuccessRostaPointsAnimation } from "@/components/rewards/OrderSuccessRostaPointsAnimation";
import { useCart } from "@/components/cart/CartProvider";

type PurchaseStatusPayload = {
  eventId?: string;
  orderNo?: string;
  value?: number;
  currency?: string;
  contentIds?: string[];
  numItems?: number;
};

type PaytrStatusResponse = {
  ok?: boolean;
  status?: string;
  purchase?: PurchaseStatusPayload | null;
};

type MetaWindow = Window & {
  fbq?: (...args: unknown[]) => void;
};

const META_PURCHASE_MARKER_PREFIX = "rosta_meta_purchase_sent_v1:";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function trackMetaPurchase(purchase: PurchaseStatusPayload, fallbackOrderNo: string) {
  const eventId = String(purchase.eventId || "").trim();
  const value = Number(purchase.value);
  const fbq = (window as MetaWindow).fbq;
  if (!eventId || !Number.isFinite(value) || value < 0 || !fbq) return false;

  const currencyRaw = String(purchase.currency || "TRY").trim().toUpperCase();
  const contentIds = Array.isArray(purchase.contentIds)
    ? purchase.contentIds.map((id) => String(id).trim()).filter(Boolean).slice(0, 100)
    : [];
  const data: Record<string, unknown> = {
    value,
    currency: currencyRaw === "TL" ? "TRY" : currencyRaw,
    content_type: "product",
    order_id: String(purchase.orderNo || fallbackOrderNo),
  };
  if (contentIds.length) data.content_ids = contentIds;
  if (Number.isFinite(Number(purchase.numItems)) && Number(purchase.numItems) > 0) {
    data.num_items = Math.trunc(Number(purchase.numItems));
  }

  fbq("track", "Purchase", data, { eventID: eventId });
  return true;
}

export function PaytrOrderResult({ orderNo }: { orderNo?: string }) {
  const { clearCart } = useCart();

  useEffect(() => {
    if (!orderNo) return;
    let cancelled = false;

    clearCart();
    window.localStorage.removeItem("rosta-checkout-draft-token");

    // Başarı sayfası görünür kalır; doğrulama ve analytics arka planda çalışır.
    // Kesin order id oluşunca browser Pixel ve server CAPI aynı event_id'yi kullanır.
    const reconcileAndTrackPurchase = async () => {
      for (let attempt = 0; attempt < 12 && !cancelled; attempt += 1) {
        try {
          const response = await fetch(`/api/paytr/status?order=${encodeURIComponent(orderNo)}`, {
            cache: "no-store",
          });
          const data = await response.json().catch(() => null) as PaytrStatusResponse | null;
          if (cancelled) return;
          if (data?.status === "failed" || data?.status === "not_found") return;

          const purchase = data?.status === "paid" ? data.purchase : null;
          const eventId = String(purchase?.eventId || "").trim();
          if (purchase && eventId) {
            const marker = `${META_PURCHASE_MARKER_PREFIX}${eventId}`;
            let alreadyTracked = false;
            try { alreadyTracked = window.localStorage.getItem(marker) === "1"; } catch {}
            if (alreadyTracked) return;

            if (trackMetaPurchase(purchase, orderNo)) {
              try { window.localStorage.setItem(marker, "1"); } catch {}
              return;
            }
          }
        } catch {
          // Analytics/reconciliation hiçbir zaman başarı ekranını bloklamaz.
        }

        if (attempt < 11 && !cancelled) await wait(Math.min(750 + attempt * 250, 2_000));
      }
    };

    void reconcileAndTrackPurchase();
    return () => { cancelled = true; };
  }, [clearCart, orderNo]);

  if (!orderNo) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-gold/15 bg-cream p-6 sm:p-8">
        <p className="text-xs uppercase tracking-wide-luxe text-gold-dark">Sipariş Bilgisi</p>
        <h1 className="mt-2 font-heading text-4xl">Sipariş bilgisi bulunamadı</h1>
        <p className="mt-4 text-sm leading-7 text-muted-ruth">
          Sipariş referansı eksik. Sipariş durumunu hesabından veya sipariş takip ekranından kontrol edebilirsin.
        </p>
      </div>
    );
  }

  return (
    <>
      <CoffeeBeanRain />
      <div className="order-success-card mx-auto max-w-2xl rounded-2xl border border-gold/15 bg-cream p-5 sm:p-8">
        <CheckCircle2 className="order-success-icon mx-auto mb-4 text-gold-dark" size={42} />
        <p className="order-success-eyebrow mb-2 text-[0.65rem] uppercase tracking-wide-luxe text-gold-dark sm:text-xs">
          Sipariş Alındı
        </p>
        <h1 className="order-success-title font-heading text-4xl sm:text-5xl">Siparişiniz Tamamlandı</h1>
        <p className="order-success-copy mx-auto mt-4 max-w-lg text-sm leading-7 text-muted-ruth">
          Ödemen başarıyla tamamlandı. Siparişin ROSTA Coffee Co. sistemine alındı.
        </p>
        <OrderSuccessRostaPointsAnimation orderNo={orderNo} />
      </div>
    </>
  );
}
