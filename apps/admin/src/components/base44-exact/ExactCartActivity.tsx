"use client";

import {
  Clock3,
  MapPin,
  Package,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactIconButton,
  ExactPageHeader,
  ExactSegmentedControl,
  ExactSkeleton,
  useExactToast,
} from "./primitives";
import { ExactDataCard, ExactEmptyState, ExactMetricCard } from "./data";

type RangeKey = "today" | "7d" | "30d" | "90d";

type CartItem = {
  product_slug: string;
  product_name: string;
  variant_id: string | null;
  quantity: number;
  price: number;
  image_url: string | null;
};

type CartActivity = {
  session_id: string;
  created_at: string;
  last_activity_at: string;
  path: string | null;
  source: string;
  medium: string;
  campaign: string | null;
  city: string | null;
  country: string | null;
  device_type: string | null;
  item_count: number;
  quantity: number;
  estimated_amount: number;
  items: CartItem[];
  checkout_draft_id?: string | null;
  is_abandoned?: boolean;
  is_recovered?: boolean;
};

type Payload = {
  carts?: CartActivity[];
  totals?: {
    carts?: number;
    products?: number;
    estimated_amount?: number;
  };
  truncated?: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    direct: "Doğrudan",
    instagram_paid: "Instagram reklam",
    instagram_organic: "Instagram organik",
    facebook_paid: "Facebook reklam",
    facebook_organic: "Facebook organik",
    google_paid: "Google reklam",
    google_organic: "Google organik",
    tiktok_paid: "TikTok reklam",
    tiktok_organic: "TikTok organik",
    referral: "Yönlendirme",
  };
  return labels[source] || source || "Doğrudan";
}

function deviceLabel(device: string | null) {
  if (device === "mobile") return "Mobil";
  if (device === "tablet") return "Tablet";
  if (device === "desktop") return "Masaüstü";
  return "Cihaz bilinmiyor";
}

function shortSession(sessionId: string) {
  const clean = String(sessionId || "").replace(/[^a-zA-Z0-9]/g, "");
  return clean.slice(-6).toLocaleUpperCase("tr-TR") || "SEPET";
}

function ProductImage({ item }: { item: CartItem }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="h-16 w-14 shrink-0 overflow-hidden radius-small bg-surface-tertiary">
      {item.image_url && !failed ? (
        <img
          src={item.image_url}
          alt={item.product_name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-subtle">
          <Package className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

export function ExactCartActivity() {
  const toast = useExactToast();
  const [range, setRange] = useState<RangeKey>("today");
  const [carts, setCarts] = useState<CartActivity[]>([]);
  const [totals, setTotals] = useState({ carts: 0, products: 0, estimated_amount: 0 });
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await adminRequest<Payload>(`/api/dashboard/cart-activity?range=${range}`, {
        force: silent,
        ttlMs: 20_000,
        staleMs: 5 * 60_000,
      });
      setCarts(result.carts || []);
      setTotals({
        carts: Number(result.totals?.carts || 0),
        products: Number(result.totals?.products || 0),
        estimated_amount: Number(result.totals?.estimated_amount || 0),
      });
      setTruncated(Boolean(result.truncated));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Sepet aktivitesi alınamadı.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [range, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="cart-activity">
      <ExactPageHeader
        title="Sepetler"
        subtitle="Müşterilerin sepete eklediği ürünleri oturum bazında görüntüle"
        actions={(
          <>
            <ExactSegmentedControl
              size="sm"
              value={range}
              onChange={(value) => setRange(value as RangeKey)}
              options={[
                { value: "today", label: "Bugün" },
                { value: "7d", label: "7G" },
                { value: "30d", label: "30G" },
                { value: "90d", label: "90G" },
              ]}
            />
            <ExactIconButton
              icon={RefreshCw}
              label="Sepetleri yenile"
              variant="secondary"
              onClick={() => void load(true)}
            />
          </>
        )}
      />

      {truncated ? (
        <div className="ruth-type-caption radius-control border border-warning/20 bg-warning-soft px-3 py-2.5 text-warning-foreground">
          Çok yoğun trafik nedeniyle en son 1000 sepet olayı gösteriliyor.
        </div>
      ) : null}

      {loading ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <ExactSkeleton className="h-28" />
            <ExactSkeleton className="h-28" />
            <ExactSkeleton className="col-span-2 h-28 lg:col-span-1" />
          </div>
          <div className="space-y-3">
            <ExactSkeleton className="h-44" />
            <ExactSkeleton className="h-44" />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <ExactMetricCard label="Sepet Oturumu" value={totals.carts} icon={ShoppingCart} />
            <ExactMetricCard label="Eklenen Ürün" value={totals.products} icon={Package} />
            <ExactMetricCard
              label="Tahmini Sepet Değeri"
              value={totals.estimated_amount}
              format="currency"
              icon={WalletCards}
              className="col-span-2 lg:col-span-1"
            />
          </div>

          {!carts.length ? (
            <ExactEmptyState
              icon={ShoppingCart}
              title="Bu aralıkta sepet yok"
              description="Bir ürün sepete eklendiğinde burada ürünleriyle birlikte görünecek."
            />
          ) : (
            <div className="space-y-3">
              {carts.map((cart) => (
                <ExactDataCard
                  key={cart.session_id}
                  title={`Sepet #${shortSession(cart.session_id)}`}
                  action={(
                    <div className="flex items-center gap-2">
                      {cart.is_abandoned ? <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning-foreground">Terk edildi</span> : null}
                      {cart.is_recovered ? <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success-foreground">Siparişe döndü</span> : null}
                      <span className="text-subtle">{dateTime(cart.last_activity_at)}</span>
                    </div>
                  )}
                >
                  <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 ruth-type-caption text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5 text-subtle" />
                      {dateTime(cart.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Smartphone className="h-3.5 w-3.5 text-subtle" />
                      {deviceLabel(cart.device_type)}
                    </span>
                    {cart.city || cart.country ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-subtle" />
                        {[cart.city, cart.country].filter(Boolean).join(" / ")}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
                      {sourceLabel(cart.source)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {cart.items.map((item, index) => (
                      <div
                        key={`${cart.session_id}-${item.product_slug}-${item.variant_id || "standard"}-${index}`}
                        className="flex items-center gap-3 radius-small bg-surface-secondary p-2.5"
                      >
                        <ProductImage item={item} />
                        <div className="min-w-0 flex-1">
                          <p className="ruth-type-table truncate font-semibold text-main">{item.product_name}</p>
                          <p className="mt-0.5 ruth-type-caption text-subtle">
                            {item.variant_id ? `Varyant · ${item.variant_id.slice(0, 8)}` : "Standart varyant"}
                          </p>
                          <p className="mt-1 ruth-type-caption text-muted">{item.quantity} adet</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="ruth-type-price font-semibold text-main">{money(item.price * item.quantity)}</p>
                          {item.quantity > 1 ? <p className="ruth-type-caption text-subtle">{money(item.price)} / adet</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3">
                    <div>
                      <p className="ruth-type-label text-subtle">Sepetteki ürün</p>
                      <p className="ruth-type-table font-semibold text-main">{cart.quantity} adet</p>
                    </div>
                    <div className="text-right">
                      <p className="ruth-type-label text-subtle">Tahmini değer</p>
                      <p className="ruth-type-price font-bold text-main">{money(cart.estimated_amount)}</p>
                    </div>
                  </div>
                </ExactDataCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
