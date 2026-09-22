"use client";

import { ResourceTable } from "@/components/ResourceTable";

export default function ProductsPage() {
  return (
    <>
      <header className="admin-page-header"><div><p className="admin-kicker">KATALOG</p><h1>Ürünler</h1><p>Storefront ürün kataloğu. Kart oranları ve storefront yapısı panelden bağımsız olarak 3:4 kalır.</p></div></header>
      <ResourceTable endpoint="/api/products" dataKey="products" empty="Henüz ürün bulunamadı." columns={[
        { key: "name", label: "Ürün" },
        { key: "status", label: "Durum", render: (row) => <span className="admin-pill">{row.status || "active"}</span> },
        { key: "price", label: "Fiyat", render: (row) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: row.currency || "TRY" }).format(Number(row.price || 0)) },
        { key: "stock_status", label: "Stok" },
        { key: "updated_at", label: "Güncelleme", render: (row) => row.updated_at ? new Date(row.updated_at).toLocaleString("tr-TR") : "—" },
      ]} />
    </>
  );
}
