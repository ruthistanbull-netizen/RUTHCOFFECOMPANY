"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";

import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactFormModal, useExactToast } from "./primitives";

type OrderSummary = {
  id: string;
  order_no: string;
  imported_source?: string | null;
  basit_kargo_order_id?: string | null;
  basit_kargo_barcode?: string | null;
  cargo_tracking_no?: string | null;
  shipping_status?: string | null;
};

type ConfirmAction = "shipment" | "order" | null;

function normalizedText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

function isManualOrder(order: OrderSummary) {
  return normalizedText(order.imported_source) === "manual"
    || String(order.order_no || "").trim().toUpperCase().startsWith("MAN");
}

function hasShipment(order: OrderSummary) {
  return Boolean(order.basit_kargo_order_id || order.basit_kargo_barcode || order.cargo_tracking_no);
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

function findFooterActionRow(dialog: HTMLElement) {
  const footer = [...dialog.children].find((node) => node instanceof HTMLElement && node.tagName === "FOOTER") as HTMLElement | undefined;
  if (!footer) return null;
  const directRow = [...footer.children].find((node) => node instanceof HTMLElement) as HTMLElement | undefined;
  const row = directRow || footer;
  row.classList.add("flex-wrap");
  return row;
}

function findShippingActionRow(card: HTMLElement) {
  const rows = [...card.querySelectorAll<HTMLElement>("div")];
  const withShippingActions = rows.find((row) => {
    if (!row.classList.contains("flex") || !row.classList.contains("flex-wrap")) return false;
    const text = normalizedText(row.textContent);
    return text.includes("etiket") || text.includes("kargoyu güncelle") || text.includes("kargoyu aç");
  });
  if (withShippingActions) return withShippingActions;

  return rows.find((row) => row.classList.contains("mt-3") && row.classList.contains("flex") && row.classList.contains("flex-wrap")) || null;
}

function ensureMount(parent: HTMLElement, attributeName: string) {
  let mount = parent.querySelector<HTMLElement>(`[${attributeName}="true"]`);
  if (mount) return mount;
  mount = document.createElement("span");
  mount.setAttribute(attributeName, "true");
  mount.className = "contents";
  parent.appendChild(mount);
  return mount;
}

function cleanOrderUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("order");
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}

