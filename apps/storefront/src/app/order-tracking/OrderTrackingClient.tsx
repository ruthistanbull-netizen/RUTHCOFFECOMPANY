"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatedBlock, PageIntro } from "@/components/PageIntro";
import { formatPrice } from "@/lib/formatPrice";

type OrderItem = {
  id: string;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
};

type ReturnCase = {
  id: string;
  type: string;
  status: string;
  reason?: string | null;
  amount?: number | null;
  refund_status?: string | null;
  refund_reference?: string | null;
  refunded_at?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type ShippingEvent = {
  id: string;
  event_type: string;
  status?: string | null;
  status_label?: string | null;
  tracking_no?: string | null;
  barcode?: string | null;
  event_time?: string | null;
  created_at: string;
};

type TrackedOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  total_amount: number;
  currency: string;
  status_label: string;
  payment_status_label: string;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  shipping_address_text?: string | null;
  shipping_status?: string | null;
  shipping_status_label?: string | null;
  basit_kargo_barcode?: string | null;
  basit_kargo_return_barcode?: string | null;
  shipping_events?: ShippingEvent[];
  created_at?: string | null;
  order_items: OrderItem[];
  return_cases?: ReturnCase[];
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const returnStatusLabels: Record<string, string> = {
  open: "Talep alındı",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  completed: "Tamamlandı",
};

const refundStatusLabels: Record<string, string> = {
  pending: "Para iadesi bekleniyor",
  manual_confirmed: "Para iadesi tamamlandı",
  completed: "Para iadesi tamamlandı",
  failed: "Para iadesi başarısız",
};

export function OrderTrackingClient() {
  const [orderNo, setOrderNo] = useState("");
  const [contact, setContact] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOrder(null);

    const response = await fetch("/api/order-tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNo, contact }),
    });

    const result = await response.json();
    setLoading(false);

    if (!response.ok || !result.ok) {
      setError(result.error || "Sipariş bulunamadı.");
      return;
    }

    setOrder(result.order);
  };

  return (
    <div className="min-h-screen bg-carbon pt-24 text-cream">
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-20">
        <PageIntro
          eyebrow="Sipariş"
          title="Siparişini takip et"
          description="Sipariş numaran ve siparişte kullandığın e-posta ya da telefonla güncel durumu kontrol edebilirsin."
          className="mb-12 md:mb-16"
        />

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <AnimatedBlock>
            <div className="rounded-3xl bg-carbon-soft p-6 md:p-10" style={{ border: "1px solid color-mix(in srgb, var(--rosta-kraft) 32%, transparent)" }}>
              <p className="mb-6 text-xs uppercase tracking-wide-luxe text-brick">Takip Bilgileri</p>
              <form className="space-y-5" onSubmit={submit}>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-cream/70">Sipariş Numarası</span>
                  <input
                    value={orderNo}
                    onChange={(event) => setOrderNo(event.target.value)}
                    placeholder="Örn. RTH2026... veya 1209"
                    className="w-full rounded-2xl border border-kraft/40 bg-carbon px-5 py-4 font-heading text-xl outline-none transition focus:border-brick-dark"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-cream/70">E-posta veya Telefon</span>
                  <input
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                    placeholder="Siparişte kullandığın bilgi"
                    className="w-full rounded-2xl border border-kraft/40 bg-carbon px-5 py-4 font-heading text-xl outline-none transition focus:border-brick-dark"
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-brick px-8 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] transition active:bg-espresso disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                >
                  {loading ? "Sorgulanıyor..." : "Siparişimi Sorgula"}
                </button>
              </form>

              {error && (
                <div className="mt-5 rounded-2xl border border-[var(--ruth-color-danger)]/40 bg-[var(--ruth-color-danger-soft)] px-4 py-3 text-sm text-[var(--ruth-color-danger-text)]">
                  {error}
                </div>
              )}

              {order && (
                <div className="mt-8 rounded-3xl bg-carbon p-5 md:p-6" style={{ border: "1px solid color-mix(in srgb, var(--rosta-kraft) 32%, transparent)" }}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide-luxe text-cream/70">Sipariş No</p>
                      <h2 className="mt-2 font-heading text-3xl text-cream">#{order.order_no}</h2>
                      <p className="mt-2 text-sm text-cream/70">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="text-xs uppercase tracking-wide-luxe text-cream/70">Toplam</p>
                      <strong className="mt-2 block font-heading text-3xl text-cream">{formatPrice(order.total_amount, order.currency)}</strong>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-carbon-soft p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-cream/70">Sipariş Durumu</p>
                      <strong className="mt-2 block text-cream">{order.status_label}</strong>
                    </div>
                    <div className="rounded-2xl bg-carbon-soft p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-cream/70">Ödeme Durumu</p>
                      <strong className="mt-2 block text-cream">{order.payment_status_label}</strong>
                    </div>
                    <div className="rounded-2xl bg-carbon-soft p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-cream/70">Kargo Firması</p>
                      <strong className="mt-2 block text-cream">{order.cargo_company || "Henüz girilmedi"}</strong>
                    </div>
                    <div className="rounded-2xl bg-carbon-soft p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-cream/70">Takip No</p>
                      <strong className="mt-2 block text-cream">{order.cargo_tracking_no || "Henüz girilmedi"}</strong>
                    </div>
                    <div className="rounded-2xl bg-carbon-soft p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-cream/70">Kargo Durumu</p>
                      <strong className="mt-2 block text-cream">{order.shipping_status_label || "Hazırlanıyor"}</strong>
                    </div>
                    <div className="rounded-2xl bg-carbon-soft p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-cream/70">Barkod</p>
                      <strong className="mt-2 block break-all text-cream">{order.basit_kargo_barcode || "Henüz oluşturulmadı"}</strong>
                      {order.basit_kargo_return_barcode ? <small className="mt-2 block text-cream/70">İade: {order.basit_kargo_return_barcode}</small> : null}
                    </div>
                  </div>

                  {order.shipping_events?.length ? (
                    <div className="mt-6 rounded-2xl bg-carbon-soft p-4">
                      <p className="text-xs uppercase tracking-wide-luxe text-cream/70">Kargo Hareketleri</p>
                      <div className="mt-4 space-y-3">
                        {order.shipping_events.map((event, index) => (
                          <div key={event.id} className="flex gap-3">
                            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${index === 0 ? "bg-brick-dark" : "bg-brick/35"}`} />
                            <div className="min-w-0 flex-1 border-b border-kraft/25 pb-3 last:border-0 last:pb-0">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <strong className="text-sm text-cream">{event.status_label || event.status || "Kargo güncellendi"}</strong>
                                <span className="text-xs text-cream/70">{formatDate(event.event_time || event.created_at)}</span>
                              </div>
                              {(event.tracking_no || event.barcode) && <p className="mt-1 text-xs text-cream/70">{event.tracking_no ? `Takip: ${event.tracking_no}` : `Barkod: ${event.barcode}`}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {order.return_cases?.length ? (
                    <div className="mt-6 rounded-2xl bg-carbon-soft p-4">
                      <p className="text-xs uppercase tracking-wide-luxe text-cream/70">İade / Değişim</p>
                      <div className="mt-3 space-y-2">
                        {order.return_cases.map((returnCase) => (
                          <div key={returnCase.id} className="flex flex-col gap-1 rounded-xl bg-carbon p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <span>
                              {returnCase.type === "exchange" ? "Değişim" : "İade"} · {returnCase.reason || "Talep"}
                              {returnCase.type === "return" && returnCase.refund_status ? (
                                <small className="mt-1 block text-cream/70">
                                  {refundStatusLabels[returnCase.refund_status] || returnCase.refund_status}
                                  {returnCase.refund_reference ? ` · Referans: ${returnCase.refund_reference}` : ""}
                                </small>
                              ) : null}
                            </span>
                            <strong className="text-brick">{returnStatusLabels[returnCase.status] || returnCase.status || "Talep alındı"}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 space-y-3">
                    <p className="text-xs uppercase tracking-wide-luxe text-cream/70">Ürünler</p>
                    {order.order_items.map((item) => (
                      <div key={item.id} className="flex gap-4 rounded-2xl bg-carbon-soft p-3">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-carbon">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <strong className="block text-cream">{item.product_name}</strong>
                          {item.variant_name && <p className="mt-1 text-sm text-cream/70">{item.variant_name}</p>}
                          <p className="mt-2 text-sm text-cream/70">{item.quantity} adet · {formatPrice(item.total_price, order.currency)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AnimatedBlock>

          <AnimatedBlock delay={0.12}>
            <div className="flex h-full flex-col justify-between rounded-3xl bg-brick p-6 text-[var(--rosta-action-text)] md:p-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick">
              <div>
                <p className="mb-5 text-xs uppercase tracking-wide-luxe text-brick">ROSTA Coffee Co.</p>
                <h2 className="font-heading text-4xl md:text-5xl">Sipariş durumunu anlık kontrol et.</h2>
                <p className="mt-6 leading-8 text-cream/70">
                  Kargon hazırlandığında firma ve takip bilgileri burada görüntülenir.
                </p>
              </div>

              <div className="mt-10 grid gap-3 text-sm text-cream/75">
                <div className="rounded-2xl border border-cream/10 p-4">Oluşturuldu</div>
                <div className="rounded-2xl border border-cream/10 p-4">Kargoya Hazır</div>
                <div className="rounded-2xl border border-cream/10 p-4">Gönderildi / Teslim Edildi</div>
              </div>

              <Link
                href="/contact"
                className="mt-10 inline-flex w-fit rounded-full bg-carbon-soft px-7 py-3 text-xs uppercase tracking-wide-luxe text-cream transition active:bg-brick active:text-[var(--rosta-action-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
              >
                Destek Al
              </Link>
            </div>
          </AnimatedBlock>
        </div>
      </div>
    </div>
  );
}
