"use client";

import Link from "next/link";
import { LogOut, Mail, MapPin, PackageCheck, Phone, Truck, UserRound } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { OrderReviewButton } from "@/components/reviews/OrderReviewButton";
import { formatPrice } from "@/lib/formatPrice";

type OrderItem = {
  id: string;
  product_id?: string | null;
  product_slug?: string | null;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
};

type ShippingEvent = {
  id: string;
  status?: string | null;
  status_label?: string | null;
  event_time?: string | null;
  created_at: string;
};

type ReturnCase = {
  id: string;
  type: string;
  status: string;
  reason?: string | null;
  refund_status?: string | null;
  refund_reference?: string | null;
};

type AccountOrder = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  shipping_address_text?: unknown;
  shipping_status?: string | null;
  shipping_events?: ShippingEvent[];
  return_cases?: ReturnCase[];
  order_items?: OrderItem[];
};

type Profile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
};

const orderStatusLabels: Record<string, string> = {
  awaiting_payment: "Ödeme Bekleniyor",
  pending: "Sipariş Alındı",
  created: "Sipariş Alındı",
  new: "Sipariş Alındı",
  paid: "Sipariş Alındı",
  confirmed: "Sipariş Alındı",
  queued: "Hazırlanıyor",
  preparing: "Hazırlanıyor",
  in_production: "Hazırlanıyor",
  processing: "Hazırlanıyor",
  quality_control: "Kalite Kontrol",
  prepared: "Kargoya Hazır",
  ready: "Kargoya Hazır",
  ready_to_ship: "Kargoya Hazır",
  label_created: "Kargoya Hazır",
  ready_for_handover: "Kargoya Hazır",
  shipped: "Kargoda",
  in_transit: "Kargoda",
  out_for_delivery: "Dağıtıma Çıktı",
  delivered: "Teslim Edildi",
  completed: "Teslim Edildi",
  fulfilled: "Teslim Edildi",
  cancelled: "İptal Edildi",
  canceled: "İptal Edildi",
};

const shippingStatusLabels: Record<string, string> = {
  not_created: "Hazırlanıyor",
  created: "Hazırlanıyor",
  preparing: "Hazırlanıyor",
  queued: "Hazırlanıyor",
  in_production: "Hazırlanıyor",
  processing: "Hazırlanıyor",
  prepared: "Kargoya Hazır",
  ready: "Kargoya Hazır",
  ready_to_ship: "Kargoya Hazır",
  label_created: "Kargoya Hazır",
  ready_for_handover: "Kargoya Hazır",
  shipped: "Kargoda",
  in_transit: "Kargoda",
  out_for_delivery: "Dağıtıma Çıktı",
  delivered: "Teslim Edildi",
  completed: "Teslim Edildi",
  returned: "İade Sürecinde",
  cancelled: "İptal Edildi",
  canceled: "İptal Edildi",
  failed: "Kargo İşlemi Kontrol Ediliyor",
  rejected: "Kargo İşlemi Kontrol Ediliyor",
};

const paymentStatusLabels: Record<string, string> = {
  pending: "Ödeme Bekleniyor",
  waiting: "Ödeme Bekleniyor",
  requires_action: "Ödeme Bekleniyor",
  paid: "Ödendi",
  succeeded: "Ödendi",
  success: "Ödendi",
  failed: "Ödeme Başarısız",
  rejected: "Ödeme Başarısız",
  refunded: "İade Edildi",
  cancelled: "İptal Edildi",
  canceled: "İptal Edildi",
};

const returnStatusLabels: Record<string, string> = {
  open: "Talep Alındı",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  completed: "Tamamlandı",
};

const refundStatusLabels: Record<string, string> = {
  pending: "Para İadesi Bekleniyor",
  manual_confirmed: "Para İadesi Tamamlandı",
  completed: "Para İadesi Tamamlandı",
  failed: "Para İadesi Başarısız",
};

function key(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[\s-]+/g, "_");
}

function friendlyLabel(map: Record<string, string>, value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const normalized = key(raw);
  if (map[normalized]) return map[normalized];
  const knownTurkish = Object.values(map).find((label) => key(label) === normalized);
  return knownTurkish || fallback;
}

