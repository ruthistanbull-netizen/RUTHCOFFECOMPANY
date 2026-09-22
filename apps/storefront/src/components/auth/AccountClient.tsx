"use client";

import Link from "next/link";
import { BadgePercent, Gift, LogOut, MapPin, PackageCheck, UserRound } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatPrice } from "@/lib/formatPrice";
import { ROSTA_POINTS_UPDATED_EVENT, calculateRostaPoints, grantRostaWelcomePoints, pointsToLira } from "@/lib/rewards";
import { useRostaPointsSettings } from "@/lib/useRostaPointsSettings";
import { OrderReviewButton } from "@/components/reviews/OrderReviewButton";
import { displayBirthDate, formatManualDateInput } from "@/lib/manualDate";

type AccountOrderItem = {
  id: string;
  product_id?: string | null;
  product_slug?: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url: string | null;
};

type AccountReturnCase = {
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

type AccountShippingEvent = {
  id: string;
  event_type: string;
  status?: string | null;
  status_label?: string | null;
  tracking_no?: string | null;
  barcode?: string | null;
  event_time?: string | null;
  created_at: string;
};

type AccountOrder = {
  id: string;
  order_no: string;
  status: string;
  payment_status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  shipping_address_text?: string | null;
  shipping_status?: string | null;
  basit_kargo_barcode?: string | null;
  basit_kargo_return_barcode?: string | null;
  shipping_events?: AccountShippingEvent[];
  return_cases?: AccountReturnCase[];
  order_items?: AccountOrderItem[];
};

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  birth_date?: string | null;
  reward_points_balance?: number | null;
  birthday_reward_points?: number | null;
  birthday_reward_claimed_year?: number | null;
  marketing_email_consent?: boolean | null;
};

function normalizeStatusKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_çğıöşü]/g, "");
}

function looksTurkish(value: string) {
  return /(hazır|bekli|öd|kargo|teslim|dağıtım|iptal|iade|değişim|onay|redd|başar|işlen|oluştur|alındı|tamam|yolda|güncell|paket|sipariş)/i.test(value);
}

function translateStatus(
  value: string | null | undefined,
  labels: Record<string, string>,
  fallback: string,
) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const translated = labels[normalizeStatusKey(raw)];
  if (translated) return translated;
  if (looksTurkish(raw)) return raw;
  return fallback;
}

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  created: "Sipariş alındı",
  confirmed: "Onaylandı",
  authorized: "Onaylandı",
  paid: "Ödendi",
  processing: "İşleniyor",
  preparing: "Hazırlanıyor",
  preparation: "Hazırlanıyor",
  ready: "Hazır",
  ready_to_ship: "Kargoya hazır",
  shipped: "Kargoda",
  in_transit: "Yolda",
  out_for_delivery: "Dağıtımda",
  delivered: "Teslim edildi",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
  canceled: "İptal edildi",
  refunded: "İade edildi",
  returned: "İade edildi",
  failed: "İşlem başarısız",
};

const paymentLabels: Record<string, string> = {
  waiting: "Ödeme bekliyor",
  pending: "Ödeme işleniyor",
  processing: "Ödeme işleniyor",
  authorized: "Ödeme onaylandı",
  succeeded: "Ödendi",
  success: "Ödendi",
  paid: "Ödendi",
  failed: "Ödeme başarısız",
  declined: "Ödeme reddedildi",
  cancelled: "Ödeme iptal edildi",
  canceled: "Ödeme iptal edildi",
  refunded: "İade edildi",
  partially_refunded: "Kısmi iade edildi",
  partial_refund: "Kısmi iade edildi",
};

