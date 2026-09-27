"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { productPrimaryDetailImageSrc } from "@/lib/productDisplayImage";
import type { Product } from "@/types/site";

const CONSENT_KEY = "ruth_analytics_consent_v1";
const HISTORY_KEY = "storefront_recently_viewed_v1";
const HISTORY_CAP = 24;

type RecentItem = {
  id: string;
  slug: string;
  name: string;
  image: string;
  viewedAt: number;
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

function readHistory(): RecentItem[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentItem =>
        Boolean(
          item
          && typeof item.id === "string"
          && typeof item.slug === "string"
          && typeof item.name === "string"
          && typeof item.image === "string"
          && typeof item.viewedAt === "number",
        ),
      )
      .slice(0, HISTORY_CAP);
  } catch {
    return [];
  }
}

function writeHistory(items: RecentItem[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, HISTORY_CAP)));
  } catch {
    // History is an optional enhancement; storefront must still work without storage.
  }
}

function clearHistory() {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function ProductRecentlyViewed({ current, settings }: Props) {
  const [history, setHistory] = useState<RecentItem[]>([]);
  const [consent, setConsent] = useState<"accepted" | "rejected" | null>(null);

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
    }

    const onConsent = (event: Event) => {
      const value = (event as CustomEvent<"accepted" | "rejected">).detail;
      if (value !== "accepted" && value !== "rejected") return;
      setConsent(value);
      if (value === "rejected") {
        clearHistory();
        setHistory([]);
      } else {
        setHistory(readHistory());
      }
    };

    window.addEventListener("ruth:analytics-consent", onConsent as EventListener);
    return () => window.removeEventListener("ruth:analytics-consent", onConsent as EventListener);
  }, []);

  useEffect(() => {
    if (consent !== "accepted") return;

    const snapshot: RecentItem = {
      id: String(current.id),
      slug: current.slug,
      name: current.name,
      image: productPrimaryDetailImageSrc(current) || "",
      viewedAt: Date.now(),
    };
    const next = [
      snapshot,
      ...readHistory().filter((item) => item.slug !== snapshot.slug),
    ].slice(0, HISTORY_CAP);

    writeHistory(next);
    setHistory(next);
  }, [consent, current]);

  const limit = settingNumber(settings, "limit", 8, 2, 12);
  const layout = settingText(settings, "layout", "slider") === "grid" ? "grid" : "slider";
  const title = settingText(settings, "title", "Son Görüntülenenler");
  const paddingY = settingNumber(settings, "paddingY", 58, 0, 240);

  const items = useMemo(
    () => history.filter((item) => item.slug !== current.slug).slice(0, limit),
    [current.slug, history, limit],
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
          {items.map((item) => (
            <Link
              key={item.slug}
              href={`/products/${item.slug}`}
              className="recent-viewed-card group block min-w-0"
            >
              <div className="aspect-[4/5] overflow-hidden rounded-[18px] bg-current/5">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <p className="mt-3 truncate font-heading text-base leading-tight">{item.name}</p>
            </Link>
          ))}
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
