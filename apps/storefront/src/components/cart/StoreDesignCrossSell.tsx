"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { STORE_DESIGN_CROSS_SELL_SETTINGS_EVENT } from "@/components/theme/SemanticThemeRuntimeProvider";
import { formatPrice } from "@/lib/formatPrice";

export type StoreDesignCrossSellConfig = {
  id: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
};

type CrossSellCard = {
  id: string;
  name: string;
  slug: string;
  price: number | string | null;
  compare_at_price: number | string | null;
  currency: string | null;
  image_url: string | null;
  stock_status: string;
};

type Props = {
  context: "cart" | "checkout";
  slot: "after-items" | "before-totals";
  cartSlugs: string[];
  initialConfig?: StoreDesignCrossSellConfig | null;
};

function settingText(settings: Record<string, unknown> | undefined, key: string, fallback: string) {
  const value = settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function settingNumber(settings: Record<string, unknown> | undefined, key: string, fallback: number) {
  const value = Number(settings?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function StoreDesignCrossSell({
  context,
  slot,
  cartSlugs,
  initialConfig = null,
}: Props) {
  const [config, setConfig] = useState<StoreDesignCrossSellConfig | null>(initialConfig);
  const [items, setItems] = useState<CrossSellCard[]>([]);
  const [editorPreview, setEditorPreview] = useState(false);

  useEffect(() => setConfig(initialConfig), [initialConfig]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setEditorPreview(params.get("themeEditor") === "1" || params.get("storeDesignV2") === "1");
    } catch {
      setEditorPreview(false);
    }

    const onSettings = (event: Event) => {
      const detail = (event as CustomEvent<{
        cart?: StoreDesignCrossSellConfig | null;
        checkout?: StoreDesignCrossSellConfig | null;
      }>).detail;
      if (!detail) return;
      setConfig(context === "cart" ? detail.cart || null : detail.checkout || null);
    };

    window.addEventListener(STORE_DESIGN_CROSS_SELL_SETTINGS_EVENT, onSettings as EventListener);
    return () => window.removeEventListener(STORE_DESIGN_CROSS_SELL_SETTINGS_EVENT, onSettings as EventListener);
  }, [context]);

  const source = settingText(config?.settings, "source", "related");
  const position = settingText(config?.settings, "position", "after-items");
  const density = settingText(config?.settings, "density", "standard");
  const limit = Math.min(8, Math.max(2, Math.round(settingNumber(config?.settings, "limit", 4))));
  const slugKey = useMemo(
    () => [...new Set(cartSlugs.map((value) => value.trim()).filter(Boolean))].sort().join(","),
    [cartSlugs],
  );

  useEffect(() => {
    if (!config?.enabled || position !== slot || (!slugKey && !editorPreview)) {
      setItems([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      items: slugKey,
      source,
      limit: String(limit),
    });
    if (editorPreview) params.set("preview", "1");

    void fetch(`/api/cart/cross-sell?${params.toString()}`, {
      cache: "force-cache",
      credentials: "same-origin",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => response.ok ? response.json() : { ok: false, products: [] })
      .then((payload) => {
        setItems(payload?.ok && Array.isArray(payload.products) ? payload.products.slice(0, limit) : []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setItems([]);
      });

    return () => controller.abort();
  }, [config?.enabled, editorPreview, limit, position, slugKey, slot, source]);

  if (!config?.enabled || position !== slot || !items.length) return null;

  return (
    <section
      data-editor-id={`section:${config.id}`}
      data-editor-type="cross-sell"
      data-editor-label="Cross-sell / Upsell"
      className={`store-design-cross-sell density-${density}`}
    >
      <div className="store-design-cross-sell__head">
        <span>Senin için seçtik</span>
        <strong>Birlikte iyi gider</strong>
      </div>
      <div className="store-design-cross-sell__list">
        {items.map((item) => {
          const displayPrice = Number(item.price || 0);
          const compareAt = Number(item.compare_at_price || 0);
          const hasDiscount = Number.isFinite(compareAt) && compareAt > displayPrice && displayPrice > 0;
          return (
            <Link key={item.id} href={`/products/${item.slug}`} className="store-design-cross-sell__card">
              <div className="store-design-cross-sell__media">
                {item.image_url ? <img src={item.image_url} alt={item.name} loading="lazy" /> : null}
              </div>
              <div className="store-design-cross-sell__copy">
                <strong>{item.name}</strong>
                <div>
                  {hasDiscount ? <del>{formatPrice(compareAt, item.currency || "TRY")}</del> : null}
                  <span>{formatPrice(displayPrice, item.currency || "TRY")}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      <style>{`
        .store-design-cross-sell{min-width:0;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent);padding:14px 0}
        .store-design-cross-sell__head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:0 2px 10px}
        .store-design-cross-sell__head span{font-size:7px;letter-spacing:.14em;text-transform:uppercase;opacity:.52}
        .store-design-cross-sell__head strong{font-size:11px;font-weight:600}
        .store-design-cross-sell__list{display:flex;gap:9px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
        .store-design-cross-sell__list::-webkit-scrollbar{display:none}
        .store-design-cross-sell__card{display:grid;flex:0 0 190px;grid-template-columns:58px minmax(0,1fr);gap:9px;align-items:center;scroll-snap-align:start;color:inherit;text-decoration:none}
        .store-design-cross-sell__media{aspect-ratio:1;overflow:hidden;border-radius:10px;background:color-mix(in srgb,currentColor 6%,transparent)}
        .store-design-cross-sell__media img{display:block;width:100%;height:100%;object-fit:cover}
        .store-design-cross-sell__copy{min-width:0}.store-design-cross-sell__copy>strong{display:-webkit-box;overflow:hidden;font-size:9px;font-weight:600;line-height:1.3;-webkit-box-orient:vertical;-webkit-line-clamp:2}
        .store-design-cross-sell__copy>div{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;font-size:8px}.store-design-cross-sell__copy del{opacity:.45}
        .store-design-cross-sell.density-compact .store-design-cross-sell__card{flex-basis:165px;grid-template-columns:48px minmax(0,1fr)}
        .store-design-cross-sell.density-comfortable .store-design-cross-sell__card{flex-basis:220px;grid-template-columns:68px minmax(0,1fr)}
        @media(min-width:768px){.store-design-cross-sell__card{flex-basis:220px}.store-design-cross-sell.density-comfortable .store-design-cross-sell__card{flex-basis:250px}}
      `}</style>
    </section>
  );
}
