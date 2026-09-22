"use client";

import { type MouseEvent, useEffect, useState } from "react";
import { SaveLifecycleProvider, useSaveLifecycle } from "@ruth-commerce/ui";
import { OrderShippingCarrierPicker } from "@/components/orders/OrderShippingCarrierPicker";
import { adminRequest } from "@/lib/adminApi";
import { hardRefreshAdminResource } from "@/lib/adminFreshnessActions";
import { useAcceptedAdminResourceRevision } from "@/lib/useAcceptedAdminResourceRevision";
import { ExactOrdersV2 } from "./ExactOrdersV2";
import { ExactManualOrderHost } from "./ExactManualOrderHost";
import { ExactWorkspaceModal } from "./ExactWorkspaceModal";

const ORDERS_RESOURCE_PATH = "/api/orders?range=all&payment=all&q=";

function ManualOrderWorkspace({
  open,
  onClose,
  onOrderCreated,
}: {
  open: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
}) {
  const { requestTransition, saving } = useSaveLifecycle();

  const requestClose = () => {
    if (saving) return;
    void requestTransition(onClose);
  };

  return (
    <ExactWorkspaceModal
      open={open}
      onClose={requestClose}
      title="Manuel Sipariş Oluştur"
      subtitle="Hızlı sipariş oluştur"
      kind="manual-order"
    >
      <ExactManualOrderHost
        onOrderCreated={onOrderCreated}
        onOpenCreatedOrder={onClose}
      />
    </ExactWorkspaceModal>
  );
}

export function ExactOrdersPopupHost() {
  const [open, setOpen] = useState(false);
  const [manualRevision, setManualRevision] = useState(0);
  const acceptedRevision = useAcceptedAdminResourceRevision("orders");

  useEffect(() => {
    let active = true;
    let running = false;

    const refresh = async () => {
      if (!active || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        // Önce Basit Kargo'daki güncel durumu Commerce Core'a uzlaştır,
        // ardından doğrulanmış canlı sipariş kaynağını yeniden oku.
        await adminRequest("/api/shipping/basit-kargo/reconcile", {
          method: "POST",
          body: "{}",
        });
        if (!active) return;
        await hardRefreshAdminResource(ORDERS_RESOURCE_PATH);
      } catch {
        // Arka plan senkronu geçici olarak başarısızsa son doğrulanmış liste korunur.
      } finally {
        running = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const intercept = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const link = target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("/orders/new")) return;
    event.preventDefault();
    setOpen(true);
  };

  return (
    <OrderShippingCarrierPicker>
      <div onClickCapture={intercept} data-orders-live-revision={acceptedRevision}>
        <ExactOrdersV2 key={`${manualRevision}:${acceptedRevision}`} />
        <SaveLifecycleProvider>
          <ManualOrderWorkspace
            open={open}
            onClose={() => setOpen(false)}
            onOrderCreated={() => setManualRevision((current) => current + 1)}
          />
        </SaveLifecycleProvider>
      </div>
    </OrderShippingCarrierPicker>
  );
}
