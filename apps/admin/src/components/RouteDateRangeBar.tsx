"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { DateRangeControl, type AdminDateRangeValue } from "@/components/DateRangeControl";

const enabledRoutes = ["/shipping", "/returns", "/abandoned-carts"];

function enabled(pathname: string) {
  if (pathname === "/shipping/operations" || pathname === "/returns/shipping") return false;
  return enabledRoutes.some((route) => pathname === route);
}

export function RouteDateRangeBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = useMemo<AdminDateRangeValue>(() => {
    const raw = searchParams.get("range") || "today";
    const parts = raw.startsWith("custom:") ? raw.split(":") : null;
    return {
      range: parts ? "custom" : raw as AdminDateRangeValue["range"],
      from: parts?.[1] || "",
      to: parts?.[2] || "",
    };
  }, [searchParams]);
  const [value, setValue] = useState(initial);

  if (!enabled(pathname)) return null;

  const navigate = (next: AdminDateRangeValue) => {
    setValue(next);
    if (next.range === "custom" && (!next.from || !next.to)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next.range === "custom" ? `custom:${next.from}:${next.to}` : next.range);
    const target = `${pathname}?${params.toString()}`;
    if (target !== `${window.location.pathname}${window.location.search}`) window.location.assign(target);
  };

  return (
    <section className="cr-route-date-bar" aria-label="Sayfa tarih filtresi">
      <div><span className="cr-eyebrow">Rapor aralığı</span><strong>Gösterilen kayıtların tarihi</strong></div>
      <DateRangeControl value={value} onChange={navigate} compact />
    </section>
  );
}
