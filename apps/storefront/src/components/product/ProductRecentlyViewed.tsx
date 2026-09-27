"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { productPrimaryDetailImageSrc } from "@/lib/productDisplayImage";
import type { Product } from "@/types/site";

const CONSENT_KEY = "ruth_analytics_consent_v1";
const HISTORY_KEY = "storefront_recently_viewed_v2";
const HISTORY_CAP = 24;

type RecentEntry = {
  slug: string;
  viewedAt: number;
};

type HydratedRecentItem = {
  slug: string;
  viewedAt: number;
  product: Product;
};

type Props = {
  current: Product;
  settings?: Record<string, unknown>;
};

function settingText(settings: Record<string, unknown> | undefined, key: string, fallback: string) {
  const value = settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function settingNumber(settings: Record<string, unknown> | undefined, key: string, fallback: number, min: number, max: number) {
  const value = Number(settings?.[key]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

function readHistory(): RecentEntry[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentEntry =>
        Boolean(
          item
          && typeof item.slug === "string"
          && item.slug.trim()
          && typeof item.viewedAt === "number"
          && Number.isFinite(item.viewedAt),
        ),
      )
      .map((item) => ({ slug: item.slug.trim(), viewedAt: item.viewedAt }))
      .slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

function writeHistory(items: RecentEntry[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_CAP)));
  } catch {
    // Optional enhancement: storefront remains functional when storage is blocked.
  }
}

function clearHistory() {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore strict privacy/storage failures.
  }
}

async function fetchProduct(slug: string, signal: AbortSignal): Promise<Product | null> {
  try {
    const response = await fetch(
      `/api/products/${encodeURIComponent(slug)}/browser-window`,
      {
        credentials: "same-origin",
        cache: "force-cache",
        signal,
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      ok?: boolean;
      window?: { current?: Product | null };
    };
    return payload.ok && payload.window?.current ? payload.window.current : null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    return null;
  }
}

export function ProductRecentlyViewed({ current, settings }: Props) {
  const [history, setHistory] = useState<RecentEntry[]>([]);
  const [products, setProducts] = useState<HydratedRecentItem[]>([]);
  const [consent, setConsent] = useState<"accepted" | "rejected" | null>(null);

  const limit = settingNumber(settings, "limit", 8, 2, 12);
  const layout = settingText(settings, "layout", "slider") === "grid" ? "grid" : "slider";
  const title = settingText(settings, "title", "Son Görüntülenenler");
  const paddingY = settingNumber(settings, "paddingY", 58, 0, 240);

  useEffect(() => {
    const readConsent = () => {
      try {
        const stored = window.localStorage.getItem(CONSENT_KEY);
        return stored === "accepted" || stored === "rejected" ? stored : null;
      } catch {
        return null;
      }
    };

    const initial = readConsent();
    setConsent(initial);

    if (initial === "accepted") setHistory(readHistory());
    if (initial === "rejected") {
      clearHistory();
      setHistory([]);
      setProducts([]);
    }

    const onConsent = (event: Event) => {
      const value = (event as CustomEvent<"accepted" | "rejected">).detail;
      if (value !== "accepted" && value !== "rejected") return;
      setConsent(value);

      if (value === "rejected") {
        clearHistory();
        setHistory([]);
        setProducts([]);
        return;
      }

      setHistory(readHistory());
    };

    window.addEventListener("ruth:analytics-consent", onConsent as EventListener);
    return () => window.removeEventListener("ruth:analytics-consent", onConsent as EventListener);
  }, []);

  useEffect(() => {
    if (consent !== "accepted") return;

    const snapshot: RecentEntry = {
      slug: current.slug,
      viewedAt: Date.now(),
    };

    const next = [
      snapshot,
      ...readHistory().filter((item) => item.slug !== snapshot.slug),
    ].slice(0, HISTORY_CAP);

    writeHistory(next);
    setHistory(next);
  }, [consent, current.slug]);

  useEffect(() => {
    if (consent !== "accepted") {
      setProducts([]);
      return;
    }

    const candidates = history
      .filter((item) => item.slug !== current.slug)
      .slice(0, limit);

    if (!candidates.length) {
      setProducts([]);
      return;
    }

    const controller = new AbortController();
    let alive = true;

    void Promise.all(
      candidates.map(async (entry) => {
        const product = await fetchProduct(entry.slug, controller.signal);
        return product ? { ...entry, product } : null;
      }),
    ).then((items) => {
      if (!alive) return;
      setProducts(items.filter((item): item is HydratedRecentItem => Boolean(item)));
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [consent, current.slug, history, limit]);

  const items = useMemo(
    () => products
      .filter((item) => item.product.status === "active")
      .slice(0, limit),
    [limit, products],
  );

  if (consent !== "accepted" || !items.length) return null;

  return (
    <section
      data-editor-id="recently-viewed-runtime"
      data-editor-type="recently-viewed"
      data-editor-label={title}
      className="overflow-hidden"
      style={{
        paddingTop: paddingY,
        paddingBottom: paddingY,
        background: "var(--ruth-color-surface, var(--rosta-carbon-soft, #171717))",
        color: "var(--ruth-color-text-primary, var(--rosta-cream, #f7f0e6))",
      }}
    >
      <div className="mx-auto max-w-[1440px] px-4 md:px-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] opacity-50">Geçmişin</p>
        <h2 className="mt-2 font-heading text-[clamp(1.8rem,4vw,3.4rem)] leading-tight">{title}</h2>

        <div className={layout === "slider" ? "recent-viewed-list is-slider mt-8" : "recent-viewed-list is-grid mt-8"}>
          {items.map(({ product }) => {
            const image = productPrimaryDetailImageSrc(product) || product.main_image_url || "";
            return (
              <Link
                key={product.slug}
                href={`/products/${product.slug}`}
                className="recent-viewed-card group block min-w-0"
              >
                <div className="aspect-[4/5] overflow-hidden rounded-[18px] bg-current/5">
                  {image ? (
                    <img
                      src={image}
                      alt={product.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : null}
                </div>
                <p className="mt-3 truncate font-heading text-base leading-tight">{product.name}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <style>{`
        .recent-viewed-list.is-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .recent-viewed-list.is-slider{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
        .recent-viewed-list.is-slider::-webkit-scrollbar{display:none}
        .recent-viewed-list.is-slider .recent-viewed-card{flex:0 0 min(220px,62vw);scroll-snap-align:start}
        @media(min-width:768px){
          .recent-viewed-list.is-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
          .recent-viewed-list.is-slider .recent-viewed-card{flex-basis:260px}
        }
      `}</style>
    </section>
  );
}
