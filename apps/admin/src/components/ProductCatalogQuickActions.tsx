"use client";

import Link from "next/link";
import { FolderPlus, Layers3, Plus } from "lucide-react";
import { usePathname } from "next/navigation";

export function ProductCatalogQuickActions() {
  const pathname = usePathname();
  if (pathname !== "/products") return null;

  return (
    <nav className="cr-product-catalog-quick" aria-label="Ürün kategori ve koleksiyon hızlı işlemleri">
      <span><Plus /> Ürün grubu ekle</span>
      <Link href="/catalog/new/category"><FolderPlus /> Kategori ekle</Link>
      <Link href="/catalog/new/collection"><Layers3 /> Koleksiyon ekle</Link>
    </nav>
  );
}
