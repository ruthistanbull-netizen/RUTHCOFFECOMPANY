"use client";

import { usePathname } from "next/navigation";
import { CheckSquare2, Layers3, Square, UsersRound } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactFormModal, ExactSearchInput, ExactStatusBadge, useExactToast } from "@/components/base44-exact/primitives";

type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  status: string;
  payment_status: string;
  created_at: string;
};

const statusOptions = [
  { value: "paid", label: "Yeni sipariş" },
  { value: "in_production", label: "Hazırlanıyor" },
  { value: "ready_to_ship", label: "Kargoya hazır" },
  { value: "shipped", label: "Gönderildi" },
  { value: "delivered", label: "Teslim edildi" },
  { value: "cancelled", label: "İptal edildi" },
];

function norm(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function groupStatus(value: string) {
  const status = norm(value);
  if (["created", "new", "paid", "confirmed"].includes(status)) return "paid";
  if (["preparing", "queued", "in_production", "quality_control", "processing"].includes(status)) return "in_production";
  if (["prepared", "ready", "ready_to_ship", "label_created", "ready_for_handover"].includes(status)) return "ready_to_ship";
  if (["shipped", "in_transit", "out_for_delivery"].includes(status)) return "shipped";
  if (["delivered", "completed", "fulfilled"].includes(status)) return "delivered";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return status;
}

function label(value: string) {
  const grouped = groupStatus(value);
  return statusOptions.find((option) => option.value === grouped)?.label || value;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function findHeaderActionHost() {
  const headings = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1"));
  const heading = headings.find((node) => node.textContent?.trim() === "Siparişler");
  const header = heading?.parentElement?.parentElement;
  if (!header) return null;
  const candidate = header.lastElementChild;
  if (!(candidate instanceof HTMLElement) || candidate === heading?.parentElement) return null;
  return candidate;
}

export function AdminOrdersBulkActions() {
  const pathname = usePathname();
  const toast = useExactToast();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetStatus, setTargetStatus] = useState("in_production");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pathname !== "/orders") {
      setPortalTarget(null);
      setOpen(false);
      return;
    }

    const locate = () => {
      const target = findHeaderActionHost();
      if (target) setPortalTarget(target);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ orders?: Order[] }>("/api/orders?range=all&payment=all&q=", { force: true });
      setOrders(result.orders || []);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Siparişler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return orders;
    return orders.filter((order) => `${order.order_no} ${order.customer_name} ${label(order.status)}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [orders, query]);

  const allVisibleSelected = visible.length > 0 && visible.every((order) => selectedIds.has(order.id));

  const toggleOrder = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((order) => next.delete(order.id));
      else visible.forEach((order) => next.add(order.id));
      return next;
    });
  };

  const apply = async () => {
    if (!selectedIds.size || busy) return;
    setBusy(true);
    const ids = Array.from(selectedIds);
    let changed = 0;
    const errors: string[] = [];

    try {
      for (const batch of chunk(ids, 6)) {
        const results = await Promise.all(batch.map(async (id) => {
          try {
            await adminRequest("/api/orders/manual-update", {
              method: "PATCH",
              body: JSON.stringify({
                id,
                status: targetStatus,
                admin_override: true,
                notify_customer: notifyCustomer,
                status_reason: `Toplu sipariş işlemi: ${label(targetStatus)}`,
              }),
            });
            return { ok: true as const };
          } catch (caught) {
            return { ok: false as const, error: caught instanceof Error ? caught.message : "Güncellenemedi" };
          }
        }));
        for (const result of results) {
          if (result.ok) changed += 1;
          else errors.push(result.error);
        }
      }

      if (changed) toast.success(`${changed} sipariş ${label(targetStatus)} durumuna geçirildi.`);
      if (errors.length) toast.error(`${errors.length} sipariş güncellenemedi. ${errors[0] || ""}`);
      setSelectedIds(new Set());
      await load();

      const refreshButton = document.querySelector<HTMLButtonElement>("[data-exact-base44-page='orders-v2'] button[aria-label='Yenile']");
      refreshButton?.click();
    } finally {
      setBusy(false);
    }
  };

  if (pathname !== "/orders" || typeof document === "undefined") return null;

  return (
    <>
      {portalTarget ? createPortal(
        <ExactButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Layers3 className="h-4 w-4" /> Toplu İşlem
        </ExactButton>,
        portalTarget,
      ) : null}

      <ExactFormModal
        open={open}
        onClose={() => { if (!busy) setOpen(false); }}
        title="Toplu Sipariş İşlemleri"
        subtitle="Birden fazla siparişi seçip durumlarını tek seferde değiştir"
        size="xl"
        footer={(
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold text-muted">{selectedIds.size} sipariş seçili</span>
            <div className="flex gap-2">
              <ExactButton variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size || busy}>Seçimi Temizle</ExactButton>
              <ExactButton size="sm" onClick={() => void apply()} loading={busy} disabled={!selectedIds.size}>Seçililere Uygula</ExactButton>
            </div>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted">Yeni sipariş durumu</span>
              <select value={targetStatus} onChange={(event) => setTargetStatus(event.target.value)} className="h-10 w-full rounded-[var(--radius-control)] border border-border-subtle bg-surface-primary px-3 text-sm text-main outline-none focus:ring-2 focus:ring-accent">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <ExactSearchInput value={query} onChange={setQuery} placeholder="Sipariş veya müşteri ara..." />
            <label className="flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-main">
              <input type="checkbox" checked={notifyCustomer} onChange={(event) => setNotifyCustomer(event.target.checked)} className="h-4 w-4 accent-[hsl(var(--accent))]" />
              Müşteriye bildir
            </label>
          </div>

          <button type="button" onClick={toggleVisible} className="flex w-full items-center justify-between rounded-[12px] bg-surface-secondary px-3 py-2.5 text-left transition-colors hover:bg-surface-tertiary">
            <span className="flex items-center gap-2 text-xs font-semibold text-main">
              {allVisibleSelected ? <CheckSquare2 className="h-4 w-4 text-accent" /> : <Square className="h-4 w-4 text-subtle" />}
              {allVisibleSelected ? "Görünenlerin seçimini kaldır" : "Görünen siparişlerin tamamını seç"}
            </span>
            <span className="text-[10px] text-subtle">{visible.length} sipariş</span>
          </button>

          <div className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
            {loading ? (
              <div className="py-10 text-center text-xs text-muted">Siparişler yükleniyor…</div>
            ) : visible.map((order) => {
              const checked = selectedIds.has(order.id);
              const grouped = groupStatus(order.status);
              return (
                <button
                  type="button"
                  key={order.id}
                  onClick={() => toggleOrder(order.id)}
                  className={`flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-all ${checked ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-primary hover:bg-surface-secondary"}`}
                >
                  {checked ? <CheckSquare2 className="h-4 w-4 shrink-0 text-accent" /> : <Square className="h-4 w-4 shrink-0 text-subtle" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-main">#{order.order_no} · {order.customer_name}</span>
                    <span className="mt-0.5 block text-[9px] text-subtle">{new Date(order.created_at).toLocaleString("tr-TR")}</span>
                  </span>
                  <ExactStatusBadge status={grouped} label={label(grouped)} tone={grouped === "delivered" ? "info" : undefined} size="sm" />
                </button>
              );
            })}
          </div>

          {!loading && !visible.length ? (
            <div className="flex flex-col items-center py-8 text-center text-muted"><UsersRound className="mb-2 h-6 w-6" /><p className="text-xs">Bu aramada sipariş yok.</p></div>
          ) : null}
        </div>
      </ExactFormModal>
    </>
  );
}
