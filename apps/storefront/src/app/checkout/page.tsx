import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@ruth-commerce/ui";
import { PaytrIframeCheckoutClient } from "@/components/checkout/PaytrIframeCheckoutClient";
import { PaytrTrustPanel } from "@/components/checkout/PaytrTrustPanel";
import { CheckoutDiscountLabelEnhancer } from "@/components/checkout/CheckoutDiscountLabelEnhancer";
import { getStoreDesignV2Preview, getStoreDesignV2Published } from "@/data/site";
import { storeDesignSectionsForTemplatePath } from "@/lib/storeDesignV2Sections";
import { ShippingLocationEnhancer } from "@/components/checkout/ShippingLocationEnhancer";

export const metadata: Metadata = {
  title: "Ödeme",
  description: "ROSTA Coffee Co. güvenli PayTR ödeme sayfası.",
};

function CheckoutLoading() {
  return (
    <div className="phase1d-checkout-loading">
      <LoadingState label="Ödeme sayfası hazırlanıyor" description="Sepet ve güvenli ödeme bilgileri yükleniyor." />
    </div>
  );
}

// Production checkout: details, order review, then dedicated PayTR iFrame V2 payment step. Release: 2026-07-25 order operations and confirmation email.
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const previewToken = typeof query.storeDesignV2Preview === "string" ? query.storeDesignV2Preview : "";
  const [published, preview] = await Promise.all([
    getStoreDesignV2Published(),
    previewToken ? getStoreDesignV2Preview(previewToken) : Promise.resolve(null),
  ]);
  const activeDocument = preview || published;
  const crossSellSection = storeDesignSectionsForTemplatePath(activeDocument, "/checkout")
    .find((section) => section.type === "cross-sell");
  const crossSellConfig = crossSellSection
    ? { id: crossSellSection.id, enabled: crossSellSection.enabled, settings: crossSellSection.v2Settings || {} }
    : null;

  return (
    <>
      <div className="phase1d-checkout-shell">
        <Suspense fallback={<CheckoutLoading />}>
          <PaytrIframeCheckoutClient crossSellConfig={crossSellConfig} />
        </Suspense>
      </div>
      <ShippingLocationEnhancer />
      <CheckoutDiscountLabelEnhancer />
      <PaytrTrustPanel />
    </>
  );
}
