import { InventoryManager } from "@/components/InventoryManager";

export default function InventoryPage(){
  return <>
    <header className="admin-page-header"><div><p className="admin-kicker">STOK</p><h1>Stok Yönetimi</h1><p>Ürün varyantlarının stok ve fiyat bilgileri storefront ile aynı kaynaktan güncellenir.</p></div></header>
    <InventoryManager/>
  </>;
}