function addressText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  const first = (...values: unknown[]) => values.map((item) => String(item || "").trim()).find(Boolean) || "";
  const line = first(record.addressLine, record.address_line, record.address);
  const neighborhood = first(record.neighborhood);
  const district = first(record.town, record.district);
  const city = first(record.city);
  return [neighborhood, line, [district, city].filter(Boolean).join(" / ")].filter(Boolean).join(", ");
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function currentShippingLabel(order: AccountOrder) {
  const latest = order.shipping_events?.[0];
  const candidates = [latest?.status, order.shipping_status, latest?.status_label, order.status];
  for (const candidate of candidates) {
    const resolved = friendlyLabel(shippingStatusLabels, candidate, "");
    if (resolved) return resolved;
  }
  return "Hazırlanıyor";
}

export function AccountOrdersClient() {
  const { user, session, isLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!session?.access_token) {
      setFetching(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setFetching(true);
      setError(null);
      try {
        const response = await fetch("/api/account/orders", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Siparişler alınamadı.");
        if (cancelled) return;
        setProfile(data.profile || null);
        setOrders(data.orders || []);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Siparişler alınamadı.");
      } finally {
        if (!cancelled) setFetching(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [isLoading, session?.access_token]);

  if (isLoading || fetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-carbon px-4 pt-20" role="status" aria-busy="true">
        <LoadingIndicator size="lg" className="text-brick" label="Siparişler yükleniyor" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-carbon px-4 pt-20 text-center">
        <div className="max-w-md rounded-2xl border border-kraft/35 bg-carbon-soft p-8">
          <UserRound className="mx-auto mb-5 text-brick" size={34} />
          <h1 className="font-heading text-4xl">Giriş yapman gerekiyor</h1>
          <p className="mt-4 text-sm leading-7 text-cream/70">Siparişlerini görmek için hesabına giriş yap.</p>
          <Link href="/login?redirect=/account/orders" className="mt-7 inline-block bg-brick px-8 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)]">Giriş Yap</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-carbon px-4 pb-24 pt-28 md:px-8 md:pt-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs uppercase tracking-wide-luxe text-brick">Hesabım</p>
            <h1 className="font-heading text-4xl md:text-5xl">Siparişlerim</h1>
            <p className="mt-4 text-sm leading-7 text-cream/70">Sipariş, teslimat ve kargo bilgilerini tek ekrandan takip et.</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.href = "/";
            }}
            className="inline-flex items-center justify-center gap-2 border border-kraft/45 px-6 py-3 text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-carbon-soft"
          >
            <LogOut size={15} /> Çıkış Yap
          </button>
        </div>

        {error ? <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-kraft/35 bg-carbon-soft p-8 text-center">
            <PackageCheck className="mx-auto mb-4 text-brick" size={30} />
            <p className="font-heading text-xl">Henüz sipariş yok</p>
            <p className="mt-3 text-sm text-cream/70">İlk siparişini verdiğinde burada gözükecek.</p>
            <Link href="/products" className="mt-6 inline-block bg-brick px-7 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)]">Ürünleri Keşfet</Link>
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => {
              const latestEvent = order.shipping_events?.[0];
              const recipient = order.customer_name || profile?.full_name || user.email || "Müşteri";
              const email = order.customer_email || profile?.email || user.email || "";
              const phone = order.customer_phone || profile?.phone || "";
              const address = addressText(order.shipping_address_text);
              const shippingLabel = currentShippingLabel(order);
              const orderLabel = friendlyLabel(orderStatusLabels, order.status, "Sipariş Alındı");
              const paymentLabel = friendlyLabel(paymentStatusLabels, order.payment_status, "Ödeme Bekleniyor");

              return (
                <article key={order.id} className="rounded-2xl border border-kraft/35 bg-carbon-soft p-4 md:p-6">
                  <div className="flex flex-col gap-4 border-b border-kraft/25 pb-5 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-heading text-lg text-cream">#{order.order_no}</p>
                      <p className="mt-1 text-xs text-cream/70">{formatDate(order.created_at)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-kraft/40 bg-carbon px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-cream">{orderLabel}</span>
                        <span className="rounded-full border border-kraft/40 bg-carbon px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-brick">{paymentLabel}</span>
                      </div>
                    </div>
                    <div className="md:text-right">
                      <p className="text-[10px] uppercase tracking-wide-luxe text-cream/70">Toplam</p>
                      <p className="mt-1 font-heading text-2xl text-cream">{formatPrice(Number(order.total_amount), order.currency || "TRY")}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <section className="rounded-xl border border-kraft/25 bg-carbon p-4">
                      <div className="flex items-center gap-2 text-brick"><MapPin size={16} /><p className="text-[10px] font-semibold uppercase tracking-wide-luxe">Teslimat Bilgileri</p></div>
                      <p className="mt-4 font-heading text-lg text-cream">{recipient}</p>
                      <div className="mt-3 space-y-2 text-xs leading-6 text-cream/70">
                        {phone ? <p className="flex items-start gap-2"><Phone className="mt-1 shrink-0" size={13} /><span>{phone}</span></p> : null}
                        {email ? <p className="flex items-start gap-2"><Mail className="mt-1 shrink-0" size={13} /><span className="break-all">{email}</span></p> : null}
                        <p className="flex items-start gap-2"><MapPin className="mt-1 shrink-0" size={13} /><span>{address || "Teslimat adresi sipariş kaydında hazırlanıyor."}</span></p>
                      </div>
                    </section>

                    <section className="rounded-xl border border-kraft/25 bg-carbon p-4">
                      <div className="flex items-center gap-2 text-brick"><Truck size={16} /><p className="text-[10px] font-semibold uppercase tracking-wide-luxe">Kargo Durumu</p></div>
                      <p className="mt-4 font-heading text-xl text-cream">{shippingLabel}</p>
                      <div className="mt-3 space-y-2 text-xs leading-6 text-cream/70">
                        <p><span className="font-medium text-cream">Kargo firması:</span> {order.cargo_company || "Henüz belirlenmedi"}</p>
                        {order.cargo_tracking_no ? <p><span className="font-medium text-cream">Takip no:</span> {order.cargo_tracking_no}</p> : <p>Takip numarası kargo firmaya teslim edildiğinde burada görünecek.</p>}
                        {latestEvent ? <p><span className="font-medium text-cream">Son güncelleme:</span> {formatDate(latestEvent.event_time || latestEvent.created_at, true)}</p> : null}
                      </div>
                      <Link href="/order-tracking" className="mt-4 inline-flex border-b border-kraft/45 pb-1 text-[10px] font-medium uppercase tracking-wide-luxe text-cream">Detaylı Kargo Takibi</Link>
                    </section>
                  </div>

                  {order.return_cases?.length ? (
                    <section className="mt-4 rounded-xl border border-kraft/25 bg-carbon p-4 text-xs">
                      <p className="font-heading text-sm text-cream">İade / Değişim Durumu</p>
                      <div className="mt-3 space-y-2">
                        {order.return_cases.map((returnCase) => (
                          <div key={returnCase.id} className="flex flex-col gap-1 border-t border-kraft/25 pt-2 first:border-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-cream/70">
                              {returnCase.type === "exchange" ? "Değişim" : "İade"} · {returnCase.reason || "Talep"}
                              {returnCase.type === "return" && returnCase.refund_status ? <small className="mt-1 block">{refundStatusLabels[key(returnCase.refund_status)] || "Para iadesi işleniyor"}{returnCase.refund_reference ? ` · Referans: ${returnCase.refund_reference}` : ""}</small> : null}
                            </span>
                            <strong className="text-brick">{returnStatusLabels[key(returnCase.status)] || "Talep Alındı"}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {order.order_items?.length ? (
                    <section className="mt-5 border-t border-kraft/25 pt-5">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide-luxe text-cream/70">Ürünler</p>
                      <div className="space-y-2">
                        {order.order_items.map((item) => (
                          <div key={item.id} className="grid gap-3 rounded-xl border border-kraft/25 bg-carbon p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                            <div className="h-16 w-14 overflow-hidden rounded-lg bg-carbon-soft">
                              {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : null}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-cream">{item.product_name}</p>
                              <p className="mt-1 text-xs text-cream/70">{item.variant_name ? `${item.variant_name} · ` : ""}{item.quantity} adet</p>
                              <div className="mt-3">
                                <OrderReviewButton orderId={order.id} orderNo={order.order_no} orderStatus={order.status} orderPaymentStatus={order.payment_status} item={item} />
                              </div>
                            </div>
                            <span className="whitespace-nowrap text-sm font-medium text-cream">{formatPrice(Number(item.total_price), order.currency || "TRY")}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
