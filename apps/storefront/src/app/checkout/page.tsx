import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@ruth-commerce/ui";
import { PaytrIframeCheckoutClient } from "@/components/checkout/PaytrIframeCheckoutClient";
import { PaytrTrustPanel } from "@/components/checkout/PaytrTrustPanel";
import { ShippingLocationEnhancer } from "@/components/checkout/ShippingLocationEnhancer";
import { CheckoutDiscountLabelEnhancer } from "@/components/checkout/CheckoutDiscountLabelEnhancer";

export const metadata: Metadata = {
  title: "Ödeme",
  description: "Ruth Istanbul güvenli PayTR ödeme sayfası.",
};

function CheckoutLoading() {
  return (
    <div className="phase1d-checkout-loading">
      <LoadingState label="Ödeme sayfası hazırlanıyor" description="Sepet ve güvenli ödeme bilgileri yükleniyor." />
    </div>
  );
}

// Production checkout: details, order review, then dedicated PayTR iFrame V2 payment step. Release: 2026-07-25 order operations and confirmation email.
export default function CheckoutPage() {
  return (
    <>
      <style>{`
        .phase1d-checkout-shell
          form
          > section.min-w-0.space-y-5
          > div:first-child,
        .phase1d-checkout-shell
          form
          > section.min-w-0.space-y-5
          > div:first-child
          > div,
        .phase1d-checkout-shell
          form
          > section.min-w-0.space-y-5
          > div:first-child
          > div
          > div {
          background-color: var(--cream) !important;
        }
      `}</style>
      <div className="phase1d-checkout-shell">
        <Suspense fallback={<CheckoutLoading />}>
          <PaytrIframeCheckoutClient />
        </Suspense>
      </div>
      <CheckoutDiscountLabelEnhancer />
      <ShippingLocationEnhancer />
      <PaytrTrustPanel />
    </>
  );
}