const shippingLabels: Record<string, string> = {
  pending: "Hazırlanıyor",
  created: "Kargo kaydı oluşturuldu",
  label_created: "Kargo etiketi oluşturuldu",
  barcode_created: "Kargo barkodu oluşturuldu",
  ready: "Kargoya hazır",
  ready_to_ship: "Kargoya hazır",
  prepared: "Kargoya hazır",
  picked_up: "Kargo tarafından alındı",
  accepted: "Kargo tarafından alındı",
  shipped: "Kargoda",
  in_transit: "Yolda",
  transit: "Yolda",
  out_for_delivery: "Dağıtımda",
  delivery: "Dağıtımda",
  delivered: "Teslim edildi",
  delivery_failed: "Teslimat başarısız",
  failed: "Kargo işlemi başarısız",
  returned: "İade sürecinde",
  return_to_sender: "Göndericiye iade ediliyor",
  cancelled: "Kargo iptal edildi",
  canceled: "Kargo iptal edildi",
};

const returnStatusLabels: Record<string, string> = {
  open: "Talep alındı",
  requested: "Talep alındı",
  pending: "İnceleniyor",
  reviewing: "İnceleniyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  received: "Ürün teslim alındı",
  processing: "İşleniyor",
  completed: "Tamamlandı",
  cancelled: "İptal edildi",
  canceled: "İptal edildi",
};

const refundStatusLabels: Record<string, string> = {
  pending: "Para iadesi bekleniyor",
  requested: "Para iadesi talep edildi",
  processing: "Para iadesi işleniyor",
  manual_confirmed: "Para iadesi tamamlandı",
  completed: "Para iadesi tamamlandı",
  succeeded: "Para iadesi tamamlandı",
  refunded: "Para iadesi tamamlandı",
  failed: "Para iadesi başarısız",
  cancelled: "Para iadesi iptal edildi",
  canceled: "Para iadesi iptal edildi",
};

const returnReasonLabels: Record<string, string> = {
  damaged: "Hasarlı ürün",
  defective: "Kusurlu ürün",
  wrong_item: "Yanlış ürün",
  changed_mind: "Fikir değişikliği",
  size_issue: "Ölçü / beden uygun değil",
  not_as_expected: "Beklendiği gibi değil",
  other: "Diğer",
};

function translateReturnReason(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "Talep";
  return returnReasonLabels[normalizeStatusKey(raw)] || (looksTurkish(raw) ? raw : "Talep");
}

