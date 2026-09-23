"use client";

import { type ReactNode, useLayoutEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function OrdersMobileDetailRouteBridge({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order") || "";
  const movingToDetail = pathname === "/orders" && Boolean(orderId);

  useLayoutEffect(() => {
    if (!movingToDetail) return;
    router.replace(`/orders/${encodeURIComponent(orderId)}`, { scroll: false });
  }, [movingToDetail, orderId, router]);

  if (movingToDetail) {
    return (
      <div className="flex min-h-[42vh] items-center justify-center" aria-live="polite">
        <div className="flex items-center gap-2 text-xs font-medium text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
          Güncel sipariş yükleniyor...
        </div>
      </div>
    );
  }

  return children;
}
