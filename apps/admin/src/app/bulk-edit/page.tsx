import { Suspense } from "react";
import { ExactProductsPopupHost } from "@/components/base44-exact/ExactProductsPopupHost";

export default function BulkEditPage() {
  return (
    <Suspense fallback={null}>
      <ExactProductsPopupHost />
    </Suspense>
  );
}