export function AccountClient({ ordersOnly = false }: { ordersOnly?: boolean }) {
  const { user, session, isLoading, signOut } = useAuth();
  const rewardSettings = useRostaPointsSettings();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rewardRefreshKey, setRewardRefreshKey] = useState(0);
  const [birthDateInput, setBirthDateInput] = useState("");
  const [birthdayMessage, setBirthdayMessage] = useState<string | null>(null);
  const [savingBirthday, setSavingBirthday] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (!session?.access_token) {
      setIsFetching(false);
      return;
    }

    const load = async () => {
      setIsFetching(true);
      setError(null);

      try {
        const response = await fetch("/api/account/orders", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Hesap bilgileri alınamadı.");
        }

        setProfile(data.profile || null);
        setBirthDateInput(displayBirthDate(data.profile?.birth_date));
        setOrders(data.orders || []);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Hesap bilgileri alınamadı.");
      } finally {
        setIsFetching(false);
      }
    };

    load();
  }, [isLoading, session?.access_token]);

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

  if (isLoading || isFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory px-4 pt-20" role="status" aria-busy="true">
        <LoadingIndicator size="lg" className="text-gold-dark" label={ordersOnly ? "Siparişler yükleniyor" : "Hesap bilgileri yükleniyor"} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory px-4 pt-20 text-center">
        <div className="max-w-md rounded-2xl border border-gold/15 bg-cream p-8">
          <UserRound className="mx-auto mb-5 text-gold-dark" size={34} />
          <h1 className="font-heading text-4xl">Giriş yapman gerekiyor</h1>
          <p className="mt-4 text-sm leading-7 text-muted-ruth">
            Hesabını ve siparişlerini görmek için giriş yap.
          </p>
          <Link
            href={`/login?redirect=${ordersOnly ? "/account/orders" : "/account"}`}
            className="mt-7 inline-block bg-ink px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream"
          >
            Giriş Yap
          </Link>
        </div>
      </div>
    );
  }

  const visibleOrders = ordersOnly ? orders : orders.slice(0, 3);
  const paidOrderTotal = orders
    .filter((order) => order.payment_status === "paid" || order.status === "paid" || order.status === "completed")
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const rewardSummary = calculateRostaPoints({ isLoggedIn: Boolean(user), paidOrderTotal, birthdayPoints: Number(profile?.birthday_reward_points || 0) });
  const ruthPoints = Math.max(0, Math.floor(Number(profile?.reward_points_balance ?? rewardSummary.totalPoints)));
  const rostaPointDiscount = pointsToLira(ruthPoints);
  const configuredBirthdayPoints = Math.max(0, Math.floor(Number(rewardSettings.birthdayPoints || 0)));
  void rewardRefreshKey;

  return (
    <div className="min-h-screen bg-ivory px-4 pb-24 pt-28 md:px-8 md:pt-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs uppercase tracking-wide-luxe text-gold-dark">
              Hesabım
            </p>
            <h1 className="font-heading text-4xl md:text-5xl">
              {ordersOnly ? "Siparişlerim" : "Merhaba"}
            </h1>
            <p className="mt-4 text-sm leading-7 text-muted-ruth">
              {profile?.full_name || user.email}
            </p>
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.href = "/";
            }}
            className="inline-flex items-center justify-center gap-2 border border-gold/25 px-6 py-3 text-xs uppercase tracking-wide-luxe text-ink transition hover:bg-cream"
          >
            <LogOut size={15} />
            Çıkış Yap
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!ordersOnly && (
          <div className="mb-8 grid gap-5 md:grid-cols-5">
            <div className="rounded-2xl border border-gold/15 bg-cream p-5">
              <p className="text-xs uppercase tracking-wide-luxe text-muted-ruth">E-posta</p>
              <p className="mt-3 text-sm">{profile?.email || user.email}</p>
            </div>
            <div className="rounded-2xl border border-gold/15 bg-cream p-5">
              <p className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Telefon</p>
              <p className="mt-3 text-sm">{profile?.phone || "Henüz eklenmedi"}</p>
            </div>
            <div className="rounded-2xl border border-gold/15 bg-cream p-5">
              <p className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Sipariş</p>
              <p className="mt-3 text-sm">{orders.length} kayıt</p>
            </div>
            <div className="group rounded-2xl border border-gold/15 bg-cream p-5 text-left transition hover:bg-ivory md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wide-luxe text-muted-ruth">ROSTA Points</p>
                <Gift size={18} className="text-gold-dark" />
              </div>
              <p className="mt-3 font-heading text-2xl text-ink">{ruthPoints.toLocaleString("tr-TR")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-ruth">
                Hesabında aktif ROSTA Points var. Ödeme adımında yaklaşık {rostaPointDiscount.toLocaleString("tr-TR")} TL indirim olarak kullanabilirsin.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/products"
                  className="inline-flex items-center justify-center bg-ink px-5 py-3 text-xs uppercase tracking-wide-luxe text-cream"
                >
                  Puanı Kullan
                </Link>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("rosta-open-points"))}
                  className="inline-flex items-center justify-center border border-gold/25 px-5 py-3 text-xs uppercase tracking-wide-luxe text-ink"
                >
                  Nasıl Kazanılır?
                </button>
              </div>
            </div>

            <Link
              href="/account/addresses"
              className="group rounded-2xl border border-gold/15 bg-cream p-5 transition hover:bg-ivory"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Adreslerim</p>
                <MapPin size={18} className="text-gold-dark" />
              </div>
              <p className="mt-3 text-sm text-ink">Adres ekle / yönet</p>
            </Link>

            <Link
              href="/account/discounts"
              className="group rounded-2xl border border-gold/15 bg-cream p-5 transition hover:bg-ivory"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-wide-luxe text-muted-ruth">İndirimlerim</p>
                <BadgePercent size={18} className="text-gold-dark" />
              </div>
              <p className="mt-3 text-sm text-ink">Aktif indirimleri gör / kullan</p>
            </Link>
          </div>
        )}

        {!ordersOnly && (
          <section className="mb-8 rounded-2xl border border-gold/15 bg-cream p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Doğum Günü Avantajı</p>
                <h2 className="mt-2 font-heading text-2xl">{configuredBirthdayPoints.toLocaleString("tr-TR")} ROSTA Points</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-ruth">Puan, doğum gününde ve onu izleyen 7 gün içinde Avantajlar alanından bir kez hesabına eklenebilir.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input type="text" inputMode="numeric" maxLength={10} placeholder="GG.AA.YYYY" value={birthDateInput} disabled={Boolean(profile?.birth_date)} onChange={(e)=>setBirthDateInput(formatManualDateInput(e.target.value))} className="rounded-lg border border-gold/20 bg-ivory px-4 py-3 text-sm" />
                <button type="button" disabled={savingBirthday||Boolean(profile?.birth_date)||!birthDateInput} onClick={async()=>{if(!session?.access_token)return;setSavingBirthday(true);setBirthdayMessage(null);const r=await fetch("/api/account/birth-date",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({birthDate:birthDateInput})});const d=await r.json();setSavingBirthday(false);setBirthdayMessage(d.ok?"Doğum tarihin kaydedildi.":d.error||"Kaydedilemedi.");if(d.ok){setProfile(p=>p?{...p,birth_date:d.birthDate}:p);setBirthDateInput(displayBirthDate(d.birthDate))}}} className="bg-ink px-5 py-3 text-xs uppercase tracking-wide-luxe text-cream disabled:opacity-50">{profile?.birth_date?"Kaydedildi":savingBirthday?"Kaydediliyor":"Kaydet"}</button>
              </div>
            </div>
            {birthdayMessage&&<p className="mt-3 text-sm text-gold-dark">{birthdayMessage}</p>}
          </section>
        )}

        <section className="rounded-2xl border border-gold/15 bg-cream p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="font-heading text-sm uppercase tracking-wide-luxe">
              {ordersOnly ? "Tüm Siparişler" : "Son Siparişler"}
            </h2>
            {!ordersOnly && orders.length > 3 && (
              <Link href="/account/orders" className="text-xs uppercase tracking-wide-luxe text-gold-dark">
                Tümünü Gör
              </Link>
            )}
          </div>

          {visibleOrders.length === 0 ? (
            <div className="rounded-xl border border-gold/10 bg-ivory p-8 text-center">
              <PackageCheck className="mx-auto mb-4 text-gold-dark" size={30} />
              <p className="font-heading text-xl">Henüz sipariş yok</p>
              <p className="mt-3 text-sm text-muted-ruth">
                İlk siparişini verdiğinde burada gözükecek.
              </p>
              <Link
                href="/products"
                className="mt-6 inline-block bg-ink px-7 py-4 text-xs uppercase tracking-wide-luxe text-cream"
              >
                Ürünleri Keşfet
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-gold/10 bg-ivory p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-heading text-sm">{order.order_no}</p>
                      <p className="mt-1 text-xs text-muted-ruth">
                        {new Date(order.created_at).toLocaleDateString("tr-TR")}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-heading text-lg">
                        {formatPrice(Number(order.total_amount), order.currency || "TRY")}
                      </p>
                      <p className="mt-1 text-xs text-muted-ruth">
                        {translateStatus(order.status, statusLabels, "Sipariş güncellendi")} · {translateStatus(order.payment_status, paymentLabels, "Ödeme güncellendi")}
                      </p>
                    </div>
                  </div>

                  {(order.cargo_company || order.cargo_tracking_no || order.shipping_address_text || order.shipping_status) && (
                    <div className="mt-4 grid gap-2 rounded-xl border border-gold/10 bg-cream/60 p-3 text-xs text-muted-ruth sm:grid-cols-2">
                      <p><span className="font-medium text-ink">Kargo:</span> {order.cargo_company || "Hazırlanıyor"}</p>
                      <p><span className="font-medium text-ink">Takip no:</span> {order.cargo_tracking_no || "Henüz girilmedi"}</p>
                      <p><span className="font-medium text-ink">Kargo durumu:</span> {translateStatus(order.shipping_events?.[0]?.status_label || order.shipping_events?.[0]?.status || order.shipping_status, shippingLabels, "Kargo güncellendi")}</p>
                      <p><span className="font-medium text-ink">Barkod:</span> {order.basit_kargo_barcode || "Henüz oluşturulmadı"}</p>
                      {order.basit_kargo_return_barcode && <p className="sm:col-span-2"><span className="font-medium text-ink">İade barkodu:</span> {order.basit_kargo_return_barcode}</p>}
                      {order.shipping_address_text && <p className="sm:col-span-2"><span className="font-medium text-ink">Teslimat:</span> {order.shipping_address_text}</p>}
                      {order.shipping_events?.length ? (
                        <div className="sm:col-span-2 mt-1 space-y-1 border-t border-gold/10 pt-2">
                          {order.shipping_events.slice(0, 3).map((event) => <p key={event.id}><span className="font-medium text-ink">{translateStatus(event.status_label || event.status || event.event_type, shippingLabels, "Kargo güncellendi")}</span> · {new Date(event.event_time || event.created_at).toLocaleString("tr-TR")}</p>)}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {order.return_cases?.length ? (
                    <div className="mt-4 space-y-2 rounded-xl border border-gold/15 bg-cream/70 p-3 text-xs">
                      <p className="font-heading text-sm text-ink">İade / Değişim Durumu</p>
                      {order.return_cases.map((returnCase) => (
                        <div key={returnCase.id} className="flex flex-col gap-1 border-t border-gold/10 pt-2 first:border-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                          <span>
                            {normalizeStatusKey(returnCase.type) === "exchange" ? "Değişim" : "İade"} · {translateReturnReason(returnCase.reason)}
                            {normalizeStatusKey(returnCase.type) !== "exchange" && returnCase.refund_status ? (
                              <small className="mt-1 block text-muted-ruth">
                                {translateStatus(returnCase.refund_status, refundStatusLabels, "Para iadesi güncellendi")}
                                {returnCase.refund_reference ? ` · Referans: ${returnCase.refund_reference}` : ""}
                              </small>
                            ) : null}
                          </span>
                          <strong className="text-gold-dark">{translateStatus(returnCase.status, returnStatusLabels, "Talep güncellendi")}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {order.order_items?.length ? (
                    <div className="mt-4 space-y-2 border-t border-gold/10 pt-4">
                      {order.order_items.map((item) => (
                        <div key={item.id} className="grid gap-3 rounded-xl border border-gold/10 bg-ivory/40 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                          <div className="min-w-0">
                            <p className="break-words leading-6 text-muted-ruth">
                              {item.product_name}
                              {item.variant_name ? ` · ${item.variant_name}` : ""} × {item.quantity}
                            </p>
                            <div className="mt-3">
                              <OrderReviewButton
                                orderId={order.id}
                                orderNo={order.order_no}
                                orderStatus={order.status}
                                orderPaymentStatus={order.payment_status}
                                item={item}
                              />
                            </div>
                          </div>
                          <span className="whitespace-nowrap font-medium sm:pt-1">{formatPrice(Number(item.total_price), order.currency || "TRY")}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}