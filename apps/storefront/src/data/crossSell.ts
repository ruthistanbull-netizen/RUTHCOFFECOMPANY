import { getCachedBestSellingProducts } from "@/data/catalogCache";
import { getProducts } from "@/data/catalogReadModel";
import type { Product } from "@/types/site";

export type CrossSellSource = "related" | "best-sellers" | "new-arrivals";

function relationScore(anchor: Product, candidate: Product) {
  const anchorCollections = new Set(
    [...(anchor.collection_ids || []), anchor.collection_id]
      .filter(Boolean)
      .map(String),
  );
  const anchorCategories = new Set((anchor.category_ids || []).map(String));
  const candidateCollections = [
    ...(candidate.collection_ids || []),
    candidate.collection_id,
  ].filter(Boolean).map(String);
  const candidateCategories = (candidate.category_ids || []).map(String);

  let score = 0;
  if (candidateCollections.some((id) => anchorCollections.has(id))) score += 6;
  if (candidateCategories.some((id) => anchorCategories.has(id))) score += 3;
  if (
    anchor.material
    && candidate.material
    && anchor.material.toLocaleLowerCase("tr-TR") === candidate.material.toLocaleLowerCase("tr-TR")
  ) score += 1;
  return score;
}

function activeCandidate(product: Product, excluded: Set<string>) {
  return product.status === "active"
    && product.stock_status !== "out_of_stock"
    && !excluded.has(String(product.id))
    && !excluded.has(product.slug);
}

function catalogOrder(left: Product, right: Product) {
  return (
    Number(left.sort_order ?? Number.MAX_SAFE_INTEGER)
    - Number(right.sort_order ?? Number.MAX_SAFE_INTEGER)
    || left.name.localeCompare(right.name, "tr")
  );
}

export async function getCrossSellProducts({
  anchorSlugs,
  source = "related",
  limit = 4,
  preview = false,
}: {
  anchorSlugs: string[];
  source?: CrossSellSource;
  limit?: number;
  preview?: boolean;
}): Promise<Product[]> {
  const safeLimit = Math.min(8, Math.max(2, Math.round(Number(limit) || 4)));
  const catalog = await getProducts();
  const normalizedSlugs = [...new Set(anchorSlugs.map((value) => value.trim()).filter(Boolean))].slice(0, 20);
  const anchors = catalog.filter((product) => normalizedSlugs.includes(product.slug));
  const excluded = new Set<string>(
    anchors.flatMap((product) => [String(product.id), product.slug]),
  );

  const candidates = catalog.filter((product) => activeCandidate(product, excluded));
  if (!candidates.length) return [];

  if (source === "best-sellers") {
    const ranked = await getCachedBestSellingProducts(30, Math.max(12, safeLimit * 3));
    const filtered = ranked.filter((product) => activeCandidate(product, excluded));
    if (filtered.length) return filtered.slice(0, safeLimit);
  }

  if (source === "new-arrivals") {
    const fresh = candidates
      .filter((product) => Boolean(product.is_new))
      .sort(catalogOrder);
    if (fresh.length) return fresh.slice(0, safeLimit);
  }

  const relationAnchors = anchors.length
    ? anchors
    : preview
      ? catalog.filter((product) => product.status === "active").slice(0, 2)
      : [];

  if (relationAnchors.length) {
    const scored = candidates
      .map((product) => ({
        product,
        score: relationAnchors.reduce(
          (best, anchor) => Math.max(best, relationScore(anchor, product)),
          0,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || catalogOrder(left.product, right.product))
      .map((entry) => entry.product);
    if (scored.length) return scored.slice(0, safeLimit);
  }

  return candidates.sort(catalogOrder).slice(0, safeLimit);
}
