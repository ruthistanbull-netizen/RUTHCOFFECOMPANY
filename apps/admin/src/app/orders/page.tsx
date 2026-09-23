import { Suspense } from "react";
import { CoreListDataGate } from "@/components/CoreListDataGate";
import { CoreLivePageGate } from "@/components/CoreLivePageGate";
import { ExactOrdersPopupHost } from "@/components/base44-exact/ExactOrdersPopupHost";
import { OrdersMobileDetailRouteBridge } from "@/components/orders/OrdersMobileDetailRouteBridge";

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <CoreLivePageGate cacheMatch="/api/orders" label="siparişler">
        <CoreListDataGate kind="orders" label="siparişler">
          <OrdersMobileDetailRouteBridge>
            <ExactOrdersPopupHost />
          </OrdersMobileDetailRouteBridge>
        </CoreListDataGate>
      </CoreLivePageGate>
    </Suspense>
  );
}
