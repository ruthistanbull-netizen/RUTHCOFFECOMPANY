"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Mail,
  MailCheck,
  MapPin,
  Phone,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactDetailDrawer,
  ExactIconButton,
  ExactPageHeader,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  useExactToast,
} from "./primitives";
import { ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type RangeKey = "all" | "today" | "7d" | "30d" | "90d";

type CartItem = {
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl: string | null;
  imageCandidates?: string[];
  productSlug: string;
};

type Cart = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  total_amount: number;
  currency: string;
  status: string;
  item_count: number;
  cart_items: CartItem[];
  reason: string;
  recovered: boolean;
  checkout_url?: string;
  abandoned_email_count: number;
  abandoned_email_status: string;
  abandoned_email_last_sent_at: string | null;
  abandoned_email_error: string | null;
  mail_diagnosis_label?: string;
  mail_diagnosis_detail?: string;
  created_at: string;
};

type CustomerProfile = {
  id: string;
  profile_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  membership_source: "new_site" | "ikas" | null;
  ikas_account_status: string | null;
  reward_points_balance: number;
  terms_accepted: boolean;
  marketing_email_consent: boolean;
  created_at: string | null;
  order_count: number;
  paid_order_count: number;
  total_spent: number;
  last_order_id: string | null;
  last_order_no: string | null;
  last_order_at: string | null;
  city: string | null;
  district: string | null;
};

type Stats = {
  abandoned: number;
  recovered: number;
  recoveredProducts: number;
  recoveredRevenue: number;
};

const emptyStats: Stats = { abandoned: 0, recovered: 0, recoveredProducts: 0, recoveredRevenue: 0 };

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function state(cart: Cart) {
  if (cart.recovered) return { label: "Kurtarıldı", tone: "success" as const };
  return { label: "Kurtarılmadı", tone: cart.status === "failed" ? "danger" as const : "warning" as const };
}

function cleanContact(value?: string | null) {
  const clean = String(value || "").trim();
  return clean && clean !== "-" ? clean : "";
}

function phoneDigits(value?: string | null) {
  return cleanContact(value).replace(/\D/g, "").slice(-10);
}

function membershipLabel(profile: CustomerProfile | null) {
  if (!profile?.is_member) return "Üye değil";
  if (profile.membership_source === "ikas") return "İkas üyesi";
  return "Site üyesi";
}

function locationLabel(profile: CustomerProfile | null) {
  if (!profile) return "—";
  return [profile.district, profile.city].filter(Boolean).join(" / ") || "—";
}

function CartImage({ item }: { item: CartItem }) {
  const candidates = [...new Set([
    ...(item.imageCandidates || []),
    item.imageUrl,
    item.productSlug ? `/products/ikas/${item.productSlug}-1.jpg` : null,
  ].filter(Boolean) as string[])];
  const [index, setIndex] = useState(0);
  const source = candidates[index];

  return (
    <div className="h-12 w-10 radius-small bg-surface-tertiary overflow-hidden shrink-0">
      {source ? (
        <img
          src={source}
          alt={item.productName}
          className="h-full w-full object-cover"
          onError={() => setIndex((current) => current + 1)}
        />
      ) : (
        <div className="h-full flex items-center justify-center text-subtle">R</div>
      )}
    </div>
  );
}

