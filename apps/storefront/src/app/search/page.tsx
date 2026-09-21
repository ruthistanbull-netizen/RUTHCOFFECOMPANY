import type { Metadata } from "next";
import { StorefrontSearchClient } from "@/components/search/StorefrontSearchClient";

export const metadata: Metadata = {
  title: "Arama",
  description: "Ruth Istanbul ürün, koleksiyon ve kategori araması.",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialQuery = Array.isArray(params.q) ? params.q[0] || "" : params.q || "";

  return (
    <main className="min-h-screen bg-ivory px-4 pb-24 pt-32 md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 text-center md:mb-14">
          <p className="text-xs uppercase tracking-wide-luxe text-gold-dark">Ruth Arama</p>
          <h1 className="mt-3 font-heading text-4xl text-ink md:text-5xl">Aradığın Parçayı Bul</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-ruth">
            Ürünleri, koleksiyonları ve kategorileri tek arama alanında keşfet.
          </p>
        </header>
        <StorefrontSearchClient initialQuery={initialQuery} />
      </div>
    </main>
  );
}
