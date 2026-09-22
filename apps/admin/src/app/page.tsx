import { DashboardClient } from "@/components/DashboardClient";

export default function DashboardPage() {
  return (
    <>
      <header className="admin-page-header"><div><p className="admin-kicker">BAŞLANGIÇ</p><h1>ROSTA Control Room</h1><p>Storefront ile aynı veri kaynağına bağlı canlı operasyon görünümü.</p></div></header>
      <DashboardClient />
    </>
  );
}
