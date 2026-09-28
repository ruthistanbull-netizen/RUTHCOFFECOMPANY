"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import type { Product } from "@/types/site";

type BundleCard = {
  id: string;
  name: string;
  slug: string;
  price: Product["price"];
  compare_at_price: Product["compare_at_price"];
  currency: Product["currency"];
  image_url: string | null;
  stock_status: Product["stock_status"];
};

type BundlePayload = { ok?: boolean; products?: BundleCard[] };
type Props = { current: Product; settings?: Record<string, unknown> };

function settingText(settings: Record<string, unknown> | undefined, key: string, fallback: string) {
  const value = settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function ProductBundleSection({ current, settings }: Props) {
  const source = settingText(settings, "source", "related") === "all" ? "all" : "related";
  const layout = settingText(settings, "layout", "grid") === "slider" ? "slider" : "grid";
  const cta = settingText(settings, "cta", "Paketi İncele").slice(0, 80);
  const [items, setItems] = useState<BundleCard[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setItems([]);

    void fetch(
      `/api/products/${encodeURIComponent(current.slug)}/bundles?source=${source}`,
      { cache: "force-cache", credentials: "same-origin", signal: controller.signal, headers: { Accept: "application/json" } },
    )
      .then(async (response) => {
        if (!response.ok) return { ok: false, products: [] } satisfies BundlePayload;
        return (await response.json()) as BundlePayload;
      })
      .then((payload) => {
        if (!alive) return;
        setItems(payload.ok && Array.isArray(payload.products) ? payload.products.slice(0, 12) : []);
      })
      .catch((error) => {
        if (!alive || (error instanceof DOMException && error.name === "AbortError")) return;
        setItems([]);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [current.slug, source]);

  if (!items.length) return null;

  return (
    <section
      data-editor-id={`bundle:${current.id}`}
      data-editor-type="bundle"
      data-editor-label="Birlikte Alınanlar / Bundle"
      className={`store-design-bundle ${layout === "slider" ? "is-slider" : "is-grid"}`}
      aria-labelledby={`bundle-title-${current.id}`}
    >
      <div className="store-design-bundle__inner">
        <div className="store-design-bundle__heading">
          <p>{source === "all" ? "Paket Seçkisi" : "Bu ürünle birlikte"}</p>
          <h2 id={`bundle-title-${current.id}`}>Birlikte Alınanlar</h2>
        </div>
        <div className="store-design-bundle__list" data-product-browser-ignore>
          {items.map((item) => {
            const displayPrice = Number(item.price || 0);
            const compareAt = Number(item.compare_at_price || 0);
            const hasDiscount = Number.isFinite(compareAt) && compareAt > displayPrice && displayPrice > 0;
            return (
              <Link
                key={item.id}
                href={`/products/${item.slug}`}
                className="store-design-bundle__card"
                onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })}
              >
                <div className="store-design-bundle__media">
                  {item.image_url ? <img src={item.image_url} alt={item.name} loading="lazy" /> : null}
                </div>
                <div className="store-design-bundle__copy">
                  <small>Paket ürün</small>
                  <strong>{item.name}</strong>
                  <div className="store-design-bundle__price">
                    {hasDiscount ? <del>{formatPrice(compareAt, item.currency || "TRY")}</del> : null}
                    <span>{formatPrice(displayPrice, item.currency || "TRY")}</span>
                  </div>
                  <span className="store-design-bundle__cta">{item.stock_status === "out_of_stock" ? "Paketi Gör" : cta}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      <style>{`
        .store-design-bundle{position:relative;z-index:2;padding:58px 0;background:var(--ruth-color-surface,var(--cream,#f7f0e6));color:var(--ruth-color-text-primary,var(--ink,#111))}
        .store-design-bundle__inner{width:min(calc(100% - 36px),1280px);margin:0 auto}
        .store-design-bundle__heading p{margin:0;font-size:8px;letter-spacing:.2em;text-transform:uppercase;opacity:.58}
        .store-design-bundle__heading h2{margin:7px 0 0;font-family:var(--font-heading);font-size:clamp(1.35rem,2.3vw,2.25rem);font-weight:400}
        .store-design-bundle__list{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:22px}
        .store-design-bundle.is-slider .store-design-bundle__list{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
        .store-design-bundle.is-slider .store-design-bundle__list::-webkit-scrollbar{display:none}
        .store-design-bundle.is-slider .store-design-bundle__card{flex:0 0 min(290px,74vw);scroll-snap-align:start}
        .store-design-bundle__card{min-width:0;color:inherit;text-decoration:none}
        .store-design-bundle__media{aspect-ratio:4/5;overflow:hidden;background:color-mix(in srgb,currentColor 6%,transparent)}
        .store-design-bundle__media img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .45s ease}
        .store-design-bundle__card:hover .store-design-bundle__media img{transform:scale(1.018)}
        .store-design-bundle__copy{padding:11px 1px 0}.store-design-bundle__copy small{display:block;font-size:7px;letter-spacing:.14em;text-transform:uppercase;opacity:.52}
        .store-design-bundle__copy strong{display:block;margin-top:5px;font-size:12px;font-weight:500;line-height:1.35}
        .store-design-bundle__price{display:flex;align-items:center;gap:7px;margin-top:6px;font-size:11px}.store-design-bundle__price del{opacity:.45}
        .store-design-bundle__cta{display:inline-flex;margin-top:10px;border-bottom:1px solid currentColor;padding-bottom:2px;font-size:8px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
        @media(max-width:767px){.store-design-bundle{padding:44px 0;content-visibility:auto;contain-intrinsic-size:620px}.store-design-bundle__inner{width:100%}.store-design-bundle__heading{padding:0 9px}.store-design-bundle__list{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 5px;margin-top:16px;padding:0 6px}.store-design-bundle.is-slider .store-design-bundle__list{gap:8px;padding:0 9px}.store-design-bundle.is-slider .store-design-bundle__card{flex-basis:min(210px,62vw)}.store-design-bundle__copy{padding:7px 1px 4px}.store-design-bundle__copy strong{font-size:10px}.store-design-bundle__price{font-size:9px}}
      `}</style>
    </section>
  );
}
