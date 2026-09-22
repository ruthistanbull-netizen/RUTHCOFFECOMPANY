"use client";

import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type Summary = {
  orders: number;
  revenue: number;
  products: number;
  customers: number;
};

type RecentOrder = {
  id: string;
  order_no?: string | null;
  customer_name?: string | null;
  total_amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  created_at?: string | null;
};

function money(value: unknown, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(Number(value || 0));
}

export function DashboardClient() {
  const [data, setData] = useState<{ summary: Summary; recentOrders: RecentOrder[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminRequest<any>("/api/summary")
      .then((value) => setData({ summary: value.summary, recentOrders: value.recentOrders || [] }))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Veriler alınamadı."));
  }, []);

  if (error) return <div className="admin-error">{error}</div>;
  if (!data) return <div className="admin-loading">Panel verileri yükleniyor…</div>;

  const metrics = [
    ["Net Satış", money(data.summary.revenue)],
    ["Sipariş", data.summary.orders],
    ["Ürün", data.summary.products],
    ["Müşteri", data.summary.customers],
  ];

  return (
    <>
      <div className="admin-grid metrics">
        {metrics.map(([label, value]) => <section className="admin-card admin-card-body admin-metric" key={label}><span>{label}</span><strong>{value}</strong><span>Canlı veritabanı</span></section>)}
      </div>
      <section className="admin-card" style={{ marginTop: 18 }}>
        <div className="admin-card-body"><p className="admin-kicker">SON HAREKETLER</p><h2 style={{ margin: "6px 0 0", fontFamily: "var(--font-archivo)", fontWeight: 900 }}>Son Siparişler</h2></div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Sipariş</th><th>Müşteri</th><th>Durum</th><th>Tutar</th><th>Tarih</th></tr></thead>
            <tbody>
              {data.recentOrders.map((order) => <tr key={order.id}><td>{order.order_no || "—"}</td><td>{order.customer_name || "Müşteri"}</td><td><span className="admin-pill">{order.status || "created"}</span></td><td>{money(order.total_amount, order.currency || "TRY")}</td><td>{order.created_at ? new Date(order.created_at).toLocaleString("tr-TR") : "—"}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
