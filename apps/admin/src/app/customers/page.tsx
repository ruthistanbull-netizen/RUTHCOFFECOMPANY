import { ResourceTable } from "@/components/ResourceTable";

export default function CustomersPage() {
  return (
    <>
      <header className="admin-page-header"><div><p className="admin-kicker">CRM</p><h1>Müşteriler</h1><p>Üyeler ve siparişlerden oluşan müşteri read-model görünümü.</p></div></header>
      <ResourceTable endpoint="/api/customers" dataKey="customers" empty="Henüz müşteri bulunamadı." columns={[
        { key: "full_name", label: "Müşteri" },
        { key: "email", label: "E-posta" },
        { key: "phone", label: "Telefon" },
        { key: "city", label: "Şehir" },
        { key: "last_order_no", label: "Son Sipariş" },
        { key: "is_member", label: "Üyelik", render: (row) => <span className="admin-pill">{row.is_member ? "Üye" : "Misafir"}</span> },
      ]} />
    </>
  );
}
