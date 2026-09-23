import { Suspense } from "react";
import { CoreListDataGate } from "@/components/CoreListDataGate";
import { CoreLivePageGate } from "@/components/CoreLivePageGate";
import { ProductsPageInteractionPatch } from "@/components/base44-exact/ProductsPageInteractionPatch";

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <CoreLivePageGate cacheMatch="/api/products" label="ürünler">
        <CoreListDataGate kind="products" label="ürünler">
          <ProductsPageInteractionPatch />
        </CoreListDataGate>
      </CoreLivePageGate>
    </Suspense>
  );
}
