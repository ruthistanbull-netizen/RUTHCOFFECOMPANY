"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchShell, type SearchShellLoadResult } from "@ruth-commerce/ui";
import { formatPrice } from "@/lib/formatPrice";

type ProductResult = {
  kind: "product";
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price?: number | null;
  material?: string | null;
  stock_status?: string | null;
  main_image_url?: string | null;
};

type CollectionResult = {
  kind: "collection";
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  cover_image_url?: string | null;
};

type CategoryResult = {
  kind: "category";
  id: string;
  name: string;
  slug: string;
  description?: string | null;
};

type SearchResult = ProductResult | CollectionResult | CategoryResult;

function SearchResultRow({ result }: { result: SearchResult }) {
  if (result.kind === "product") {
    return (
      <div className="flex items-center justify-between gap-4 text-ink">
        <span className="flex min-w-0 items-center gap-3">
          {result.main_image_url ? (
            <img src={result.main_image_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-ivory font-heading">R</span>
          )}
          <span className="grid min-w-0 gap-1">
            <strong className="truncate font-heading text-base font-medium">{result.name}</strong>
            <small className="truncate text-muted-ruth">{result.material || "Ruth Istanbul"} · {result.stock_status === "out_of_stock" ? "Tükendi" : "Stokta"}</small>
          </span>
        </span>
        <strong className="shrink-0 text-sm">{formatPrice(result.price)}</strong>
      </div>
    );
  }

  if (result.kind === "collection") {
    return (
      <div className="flex items-center justify-between gap-4 text-ink">
        <span className="grid gap-1">
          <strong className="font-heading text-base font-medium">{result.name}</strong>
          <small className="line-clamp-1 text-muted-ruth">{result.description || "Koleksiyonu keşfet"}</small>
        </span>
        <span className="text-xs uppercase tracking-wide-luxe text-gold-dark">Koleksiyon</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 text-ink">
      <span className="grid gap-1">
        <strong className="font-heading text-base font-medium">{result.name}</strong>
        <small className="line-clamp-1 text-muted-ruth">{result.description || "Kategori ürünlerini gör"}</small>
      </span>
      <span className="text-xs uppercase tracking-wide-luxe text-gold-dark">Kategori</span>
    </div>
  );
}

export function StorefrontSearchClient({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const loadSections = useCallback(async (normalized: string, context: { signal: AbortSignal }): Promise<SearchShellLoadResult<SearchResult>> => {
    const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, {
      cache: "no-store",
      signal: context.signal,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Arama yapılamadı.");

    const products: ProductResult[] = (result.products || []).map((item: Omit<ProductResult, "kind">) => ({ ...item, kind: "product" }));
    const collections: CollectionResult[] = (result.collections || []).map((item: Omit<CollectionResult, "kind">) => ({ ...item, kind: "collection" }));
    const categories: CategoryResult[] = (result.categories || []).map((item: Omit<CategoryResult, "kind">) => ({ ...item, kind: "category" }));

    return {
      sections: [
        {
          id: "products",
          title: "Ürünler",
          results: products,
          getResultKey: (item) => item.id,
          getResultLabel: (item) => `${item.name} ${item.kind === "product" ? item.material || "" : ""}`,
          renderResult: (item) => <SearchResultRow result={item} />,
          onResultActivate: (item) => router.push(`/products/${item.slug}`),
          emptyLabel: "Eşleşen ürün bulunamadı.",
        },
        {
          id: "collections",
          title: "Koleksiyonlar",
          results: collections,
          getResultKey: (item) => item.id,
          getResultLabel: (item) => item.name,
          renderResult: (item) => <SearchResultRow result={item} />,
          onResultActivate: (item) => router.push(`/collections/${item.slug}`),
          emptyLabel: "Eşleşen koleksiyon bulunamadı.",
        },
        {
          id: "categories",
          title: "Kategoriler",
          results: categories,
          getResultKey: (item) => item.id,
          getResultLabel: (item) => item.name,
          renderResult: (item) => <SearchResultRow result={item} />,
          onResultActivate: (item) => router.push(`/category/${item.slug}`),
          emptyLabel: "Eşleşen kategori bulunamadı.",
        },
      ],
    };
  }, [router]);

  return (
    <SearchShell
      query={query}
      onQueryChange={setQuery}
      loadSections={loadSections}
      label="Ruth arama"
      placeholder="Ürün, koleksiyon veya kategori ara"
      hint="En az iki karakter yazın. Klavye oklarıyla sonuçlar arasında gezinebilirsiniz."
      idleDescription="Ürünleri, koleksiyonları ve kategorileri birlikte arayın."
    />
  );
}
