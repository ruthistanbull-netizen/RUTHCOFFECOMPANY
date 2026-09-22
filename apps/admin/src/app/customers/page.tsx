"use client";

import { ResourceTable } from "@/components/ResourceTable";

export default function CustomersPage() {
  return (
    <>
      <header className="admin-page-header"><div><p className="admin-kicker">CRM</p><h1>Müşteriler</h1><p>Üyeler ve siparişlerden oluşan ortak müşteri read-model görünümü.</p></div></header>
      <ResourceTable endpoint="/api/customers" dataKey="customers" empty="Henüz müşteri bulunamadı." columns={[
        { key:"full_name", label:"Müşteri" },
        { key:"email", label:"E-posta" },
        { key:"phone", label:"Telefon" },
        { key:"city", label:"Şehir" },
        { key:"order_count", label:"Sipariş" },
        { key:"total_spent", label:"Toplam", render:(row)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(Number(row.total_spent||0)) },
        { key:"last_order_no", label:"Son Sipariş" },
        { key:"is_member", label:"Üyelik", render:(row)=><span className="admin-pill">{row.is_member?"Üye":"Misafir"}</span> },
      ]}/>
    </>
  );
}
