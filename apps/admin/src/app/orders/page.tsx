import { OrderManager } from "@/components/OrderManager";

export default function OrdersPage(){
  return <>
    <header className="admin-page-header"><div><p className="admin-kicker">OPERASYON</p><h1>Siparişler</h1><p>Storefront siparişleri aynı Supabase veritabanından canlı okunur ve operasyon durumları buradan güncellenir.</p></div></header>
    <OrderManager/>
  </>;
}
