"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  MapPin,
  PackageCheck,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Truck,
  Zap,
} from "lucide-react";
import { ConfirmDialog, CopyButton } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import {
  ExactButton,
  ExactDetailDrawer,
  ExactField,
  ExactFilterBar,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type Handler = { name: string; code: string; logo?: string | null };
type Quote = { desiKg?: number | null; handlerCode: string; price: number };
type AddressDraft = { city: string; town: string; neighborhood: string; address: string };
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
type ShippingOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  created_at: string;
  shipping_address_text?: string | null;
  shipping_city?: string | null;
  shipping_town?: string | null;
  shipping_neighborhood?: string | null;
  shipping_address_line?: string | null;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  shipping_status?: string | null;
  shipping_status_label?: string | null;
  shipping_price?: number | null;
  shipping_fee?: number | null;
  shipping_error?: string | null;
  basit_kargo_order_id?: string | null;
  basit_kargo_barcode?: string | null;
  basit_kargo_handler_code?: string | null;
  basit_kargo_return_barcode?: string | null;
  saved_address?: {
    city?: string | null;
    district?: string | null;
    neighborhood?: string | null;
    address_line?: string | null;
  } | null;
  order_items?: Array<{
    id: string;
    product_name: string;
    variant_name?: string | null;
    quantity: number;
  }>;
  shipping_events?: ShippingEvent[];
};

const automaticHandlers: Handler[] = [
  { code: "ECONOMIC", name: "En Ekonomik (Otomatik)" },
  { code: "FAST", name: "En Hızlı (Otomatik)" },
];
const packages = [{ height: 1, width: 1, depth: 1, weight: 1 }];

function firstAddress(order: ShippingOrder): AddressDraft {
  return {
    city: order.shipping_city || order.saved_address?.city || "",
    town: order.shipping_town || order.saved_address?.district || "",
    neighborhood: order.shipping_neighborhood || order.saved_address?.neighborhood || "",
    address: order.shipping_address_line || order.saved_address?.address_line || order.shipping_address_text || "",
  };
}

function hasShipment(order: ShippingOrder) {
  return Boolean(order.basit_kargo_order_id || order.basit_kargo_barcode || order.cargo_tracking_no);
}

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

function shipmentTone(status?: string | null) {
  const value = String(status || "").toUpperCase();
  if (value === "DELIVERED") return "success" as const;
  if (["CANCELLED", "CANCELED", "LOST", "FAILED"].includes(value)) return "danger" as const;
  if (["SHIPPED", "OUT_FOR_DELIVERY", "RETURNING"].includes(value)) return "accent" as const;
  if (["CREATED", "LABEL_CREATED", "READY"].includes(value)) return "warning" as const;
  return "neutral" as const;
}

