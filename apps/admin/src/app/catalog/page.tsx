import { CatalogManager } from "@/components/CatalogManager";

export default function CatalogPage(){
  return <>
    <header className="admin-page-header"><div><p className="admin-kicker">KATALOG YAPISI</p><h1>Kategori & Koleksiyonlar</h1><p>Storefront menü ve katalog grupları aynı Supabase tablolarından yönetilir.</p></div></header>
    <CatalogManager/>
  </>;
}