export function ExactAbandonedCarts() {
  const toast = useExactToast();
  const [range, setRange] = useState<RangeKey>("today");
  const [carts, setCarts] = useState<Cart[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [automation, setAutomation] = useState<any>(null);
  const [selected, setSelected] = useState<Cart | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ carts?: Cart[]; stats?: Stats; automation?: any }>(
        `/api/abandoned-carts?range=${range}`,
      );
      const next = result.carts || [];
      setCarts(next);
      setStats(result.stats || emptyStats);
      setAutomation(result.automation || null);
      setSelected((current) => current ? next.find((cart) => cart.id === current.id) || null : null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Terk edilmiş sepetler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [range, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setCustomerProfile(null);

    if (!selected) {
      setProfileLoading(false);
      return () => { cancelled = true; };
    }

    const email = cleanContact(selected.customer_email).toLocaleLowerCase("tr-TR");
    const phone = cleanContact(selected.customer_phone);
    const query = email || phone;
    if (!query) {
      setProfileLoading(false);
      return () => { cancelled = true; };
    }

    setProfileLoading(true);
    void adminRequest<{ customers?: CustomerProfile[] }>(
      `/api/customers/list?q=${encodeURIComponent(query)}&page=1&pageSize=10`,
    )
      .then((result) => {
        if (cancelled) return;
        const emailLower = email.toLocaleLowerCase("tr-TR");
        const phoneTail = phoneDigits(phone);
        const exact = (result.customers || []).find((customer) => {
          const sameEmail = Boolean(emailLower) && String(customer.email || "").trim().toLocaleLowerCase("tr-TR") === emailLower;
          const samePhone = Boolean(phoneTail) && phoneDigits(customer.phone) === phoneTail;
          return sameEmail || samePhone;
        }) || null;
        setCustomerProfile(exact);
      })
      .catch(() => {
        if (!cancelled) setCustomerProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => { cancelled = true; };
  }, [selected]);

  const runEmails = async () => {
    setBusy(true);
    try {
      const result = await adminRequest<{ sent?: number; failed?: number; matched?: number; eligible?: number }>(
        "/api/email/abandoned-cart/run",
        { method: "POST", body: JSON.stringify({ range }) },
      );
      toast.success(`${result.sent || 0} mail gönderildi${result.failed ? `, ${result.failed} hata` : ""}.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Terk sepet mailleri çalıştırılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const customerSearchHref = useMemo(() => {
    if (!selected) return "/customers";
    const query = cleanContact(selected.customer_email) || cleanContact(selected.customer_phone);
    return query ? `/customers?q=${encodeURIComponent(query)}` : "/customers";
  }, [selected]);

  const columns: ExactColumn<Cart>[] = [
    {
      key: "order_no",
      label: "Sepet",
      sortable: true,
      render: (cart) => (
        <div>
          <p className="ruth-type-table font-semibold text-main">#{cart.order_no}</p>
          <p className="ruth-type-code text-subtle">{dateTime(cart.created_at)}</p>
        </div>
      ),
    },
    {
      key: "customer_name",
      label: "Müşteri",
      sortable: true,
      render: (cart) => (
        <div>
          <p className="ruth-type-table font-medium text-main">{cart.customer_name}</p>
          <p className="ruth-type-caption text-subtle">{cleanContact(cart.customer_email) || cleanContact(cart.customer_phone) || "İletişim yok"}</p>
        </div>
      ),
    },
    {
      key: "total_amount",
      label: "Tutar",
      sortable: true,
      align: "right",
      render: (cart) => <span className="ruth-type-price text-main">{money(cart.total_amount, cart.currency)}</span>,
    },
    { key: "item_count", label: "Ürün", align: "right", render: (cart) => <span className="ruth-type-table tabular-nums text-muted">{cart.item_count}</span> },
    {
      key: "status",
      label: "Durum",
      align: "center",
      render: (cart) => {
        const current = state(cart);
        return <ExactStatusBadge status={cart.status} label={current.label} tone={current.tone} size="sm" />;
      },
    },
    {
      key: "abandoned_email_count",
      label: "Mail",
      align: "center",
      render: (cart) => (
        <div>
          <p className="ruth-type-table font-medium text-main">{cart.abandoned_email_count || 0}/3</p>
          <p className="ruth-type-code text-subtle">{cart.abandoned_email_last_sent_at ? dateTime(cart.abandoned_email_last_sent_at) : cart.mail_diagnosis_label || "Bekliyor"}</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="abandoned-carts">
      <ExactPageHeader
        title="Terk Edilmiş Sepetler"
        subtitle="Ödemeye ulaşan fakat siparişe dönüşmeyen sepetler"
        actions={(
          <>
            <Link href="/email"><ExactButton variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> E-posta merkezi</ExactButton></Link>
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} />
            <ExactButton size="sm" onClick={() => void runEmails()} loading={busy}><MailCheck className="h-4 w-4" /> Otomasyonu çalıştır</ExactButton>
          </>
        )}
      />

      {automation?.ranAt ? (
        <div className="ruth-type-caption flex items-center gap-2 p-3 radius-control bg-info-soft border border-info/20 text-info-foreground">
          <Sparkles className="h-4 w-4" /> Son çalışma: {dateTime(automation.ranAt)} · {automation.sent || 0} gönderildi{automation.failed ? ` · ${automation.failed} hata` : ""}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ExactMetricCard label="Terk Sepet" value={stats.abandoned} icon={ShoppingCart} />
        <ExactMetricCard label="Kurtarılan Sepet" value={stats.recovered} icon={Sparkles} />
        <ExactMetricCard label="Kurtarılan Ürün" value={stats.recoveredProducts} icon={ShoppingCart} />
        <ExactMetricCard label="Kurtarılan Ciro" value={stats.recoveredRevenue} format="currency" icon={Sparkles} />
      </div>

      <ExactSegmentedControl
        size="sm"
        value={range}
        onChange={(value) => setRange(value as RangeKey)}
        options={[
          { value: "today", label: "Bugün" },
          { value: "7d", label: "7 Gün" },
          { value: "30d", label: "30 Gün" },
          { value: "90d", label: "90 Gün" },
          { value: "all", label: "Tümü" },
        ]}
      />

      {loading ? (
        <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div>
      ) : (
        <ExactDataTable
          columns={columns}
          data={carts}
          onRowClick={setSelected}
          emptyState={<ExactEmptyState icon={ShoppingCart} title="Bu aralıkta terk sepet yok" />}
        />
      )}

      <ExactDetailDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Sepet #${selected.order_no}` : "Sepet"}
        subtitle={selected?.customer_name}
        width={700}
        footer={selected ? (
          <div className="flex gap-2">
            <ExactButton variant="secondary" size="sm" className="flex-1" onClick={() => setSelected(null)}>Kapat</ExactButton>
            {selected.checkout_url ? (
              <a href={selected.checkout_url} target="_blank" rel="noreferrer" className="flex-1">
                <ExactButton size="sm" className="w-full"><ExternalLink className="h-4 w-4" /> Sepet linkini aç</ExactButton>
              </a>
            ) : null}
          </div>
        ) : null}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Tutar</p><p className="ruth-type-metric text-main">{money(selected.total_amount, selected.currency)}</p></div>
              <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Ürün</p><p className="ruth-type-metric text-main">{selected.item_count}</p></div>
              <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Mail</p><p className="ruth-type-metric text-main">{selected.abandoned_email_count || 0}/3</p></div>
            </div>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="ruth-type-label font-semibold text-muted uppercase tracking-wide">Müşteri profili</h4>
                <Link href={customerSearchHref} className="ruth-type-control font-semibold text-accent hover:underline">Müşterilerde aç</Link>
              </div>
              <div className="p-3 radius-small bg-surface-secondary space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="ruth-type-card-title font-semibold text-main truncate">{selected.customer_name}</p>
                    <div className="mt-1 space-y-1">
                      {cleanContact(selected.customer_email) ? <a href={`mailto:${selected.customer_email}`} className="ruth-type-caption flex items-center gap-1.5 text-muted hover:text-accent"><Mail className="h-3 w-3" /> {selected.customer_email}</a> : null}
                      {cleanContact(selected.customer_phone) ? <a href={`tel:${selected.customer_phone}`} className="ruth-type-caption flex items-center gap-1.5 text-muted hover:text-accent"><Phone className="h-3 w-3" /> {selected.customer_phone}</a> : null}
                    </div>
                  </div>
                  {profileLoading ? (
                    <span className="ruth-type-caption text-subtle">Üyelik kontrol ediliyor…</span>
                  ) : (
                    <ExactStatusBadge
                      status={customerProfile?.is_member ? "active" : "archived"}
                      label={membershipLabel(customerProfile)}
                      tone={customerProfile?.is_member ? "success" : "neutral"}
                      size="sm"
                    />
                  )}
                </div>

                {!profileLoading ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-[var(--radius-small)] bg-surface-primary p-2.5">
                      <p className="ruth-type-label uppercase text-subtle">Sipariş</p>
                      <p className="ruth-type-metric mt-1 text-main">{customerProfile?.order_count ?? 0}</p>
                      <p className="ruth-type-caption text-muted">{customerProfile?.paid_order_count ?? 0} ödenmiş</p>
                    </div>
                    <div className="rounded-[var(--radius-small)] bg-surface-primary p-2.5">
                      <p className="ruth-type-label uppercase text-subtle">Toplam harcama</p>
                      <p className="ruth-type-metric mt-1 text-main">{money(customerProfile?.total_spent || 0)}</p>
                    </div>
                    <div className="rounded-[var(--radius-small)] bg-surface-primary p-2.5">
                      <p className="ruth-type-label uppercase text-subtle">ROSTA Points</p>
                      <p className="ruth-type-metric mt-1 flex items-center gap-1 text-accent"><Star className="h-3 w-3" /> {Math.max(0, Number(customerProfile?.reward_points_balance || 0)).toLocaleString("tr-TR")}</p>
                    </div>
                    <div className="rounded-[var(--radius-small)] bg-surface-primary p-2.5">
                      <p className="ruth-type-label uppercase text-subtle">Pazarlama izni</p>
                      <p className="ruth-type-body-strong mt-1 text-main">{customerProfile?.marketing_email_consent ? "Var" : "Yok"}</p>
                    </div>
                  </div>
                ) : null}

                {!profileLoading ? (
                  <div className="ruth-type-caption grid gap-2 text-muted sm:grid-cols-2">
                    <div className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5 text-subtle" /><span>Üyelik/kayıt: <strong className="font-semibold text-main">{customerProfile?.created_at ? dateTime(customerProfile.created_at) : customerProfile?.is_member ? "Kayıt tarihi yok" : "Misafir checkout"}</strong></span></div>
                    <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-subtle" /><span>Konum: <strong className="font-semibold text-main">{locationLabel(customerProfile)}</strong></span></div>
                    <div className="flex items-center gap-2"><ShoppingBag className="h-3.5 w-3.5 text-subtle" /><span>Son sipariş: <strong className="font-semibold text-main">{customerProfile?.last_order_no ? `#${customerProfile.last_order_no}` : "—"}</strong>{customerProfile?.last_order_at ? ` · ${dateTime(customerProfile.last_order_at)}` : ""}</span></div>
                    <div className="flex items-center gap-2"><UsersRound className="h-3.5 w-3.5 text-subtle" /><span>Kaynak: <strong className="font-semibold text-main">{customerProfile?.membership_source === "ikas" ? "İkas hesabı" : customerProfile?.is_member ? "Yeni site hesabı" : "Üye değil"}</strong></span></div>
                  </div>
                ) : null}

                <div className="flex items-center gap-2 pt-1">
                  <ExactStatusBadge status={selected.status} label={state(selected).label} tone={state(selected).tone} size="sm" />
                  <span className="ruth-type-caption text-subtle">{selected.reason || "Sebep belirtilmemiş"}</span>
                </div>
              </div>
            </section>

            <section>
              <h4 className="ruth-type-label font-semibold text-muted uppercase tracking-wide mb-2">Sepet zamanlaması</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Checkout başlangıcı</p><p className="ruth-type-code mt-1 font-semibold text-main">{dateTime(selected.created_at)}</p></div>
                <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Kurtarma durumu</p><p className="ruth-type-body-strong mt-1 text-main">{selected.recovered ? "Kurtarıldı" : "Kurtarılmadı"}</p></div>
              </div>
            </section>

            <section>
              <h4 className="ruth-type-label font-semibold text-muted uppercase tracking-wide mb-2">Otomasyon durumu</h4>
              <div className={`p-3 radius-small border ${selected.abandoned_email_error ? "bg-danger-soft border-danger/20" : "bg-info-soft border-info/20"}`}>
                <p className={`ruth-type-caption ${selected.abandoned_email_error ? "text-danger-foreground" : "text-info-foreground"}`}>
                  {selected.abandoned_email_error || selected.mail_diagnosis_detail || `${selected.abandoned_email_count || 0} mail gönderildi.`}
                </p>
                <p className="ruth-type-code text-muted mt-1">Son gönderim: {dateTime(selected.abandoned_email_last_sent_at)}</p>
              </div>
            </section>

            <section>
              <h4 className="ruth-type-label font-semibold text-muted uppercase tracking-wide mb-2">Sepetteki ürünler</h4>
              <div className="space-y-2">
                {(selected.cart_items || []).map((item, index) => (
                  <div key={`${item.productSlug}-${index}`} className="flex items-center gap-3 p-2.5 radius-small bg-surface-secondary">
                    <CartImage item={item} />
                    <div className="flex-1 min-w-0">
                      <p className="ruth-type-table font-medium text-main truncate">{item.productName}</p>
                      <p className="ruth-type-caption text-muted">{item.variantName || "Standart"} · {item.quantity} adet</p>
                    </div>
                    <span className="ruth-type-price text-main">{money(item.totalPrice || item.unitPrice * item.quantity, selected.currency)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </ExactDetailDrawer>
    </div>
  );
}
