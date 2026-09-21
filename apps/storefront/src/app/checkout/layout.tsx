import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CheckoutIdentityGuard } from "@/components/checkout/CheckoutIdentityGuard";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <CheckoutIdentityGuard />
      {children}
    </>
  );
}