export function ExactShipping() {
  const toast = useExactToast();
  const [orders, setOrders] = useState<ShippingOrder[]>([]);
  const [handlers, setHandlers] = useState<Handler[]>(automaticHandlers);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedHandler, setSelectedHandler] = useState("ECONOMIC");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addressDrafts, setAddressDrafts] = useState<Record<string, AddressDraft>>({});
  const [selected, setSelected] = useState<ShippingOrder | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState("2000");
  const [customerShippingFee, setCustomerShippingFee] = useState("79.9");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<ShippingOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersData, handlersData, settingsData] = await Promise.all([
        adminRequest<{ orders?: ShippingOrder[] }>("/api/shipping/basit-kargo/orders"),
        adminRequest<{ handlers?: Handler[] }>("/api/shipping/basit-kargo/handlers"),
        adminRequest<{ settings?: { freeShippingThreshold?: number; customerShippingFee?: number } }>("/api/shipping/settings"),
      ]);
      const live = handlersData.handlers || [];
      const merged = [
        ...automaticHandlers,
        ...live.filter((item) => !automaticHandlers.some((auto) => auto.code === item.code)),
      ];
      const next = ordersData.orders || [];
      setHandlers(merged);
      setOrders(next);
      setAddressDrafts(Object.fromEntries(next.map((order) => [order.id, firstAddress(order)])));
      setFreeShippingThreshold(String(settingsData.settings?.freeShippingThreshold ?? 2000));
      setCustomerShippingFee(String(settingsData.settings?.customerShippingFee ?? 79.9));
      setSelected((current) => current ? next.find((order) => order.id === current.id) || null : null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kargo verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadQuotes = useCallback(async (quiet = false) => {
    if (!quiet) setBusy("quotes");
    try {
      const result = await adminRequest<{ quotes?: Quote[] }>("/api/shipping/basit-kargo/quotes", {
        method: "POST",
        body: JSON.stringify({ packages }),
      });
      setQuotes(result.quotes || []);
      if (!quiet) toast.success(`${result.quotes?.length || 0} canlı kargo fiyatı getirildi.`);
    } catch (caught) {
      if (!quiet) toast.error(caught instanceof Error ? caught.message : "Canlı fiyatlar alınamadı.");
    } finally {
      if (!quiet) setBusy(null);
    }
  }, [toast]);

  useEffect(() => {
    void load();
    void loadQuotes(true);
  }, [load, loadQuotes]);

  const handlerMap = useMemo(() => new Map(handlers.map((handler) => [handler.code, handler])), [handlers]);
  const quoteMap = useMemo(() => new Map(quotes.map((quote) => [quote.handlerCode, quote])), [quotes]);
  const selectedQuote = quoteMap.get(selectedHandler) || null;
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return orders.filter((order) => {
      if (
        needle
        && ![order.order_no, order.customer_name, order.customer_email, order.customer_phone, order.cargo_tracking_no, order.basit_kargo_barcode]
          .some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(needle))
      ) return false;
      if (filter === "waiting" && hasShipment(order)) return false;
      if (filter === "active" && !hasShipment(order)) return false;
      if (filter === "delivered" && String(order.shipping_status || "").toUpperCase() !== "DELIVERED") return false;
      if (filter === "error" && !order.shipping_error && !["FAILED", "LOST"].includes(String(order.shipping_status || "").toUpperCase())) return false;
      return true;
    });
  }, [filter, orders, query]);

  const metrics = useMemo(() => ({
    waiting: orders.filter((order) => !hasShipment(order)).length,
    active: orders.filter((order) => hasShipment(order) && String(order.shipping_status || "").toUpperCase() !== "DELIVERED").length,
    delivered: orders.filter((order) => String(order.shipping_status || "").toUpperCase() === "DELIVERED").length,
    errors: orders.filter((order) => Boolean(order.shipping_error) || ["FAILED", "LOST"].includes(String(order.shipping_status || "").toUpperCase())).length,
  }), [orders]);

  const updateAddress = (orderId: string, patch: Partial<AddressDraft>) => setAddressDrafts((current) => ({
    ...current,
    [orderId]: {
      ...(current[orderId] || { city: "", town: "", neighborhood: "", address: "" }),
      ...patch,
    },
  }));

  const saveAddress = async (order: ShippingOrder) => {
    const address = addressDrafts[order.id] || firstAddress(order);
    if (busy === `address:${order.id}`) return;
    setBusy(`address:${order.id}`);
    try {
      await adminRequest("/api/orders", {
        method: "PATCH",
        body: JSON.stringify({
          id: order.id,
          shipping_city: address.city,
          shipping_town: address.town,
          shipping_neighborhood: address.neighborhood,
          shipping_address_line: address.address,
          shipping_address_text: [
            address.neighborhood,
            address.address,
            [address.town, address.city].filter(Boolean).join("/"),
          ].filter(Boolean).join(", "),
        }),
      });
      toast.success(`${order.order_no} teslimat adresi kaydedildi.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Adres kaydedilemedi.");
    } finally {
      setBusy(null);
    }
  };

  const createShipment = async (order: ShippingOrder) => {
    const address = addressDrafts[order.id] || firstAddress(order);
    if (!address.city || !address.address) {
      toast.error(`${order.order_no} için şehir ve açık adres zorunlu.`);
      setSelected(order);
      return;
    }
    if (busy === `create:${order.id}`) return;
    setBusy(`create:${order.id}`);
    try {
      const handler = handlerMap.get(selectedHandler);
      await adminRequest("/api/shipping/basit-kargo/shipments", {
        method: "POST",
        body: JSON.stringify({
          orderId: order.id,
          handlerCode: selectedHandler,
          handlerName: handler?.name || selectedHandler,
          quotedPrice: selectedQuote?.price ?? null,
          packages,
          recipient: address,
        }),
      });
      toast.success(`${order.order_no} için kargo kodu oluşturuldu.`);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kargo oluşturulamadı.");
    } finally {
      setBusy(null);
    }
  };

  const bulkCreate = async () => {
    if (!selectedIds.length) {
      toast.error("Önce sipariş seç.");
      return;
    }
    if (busy === "bulk") return;
    setBusy("bulk");
    try {
      const handler = handlerMap.get(selectedHandler);
      const result = await adminRequest<{ created?: number; failed?: number }>("/api/shipping/basit-kargo/bulk", {
        method: "POST",
        body: JSON.stringify({
          ids: selectedIds,
          handlerCode: selectedHandler,
          handlerName: handler?.name || selectedHandler,
          quotedPrice: selectedQuote?.price ?? null,
          packages,
        }),
      });
      toast.success(`${result.created || 0} kargo oluşturuldu${result.failed ? `, ${result.failed} hata` : ""}.`);
      setSelectedIds([]);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Toplu kargo oluşturulamadı.");
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async () => {
    const threshold = Number(freeShippingThreshold);
    const fee = Number(customerShippingFee);
    if (!Number.isFinite(threshold) || threshold < 0 || !Number.isFinite(fee) || fee < 0) {
      toast.error("Kargo ücretleri geçerli sayı olmalı.");
      return;
    }
    if (busy === "settings") return;
    setBusy("settings");
    try {
      await adminRequest("/api/shipping/settings", {
        method: "PUT",
        body: JSON.stringify({ freeShippingThreshold: threshold, customerShippingFee: fee }),
      });
      toast.success("Kargo ücretleri kaydedildi.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kargo ayarları kaydedilemedi.");
    } finally {
      setBusy(null);
    }
  };

  const runAction = async (order: ShippingOrder, action: "sync" | "cancel" | "return") => {
    if (busy === `${action}:${order.id}`) return;
    setBusy(`${action}:${order.id}`);
    try {
      await adminRequest(`/api/shipping/basit-kargo/shipments/${order.id}/${action}`, {
        method: "POST",
        body: "{}",
      });
      toast.success(`${order.order_no} kargo işlemi güncellendi.`);
      if (action === "cancel") setPendingCancel(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Kargo işlemi tamamlanamadı.");
    } finally {
      setBusy(null);
    }
  };

  const openLabel = async (order: ShippingOrder) => {
    if (busy === `label:${order.id}`) return;
    setBusy(`label:${order.id}`);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch(apiUrl(`/api/shipping/basit-kargo/shipments/${order.id}/label`), { headers });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Etiket alınamadı.");
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Etiket alınamadı.");
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    const exportRows = [
      ["Sipariş", "Müşteri", "Kargo", "Takip no", "Durum"],
      ...visible.map((order) => [
        order.order_no,
        order.customer_name,
        order.cargo_company || "",
        order.cargo_tracking_no || order.basit_kargo_barcode || "",
        order.shipping_status || "",
      ]),
    ];
    const csv = exportRows
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ruth-kargo-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const columns: ExactColumn<ShippingOrder>[] = [
    {
      key: "select",
      label: "",
      render: (order) => (
        <input
          type="checkbox"
          checked={selectedIds.includes(order.id)}
          onChange={() => {
            setSelectedIds((current) => current.includes(order.id)
              ? current.filter((id) => id !== order.id)
              : [...current, order.id]);
          }}
          aria-label={`#${order.order_no} siparişini seç`}
        />
      ),
    },
    {
      key: "order_no",
      label: "Sipariş",
      sortable: true,
      render: (order) => <div><p className="ruth-type-table font-semibold text-main">#{order.order_no}</p><p className="ruth-type-code text-subtle">{dateTime(order.created_at)}</p></div>,
    },
    {
      key: "customer_name",
      label: "Müşteri",
      sortable: true,
      render: (order) => <div><p className="ruth-type-table font-medium text-main">{order.customer_name}</p><p className="ruth-type-caption text-subtle">{order.customer_phone || order.customer_email || "İletişim yok"}</p></div>,
    },
    {
      key: "cargo_company",
      label: "Kargo",
      render: (order) => <span className="ruth-type-table text-muted">{order.cargo_company || handlerMap.get(order.basit_kargo_handler_code || "")?.name || "—"}</span>,
    },
    {
      key: "cargo_tracking_no",
      label: "Takip",
      render: (order) => <span className="ruth-type-code text-muted">{order.cargo_tracking_no || order.basit_kargo_barcode || "—"}</span>,
    },
    {
      key: "shipping_status",
      label: "Durum",
      align: "center",
      render: (order) => <ExactStatusBadge status={order.shipping_status || "pending"} label={order.shipping_status_label || (hasShipment(order) ? "Oluşturuldu" : "Bekliyor")} tone={shipmentTone(order.shipping_status)} size="sm" />,
    },
    {
      key: "total_amount",
      label: "Sipariş",
      align: "right",
      render: (order) => <span className="ruth-type-price text-main">{money(order.total_amount, order.currency)}</span>,
    },
  ];

  const trackingValue = selected?.cargo_tracking_no || selected?.basit_kargo_barcode || "";

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="shipping">
      <ExactPageHeader
        title="Kargo Yönetimi"
        subtitle={`${visible.length} sipariş · Basit Kargo operasyonları`}
        actions={(
          <>
            <Link href="/shipping/operations"><ExactButton variant="secondary" size="sm"><AlertTriangle className="h-4 w-4" /> İstisnalar</ExactButton></Link>
            <ExactButton variant="secondary" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Dışa aktar</ExactButton>
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} />
            <ExactButton size="sm" onClick={() => void bulkCreate()} loading={busy === "bulk"} disabled={!selectedIds.length}><Truck className="h-4 w-4" /> Toplu kargo ({selectedIds.length})</ExactButton>
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button type="button" onClick={() => setFilter(filter === "waiting" ? "all" : "waiting")}><ExactMetricCard label="Kod Bekleyen" value={metrics.waiting} icon={PackageCheck} className={filter === "waiting" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setFilter(filter === "active" ? "all" : "active")}><ExactMetricCard label="Aktif Kargo" value={metrics.active} icon={Truck} className={filter === "active" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setFilter(filter === "delivered" ? "all" : "delivered")}><ExactMetricCard label="Teslim Edilen" value={metrics.delivered} icon={CheckCircle2} className={filter === "delivered" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setFilter(filter === "error" ? "all" : "error")}><ExactMetricCard label="Hata" value={metrics.errors} icon={AlertTriangle} className={filter === "error" ? "ring-2 ring-accent" : ""} /></button>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <ExactSearchInput value={query} onChange={setQuery} placeholder="Sipariş, müşteri, telefon, takip no veya barkod..." />
          <ExactFilterBar
            chips={[{
              key: "status",
              label: "Tüm Kargolar",
              value: filter === "all" ? null : filter,
              options: [
                { label: "Kod bekleyen", value: "waiting" },
                { label: "Aktif", value: "active" },
                { label: "Teslim", value: "delivered" },
                { label: "Hata", value: "error" },
              ],
            }]}
            onChipChange={(_, value) => setFilter(value || "all")}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={selectedHandler} onChange={(event) => setSelectedHandler(event.target.value)} className={exactFormInputClass}>
            {handlers.map((handler) => <option key={handler.code} value={handler.code}>{handler.name}</option>)}
          </select>
          <ExactButton variant="secondary" size="sm" onClick={() => void loadQuotes()} loading={busy === "quotes"}><Zap className="h-4 w-4" /> Fiyatları çek</ExactButton>
          {selectedQuote ? <span className="ruth-type-price inline-flex h-10 items-center px-3 radius-control bg-accent-soft text-accent">{money(selectedQuote.price)}</span> : null}
        </div>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[1fr_320px]">
        <div>
          {loading ? (
            <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div>
          ) : (
            <ExactDataTable columns={columns} data={visible} onRowClick={(order) => setSelected(order)} emptyState={<ExactEmptyState icon={Truck} title="Bu filtrede kargo kaydı yok" />} />
          )}
        </div>
        <div className="xl:sticky xl:top-20">
          <div className="p-4 radius-card bg-surface-primary shadow-card">
            <h3 className="ruth-type-card-title text-main">Kargo Ücretleri</h3>
            <p className="ruth-type-caption mt-1 text-muted">Storefront teslimat hesaplamasına uygulanır.</p>
            <div className="mt-4 space-y-3">
              <ExactField label="Ücretsiz kargo limiti"><input type="number" value={freeShippingThreshold} onChange={(event) => setFreeShippingThreshold(event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactField label="Müşteri kargo ücreti"><input type="number" value={customerShippingFee} onChange={(event) => setCustomerShippingFee(event.target.value)} className={exactFormInputClass} /></ExactField>
              <ExactButton size="sm" className="w-full" onClick={() => void saveSettings()} loading={busy === "settings"}><Save className="h-4 w-4" /> Ayarları kaydet</ExactButton>
            </div>
          </div>
        </div>
      </div>

      <ExactDetailDrawer
        open={Boolean(selected)}
        onClose={() => { if (!busy) setSelected(null); }}
        dismissalPolicy="explicit-dismiss"
        title={selected ? `Kargo #${selected.order_no}` : "Kargo"}
        subtitle={selected?.customer_name}
        width={700}
        footer={selected ? <ExactButton variant="secondary" size="sm" className="w-full" onClick={() => { if (!busy) setSelected(null); }}>Kapat</ExactButton> : null}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Sipariş</p><p className="ruth-type-metric text-main">{money(selected.total_amount, selected.currency)}</p></div>
              <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Kargo</p><ExactStatusBadge status={selected.shipping_status || "pending"} label={selected.shipping_status_label || (hasShipment(selected) ? "Oluşturuldu" : "Bekliyor")} tone={shipmentTone(selected.shipping_status)} size="sm" /></div>
              <div className="p-3 radius-small bg-surface-secondary">
                <p className="ruth-type-label text-subtle">Takip</p>
                {trackingValue ? (
                  <CopyButton
                    value={trackingValue}
                    label="Takip numarasını kopyala"
                    copiedLabel="Kopyalandı"
                    errorLabel="Kopyalanamadı"
                    onCopyError={(error) => toast.error(error.message)}
                    className="ruth-type-code mt-1 flex min-h-11 w-full items-center text-left font-bold text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:min-h-7"
                  >
                    {(state) => state === "copied" ? "Kopyalandı" : trackingValue}
                  </CopyButton>
                ) : <p className="ruth-type-metric text-main">—</p>}
              </div>
            </div>

            <section>
              <div className="mb-2 flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-subtle" /><h4 className="ruth-type-label font-semibold uppercase tracking-wide text-muted">Teslimat adresi</h4></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ExactField label="Şehir"><input value={(addressDrafts[selected.id] || firstAddress(selected)).city} onChange={(event) => updateAddress(selected.id, { city: event.target.value })} className={exactFormInputClass} /></ExactField>
                <ExactField label="İlçe"><input value={(addressDrafts[selected.id] || firstAddress(selected)).town} onChange={(event) => updateAddress(selected.id, { town: event.target.value })} className={exactFormInputClass} /></ExactField>
                <ExactField label="Mahalle"><input value={(addressDrafts[selected.id] || firstAddress(selected)).neighborhood} onChange={(event) => updateAddress(selected.id, { neighborhood: event.target.value })} className={exactFormInputClass} /></ExactField>
                <ExactField label="Açık adres"><textarea value={(addressDrafts[selected.id] || firstAddress(selected)).address} onChange={(event) => updateAddress(selected.id, { address: event.target.value })} className={`${exactFormInputClass} min-h-20`} /></ExactField>
              </div>
              <ExactButton variant="secondary" size="sm" className="mt-3" onClick={() => void saveAddress(selected)} loading={busy === `address:${selected.id}`}><Save className="h-4 w-4" /> Adresi kaydet</ExactButton>
            </section>

            <section>
              <h4 className="ruth-type-label mb-2 font-semibold uppercase tracking-wide text-muted">Kargo işlemleri</h4>
              <div className="flex flex-wrap gap-2">
                {!hasShipment(selected) ? (
                  <ExactButton size="sm" onClick={() => void createShipment(selected)} loading={busy === `create:${selected.id}`}><Truck className="h-4 w-4" /> Kargo kodu oluştur</ExactButton>
                ) : (
                  <>
                    <ExactButton variant="secondary" size="sm" onClick={() => void openLabel(selected)} loading={busy === `label:${selected.id}`}><Printer className="h-4 w-4" /> Etiket</ExactButton>
                    <ExactButton variant="secondary" size="sm" onClick={() => void runAction(selected, "sync")} loading={busy === `sync:${selected.id}`}><RefreshCw className="h-4 w-4" /> Güncelle</ExactButton>
                    <ExactButton variant="secondary" size="sm" onClick={() => void runAction(selected, "return")} loading={busy === `return:${selected.id}`}><RotateCcw className="h-4 w-4" /> İade kodu</ExactButton>
                    <ExactButton variant="destructive" size="sm" onClick={() => setPendingCancel(selected)} disabled={busy === `cancel:${selected.id}`}><Ban className="h-4 w-4" /> İptal</ExactButton>
                  </>
                )}
              </div>
            </section>

            {selected.shipping_error ? <div className="ruth-type-caption p-3 radius-control bg-danger-soft border border-danger/20 text-danger-foreground"><AlertTriangle className="mr-2 inline h-4 w-4" />{selected.shipping_error}</div> : null}

            <section>
              <h4 className="ruth-type-label mb-2 font-semibold uppercase tracking-wide text-muted">Kargo olayları</h4>
              <div className="space-y-2">
                {(selected.shipping_events || []).map((event) => (
                  <div key={event.id} className="flex items-start gap-2 p-2.5 radius-small bg-surface-secondary">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-accent" />
                    <div><p className="ruth-type-table font-medium text-main">{event.status_label || event.event_type}</p><p className="ruth-type-code text-muted">{event.tracking_no || event.barcode || ""} · {dateTime(event.event_time || event.created_at)}</p></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </ExactDetailDrawer>

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        title="Kargoyu iptal et"
        description={pendingCancel
          ? `#${pendingCancel.order_no} için Basit Kargo kaydı iptal edilecek. Provider sonucu gelmeden işlem başarılı sayılmayacak.`
          : "Kargo iptalini onayla."}
        confirmLabel="Kargoyu iptal et"
        cancelLabel="Vazgeç"
        tone="danger"
        loading={Boolean(pendingCancel && busy === `cancel:${pendingCancel.id}`)}
        onConfirm={() => {
          if (pendingCancel) void runAction(pendingCancel, "cancel");
        }}
        onClose={() => {
          if (!pendingCancel || busy !== `cancel:${pendingCancel.id}`) setPendingCancel(null);
        }}
      />
    </div>
  );
}
