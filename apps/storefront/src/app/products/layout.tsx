import type { ReactNode } from "react";
import { ProductPageRecovery } from "@/components/product/ProductPageRecovery";

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ProductPageRecovery />
      {children}
    </>
  );
}
