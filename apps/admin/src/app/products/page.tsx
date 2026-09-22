import { ProductManager } from "@/components/ProductManager";

export default function ProductsPage() {
  return (
    <>
      <header className="admin-page-header">
        <div><p className="admin-kicker">KATALOG</p><h1>Ürünler</h1><p>Storefront ürünlerini aynı Supabase veritabanından oluştur, düzenle ve yayınla.</p></div>
      </header>
      <ProductManager />
    </>
  );
}
