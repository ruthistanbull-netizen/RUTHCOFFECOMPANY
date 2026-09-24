"use client";

import { useMemo, useState } from "react";
import { CommerceStatusBadge, SearchShell, type SearchShellSection } from "@ruth-commerce/ui";

type DemoResult = { id: string; kind: "order" | "customer" | "product"; title: string; description: string; meta?: string; status?: string };
const results: DemoResult[] = [
  { id: "order-1042", kind: "order", title: "RUTH-1042", description: "Elif Kaya · ₺2.480", meta: "Bugün", status: "processing" },
  { id: "customer-elif", kind: "customer", title: "Elif Kaya", description: "elif@example.com", meta: "3 sipariş" },
  { id: "product-nazar", kind: "product", title: "The Nazar Necklace", description: "925 ayar gümüş", meta: "Stok 18" },
];

export default function SearchShellDemo() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => query.trim().length < 2 ? [] : results.filter((item) => `${item.title} ${item.description}`.toLocaleLowerCase("tr-TR").includes(query.trim().toLocaleLowerCase("tr-TR"))), [query]);
  const sections: Array<SearchShellSection<DemoResult>> = (["order", "customer", "product"] as const).map((kind) => ({
    id: kind,
    title: kind === "order" ? "Siparişler" : kind === "customer" ? "Müşteriler" : "Ürünler",
    results: filtered.filter((item) => item.kind === kind),
    getResultKey: (item) => item.id,
    renderResult: (item) => <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span><strong>{item.title}</strong><small style={{ display: "block" }}>{item.description}</small></span><span>{item.meta}{item.status ? <CommerceStatusBadge status={item.status} domain="order" /> : null}</span></div>,
    emptyLabel: "Eşleşen kayıt yok.",
  }));
  return <SearchShell query={query} onQueryChange={setQuery} onSearchSubmit={setQuery} sections={sections} label="Panel genel araması" placeholder="Sipariş, müşteri veya ürün ara" hint="Elif, RUTH veya Nazar yazın." idleDescription="En az iki karakter yazın." />;
}
