"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { adminRequest } from "@/lib/adminApi";

type ReturnOrder = { id: string; order_no: string };

export function ReturnsDeepLinkBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== "/returns") return;
    const orderId = searchParams.get("order")?.trim();
    if (!orderId) return;

    let cancelled = false;
    void adminRequest<{ orders?: ReturnOrder[] }>("/api/returns?range=all")
      .then((result) => {
        if (cancelled) return;
        const order = (result.orders || []).find((item) => String(item.id) === orderId);
        const next = new URLSearchParams(searchParams.toString());
        next.delete("order");
        if (order?.order_no) next.set("q", order.order_no);
        router.replace(next.toString() ? `/returns?${next.toString()}` : "/returns", { scroll: false });
      })
      .catch(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams.toString());
        next.delete("order");
        router.replace(next.toString() ? `/returns?${next.toString()}` : "/returns", { scroll: false });
      });

    return () => { cancelled = true; };
  }, [pathname, router, searchParams]);

  return null;
}
