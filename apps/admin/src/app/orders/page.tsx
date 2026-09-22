"use client";

import { ResourceTable } from "@/components/ResourceTable";

export default function OrdersPage() {
  return (
    <>
      <header className="admin-page-header"><div><p className="admin-kicker">OPERASYON</p><h1>Siparişler</h1><p>ROSTA storefront üzerinden oluşan siparişler aynı veritabanından okunur.</p></div></header>
      <ResourceTable endpoint="/api/orders" dataKey="orders" empty="Henüz sipariş bulunamadı." columns={[
        { key: "order_no", label: "Sipariş" },
        { key: "customer_name", label: "Müşteri" },
        { key: "status", label: "Durum", render: (row) => <span className="admin-pill">{row.status || "created"}</span> },
        { key: "payment_status", label: "Ödeme" },
        { key: "total_amount", label: "Tutar", render: (row) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: row.currency || "TRY" }).format(Number(row.total_amount || 0)) },
        { key: "created_at", label: "Tarih", render: (row) => row.created_at ? new Date(row.created_at).toLocaleString("tr-TR") : "—" },
      ]} />
    </>
  );
}