export function ExactOrderDetailActionsAndMotion() {
  const searchParams = useSearchParams();
  const toast = useExactToast();
  const orderId = searchParams.get("order") || "";
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [shippingMount, setShippingMount] = useState<HTMLElement | null>(null);
  const [manualMount, setManualMount] = useState<HTMLElement | null>(null);
  const [removingShipment, setRemovingShipment] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setConfirmAction(null);
      return;
    }

    let cancelled = false;
    void adminRequest<{ orders?: OrderSummary[] }>("/api/orders?range=all&payment=all&q=", {
      force: true,
      ttlMs: 0,
      staleMs: 0,
    }).then((result) => {
      if (cancelled) return;
      setOrder((result.orders || []).find((item) => item.id === orderId) || null);
    }).catch(() => {
      if (!cancelled) setOrder(null);
    });

    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    let currentShippingMount: HTMLElement | null = null;
    let currentManualMount: HTMLElement | null = null;

    const removeMount = (mount: HTMLElement | null) => {
      if (mount?.isConnected) mount.remove();
    };

    const sync = () => {
      const dialog = findOrderDialog();
      if (!dialog) {
        removeMount(currentShippingMount);
        removeMount(currentManualMount);
        currentShippingMount = null;
        currentManualMount = null;
        setShippingMount(null);
        setManualMount(null);
        return;
      }

      const shippingCard = findCard(dialog, "Kargo ve Teslimat");
      const shippingRow = shippingCard ? findShippingActionRow(shippingCard) : null;
      if (shippingRow && order && hasShipment(order)) {
        const next = ensureMount(shippingRow, "data-order-shipment-remove-mount");
        currentShippingMount = next;
        setShippingMount((current) => current === next ? current : next);
      } else {
        removeMount(currentShippingMount);
        currentShippingMount = null;
        setShippingMount(null);
      }

      const footerRow = findFooterActionRow(dialog);
      if (footerRow && order && isManualOrder(order)) {
        const next = ensureMount(footerRow, "data-manual-order-delete-footer-mount");
        currentManualMount = next;
        setManualMount((current) => current === next ? current : next);
      } else {
        removeMount(currentManualMount);
        currentManualMount = null;
        setManualMount(null);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      removeMount(currentShippingMount);
      removeMount(currentManualMount);
      setShippingMount(null);
      setManualMount(null);
    };
  }, [order]);

  const removeShipment = useCallback(async (reloadOnSuccess = true) => {
    if (!order || removingShipment || !hasShipment(order)) return false;

    setRemovingShipment(true);
    try {
      await adminRequest(`/api/shipping/basit-kargo/shipments/${encodeURIComponent(order.id)}/remove`, {
        method: "POST",
        body: "{}",
      });
      if (reloadOnSuccess) {
        toast.success("Kargo kaydı Basit Kargo'dan ve panelden kaldırıldı.");
        window.setTimeout(() => window.location.reload(), 220);
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kargo kodu kaldırılamadı.");
      setRemovingShipment(false);
      return false;
    }
  }, [order, removingShipment, toast]);

  const deleteManualOrder = useCallback(async () => {
    if (!order || deletingOrder || !isManualOrder(order)) return;

    setDeletingOrder(true);
    try {
      if (hasShipment(order)) {
        const removed = await removeShipment(false);
        if (!removed) {
          setDeletingOrder(false);
          return;
        }
      }

      await adminRequest("/api/orders/manual-delete", {
        method: "POST",
        body: JSON.stringify({ order_id: order.id }),
      });
      toast.success("Manuel sipariş kalıcı olarak silindi.");
      const next = cleanOrderUrl();
      window.history.replaceState(window.history.state, "", next);
      window.setTimeout(() => window.location.reload(), 160);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Manuel sipariş silinemedi.");
      setDeletingOrder(false);
      setRemovingShipment(false);
    }
  }, [deletingOrder, order, removeShipment, toast]);

  const executeConfirmedAction = () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "shipment") void removeShipment(true);
    if (action === "order") void deleteManualOrder();
  };

  const confirmationTitle = confirmAction === "order" ? "Manuel siparişi sil" : "Kargo kodunu kaldır";
  const confirmationText = confirmAction === "order"
    ? hasShipment(order || {} as OrderSummary)
      ? "Bu manuel sipariş kalıcı olarak silinecek. Önce Basit Kargo kaydı iptal edilip kaldırılacak, ardından sipariş ve ürün kayıtları silinecek. Stok düşümü varsa geri yüklenecek."
      : "Bu manuel sipariş kalıcı olarak silinecek. Sipariş ve ürün kayıtları kaldırılacak; stok düşümü varsa geri yüklenecek."
    : "Kargo kaydı önce Basit Kargo üzerinden doğrulanıp iptal edilecek. Başarılı olursa paneldeki barkod, takip numarası ve kargo bağlantısı da temizlenecek.";

  return (
    <>
      {shippingMount && order && hasShipment(order) ? createPortal(
        <ExactButton
          type="button"
          variant="destructive"
          size="sm"
          className="w-full sm:w-auto"
          loading={removingShipment}
          onClick={() => setConfirmAction("shipment")}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Kargo Kodunu Kaldır
        </ExactButton>,
        shippingMount,
      ) : null}

      {manualMount && order && isManualOrder(order) ? createPortal(
        <ExactButton
          type="button"
          variant="destructive"
          size="sm"
          className="order-last basis-full sm:order-none sm:basis-auto sm:min-w-[150px] sm:flex-1"
          loading={deletingOrder}
          onClick={() => setConfirmAction("order")}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Siparişi Sil
        </ExactButton>,
        manualMount,
      ) : null}

      <ExactFormModal
        open={Boolean(confirmAction && order)}
        onClose={() => !removingShipment && !deletingOrder && setConfirmAction(null)}
        dismissalPolicy="protected-action"
        title={confirmationTitle}
        subtitle={order ? `#${order.order_no}` : undefined}
        size="sm"
        footer={(
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <ExactButton
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={removingShipment || deletingOrder}
              onClick={() => setConfirmAction(null)}
            >
              Vazgeç
            </ExactButton>
            <ExactButton
              type="button"
              variant="destructive"
              size="sm"
              className="w-full"
              loading={confirmAction === "shipment" ? removingShipment : deletingOrder}
              onClick={executeConfirmedAction}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmAction === "order" ? "Siparişi Kalıcı Sil" : "Kargo Kodunu Kaldır"}
            </ExactButton>
          </div>
        )}
      >
        <div className="rounded-[var(--radius-small)] border border-danger/20 bg-danger-soft p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger-foreground" />
            <div>
              <p className="text-sm font-semibold text-main">Bu işlem geri alınamaz.</p>
              <p className="mt-1 text-xs leading-5 text-muted">{confirmationText}</p>
            </div>
          </div>
        </div>
      </ExactFormModal>
    </>
  );
}
