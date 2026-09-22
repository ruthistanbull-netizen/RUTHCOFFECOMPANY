"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProductImage from "@/components/ProductImage";
import { formatPrice } from "@/lib/formatPrice";
import type { Product } from "@/types/site";

const RECOMMENDATION_LIMIT = 6;

type ProductBrowserWindowPayload = {
  ok?: boolean;
  window?: {
    previous: Product | null;
    current: Product;
    next: Product | null;
  };
};

type ProductRecommendationsProps = {
  current: Product;
  previous: Product | null;
  next: Product | null;
};

type ProductDirection = "previous" | "next";

function uniqueProducts(products: Array<Product | null | undefined>, currentId: string) {
  const seen = new Set<string>([String(currentId)]);
  return products.filter((product): product is Product => {
    if (!product) return false;
    const id = String(product.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function relationScore(current: Product, candidate: Product) {
  const currentCollections = new Set(
    [...(current.collection_ids || []), current.collection_id]
      .filter(Boolean)
      .map(String),
  );
  const currentCategories = new Set((current.category_ids || []).map(String));
  const candidateCollections = [
    ...(candidate.collection_ids || []),
    candidate.collection_id,
  ]
    .filter(Boolean)
    .map(String);
  const candidateCategories = (candidate.category_ids || []).map(String);

  let score = 0;
  if (candidateCollections.some((id) => currentCollections.has(id))) score += 6;
  if (candidateCategories.some((id) => currentCategories.has(id))) score += 3;
  if (
    current.material &&
    candidate.material &&
    current.material.toLocaleLowerCase("tr-TR") ===
      candidate.material.toLocaleLowerCase("tr-TR")
  ) {
    score += 1;
  }
  return score;
}

async function fetchWindow(slug: string) {
  try {
    const response = await fetch(
      `/api/products/${encodeURIComponent(slug)}/browser-window`,
      {
        credentials: "same-origin",
        cache: "force-cache",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as ProductBrowserWindowPayload;
    return payload.ok && payload.window ? payload.window : null;
  } catch {
    return null;
  }
}

async function walkProducts(
  seed: Product | null,
  direction: ProductDirection,
  limit: number,
) {
  const products: Product[] = [];
  const seen = new Set<string>();
  let cursor = seed;

  while (cursor && products.length < limit) {
    const id = String(cursor.id);
    if (seen.has(id)) break;
    seen.add(id);
    products.push(cursor);

    if (products.length >= limit) break;
    const windowData = await fetchWindow(cursor.slug);
    cursor = windowData?.[direction] || null;
  }

  return products;
}

function sortRecommendations(current: Product, products: Product[]) {
  return [...products].sort((left, right) => {
    const scoreDifference =
      relationScore(current, right) - relationScore(current, left);
    if (scoreDifference) return scoreDifference;
    return (
      Number(left.sort_order ?? Number.MAX_SAFE_INTEGER) -
        Number(right.sort_order ?? Number.MAX_SAFE_INTEGER) ||
      left.name.localeCompare(right.name, "tr")
    );
  });
}

export function ProductRecommendations({
  current,
  previous,
  next,
}: ProductRecommendationsProps) {
  const initialItems = useMemo(
    () => uniqueProducts([next, previous], current.id),
    [current.id, next, previous],
  );
  const [items, setItems] = useState<Product[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    setItems(initialItems.slice(0, RECOMMENDATION_LIMIT));

    const load = async () => {
      const [forward, backward] = await Promise.all([
        walkProducts(next, "next", 3),
        walkProducts(previous, "previous", 3),
      ]);
      if (cancelled) return;

      let candidates = uniqueProducts([...forward, ...backward], current.id);

      if (candidates.length < RECOMMENDATION_LIMIT) {
        const forwardTail = forward.at(-1) || null;
        if (forwardTail) {
          const extraForward = await walkProducts(
            forwardTail,
            "next",
            RECOMMENDATION_LIMIT - candidates.length + 1,
          );
          candidates = uniqueProducts(
            [...candidates, ...extraForward.slice(1)],
            current.id,
          );
        }
      }

      if (candidates.length < RECOMMENDATION_LIMIT) {
        const backwardTail = backward.at(-1) || null;
        if (backwardTail) {
          const extraBackward = await walkProducts(
            backwardTail,
            "previous",
            RECOMMENDATION_LIMIT - candidates.length + 1,
          );
          candidates = uniqueProducts(
            [...candidates, ...extraBackward.slice(1)],
            current.id,
          );
        }
      }

      if (cancelled) return;
      setItems(
        sortRecommendations(current, candidates).slice(0, RECOMMENDATION_LIMIT),
      );
    };

    const host = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (host.requestIdleCallback) {
      idleHandle = host.requestIdleCallback(() => void load(), { timeout: 900 });
    } else {
      timeoutHandle = window.setTimeout(() => void load(), 120);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null) host.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, [current, initialItems, next, previous]);

  if (!items.length) return null;

  return (
    <section className="product-recommendations" aria-labelledby="product-recommendations-title">
      <div className="product-recommendations-heading">
        <p>Ruth Seçkisi</p>
        <h2 id="product-recommendations-title">Bunları da beğenebilirsin</h2>
      </div>
      <div className="product-recommendations-grid" data-product-browser-ignore>
        {items.slice(0, RECOMMENDATION_LIMIT).map((item) => {
          const image = item.main_image_url || item.image_urls?.[0] || null;
          return (
            <Link
              key={item.id}
              href={`/products/${item.slug}`}
              scroll
              className="product-recommendation-card"
              onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })}
            >
              <ProductImage
                product={item}
                imageUrl={image}
                alt={item.name}
                mode="card"
                fit="cover"
                className="product-recommendation-media"
              />
              <div className="product-recommendation-copy">
                <small>{item.collections?.name || "ROSTA Coffee Co."}</small>
                <strong>{item.name}</strong>
                <span>{formatPrice(Number(item.price || 0), item.currency || "TRY")}</span>
              </div>
            </Link>
          );
        })}
      </div>
      <style>{`
        .product-recommendations{padding:58px 0 68px;background:var(--cream)}
        .product-recommendations-heading{padding:0 max(18px,calc((100vw - 1280px)/2)) 20px}
        .product-recommendations-heading p{margin:0;color:var(--gold-dark);font-size:8px;letter-spacing:.2em;text-transform:uppercase}
        .product-recommendations-heading h2{margin:7px 0 0;font-family:var(--font-heading);font-size:clamp(1.35rem,2.3vw,2.25rem);font-weight:400}
        .product-recommendations-grid{display:grid;width:min(calc(100% - 36px),1280px);margin:0 auto;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .product-recommendation-card{min-width:0;color:inherit;text-decoration:none}
        .product-recommendation-media{aspect-ratio:3/4;background:var(--ivory)}
        .product-recommendation-copy{padding:11px 2px 0}
        .product-recommendation-copy small{display:block;color:var(--gold-dark);font-size:7px;letter-spacing:.14em;text-transform:uppercase}
        .product-recommendation-copy strong{display:block;margin-top:5px;font-size:12px;font-weight:500;line-height:1.35}
        .product-recommendation-copy span{display:block;margin-top:5px;font-size:11px}
        @media(max-width:767px){
          .product-recommendations{position:relative;z-index:2;padding:28px 0 34px;content-visibility:auto;contain-intrinsic-size:650px}
          .product-recommendations-heading{padding:0 9px 13px}
          .product-recommendations-grid{width:100%;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,auto);gap:6px 5px;padding:0 6px}
          .product-recommendation-card{overflow:hidden}
          .product-recommendation-media{width:100%;aspect-ratio:3/4}
          .product-recommendation-copy{min-width:0;padding:7px 1px 4px}
          .product-recommendation-copy small{overflow:hidden;font-size:6px;line-height:1.2;letter-spacing:.09em;text-overflow:ellipsis;white-space:nowrap}
          .product-recommendation-copy strong{display:-webkit-box;min-height:2.35em;margin-top:3px;overflow:hidden;font-size:9.5px;line-height:1.18;-webkit-box-orient:vertical;-webkit-line-clamp:2}
          .product-recommendation-copy span{margin-top:3px;font-size:9px;line-height:1.2;white-space:nowrap}
        }
      `}</style>
    </section>
  );
}
