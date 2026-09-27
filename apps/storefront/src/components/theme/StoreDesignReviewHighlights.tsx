"use client";

import { useEffect, useMemo, useState } from "react";

type Review = {
  id: string;
  rating: number;
  title?: string | null;
  comment?: string | null;
  reviewer_name?: string | null;
  created_at?: string | null;
  verified_purchase?: boolean;
};

type Summary = {
  averageRating: number;
  reviewCount: number;
  reviews: Review[];
};

type Props = {
  sectionId: string;
  settings?: Record<string, unknown>;
  backgroundColor?: string;
  textColor?: string;
  paddingY?: number;
};

function text(settings: Record<string, unknown>, key: string, fallback = "", max = 1200) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function number(settings: Record<string, unknown>, key: string, fallback: number, min: number, max: number) {
  const parsed = Number(settings[key]);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function Stars({ value }: { value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5 text-brick" aria-label={`${Number(value || 0).toFixed(1)} yıldız`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} aria-hidden="true" className={index < rounded ? "opacity-100" : "opacity-25"}>★</span>
      ))}
    </span>
  );
}

export function StoreDesignReviewHighlights({
  sectionId,
  settings = {},
  backgroundColor,
  textColor,
  paddingY = 72,
}: Props) {
  const productId = text(settings, "productId", "", 160);
  const title = text(settings, "title", "Müşteri Yorumları", 220);
  const body = text(settings, "body", "", 1200);
  const limit = Math.round(number(settings, "limit", 6, 1, 12));
  const ratingDisplay = settings.ratingDisplay !== false;

  const [summary, setSummary] = useState<Summary>({ averageRating: 0, reviewCount: 0, reviews: [] });
  const [loading, setLoading] = useState(Boolean(productId));

  useEffect(() => {
    if (!productId) {
      setSummary({ averageRating: 0, reviewCount: 0, reviews: [] });
      setLoading(false);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/reviews/summary?productId=${encodeURIComponent(productId)}`, {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!alive || !payload?.ok) return;
        setSummary({
          averageRating: Number(payload.averageRating || 0),
          reviewCount: Number(payload.reviewCount || 0),
          reviews: Array.isArray(payload.reviews) ? payload.reviews : [],
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [productId]);

  const reviews = useMemo(() => summary.reviews.slice(0, limit), [summary.reviews, limit]);
  if (!productId) return null;
  if (!loading && !reviews.length) return null;

  return (
    <section
      data-theme-section-id={sectionId}
      data-editor-id={`section:${sectionId}`}
      data-editor-type="review-highlights"
      data-editor-label={title}
      className="px-5 md:px-8"
      style={{
        background: backgroundColor || "transparent",
        color: textColor || "inherit",
        paddingTop: paddingY,
        paddingBottom: paddingY,
      }}
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brick">Değerlendirmeler</p>
            <h2 className="mt-2 font-heading text-[clamp(1.8rem,4vw,3.4rem)] leading-tight">{title}</h2>
            {body ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 opacity-70">{body}</p> : null}
          </div>
          {ratingDisplay && summary.reviewCount > 0 ? (
            <div className="shrink-0 text-left md:text-right">
              <div className="flex items-center gap-2 md:justify-end">
                <Stars value={summary.averageRating} />
                <strong className="font-heading text-xl">{summary.averageRating.toFixed(1)}</strong>
              </div>
              <p className="mt-1 text-xs opacity-55">{summary.reviewCount} değerlendirme</p>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-current/5" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <blockquote
                key={review.id}
                data-editor-id={`review:${review.id}`}
                data-editor-type="review-highlight"
                data-editor-label={review.title || review.reviewer_name || "Müşteri Yorumu"}
                className="rounded-2xl border border-current/10 p-5 md:p-6"
              >
                {ratingDisplay ? <Stars value={Number(review.rating || 0)} /> : null}
                {review.title ? <h3 className="mt-4 font-heading text-lg leading-tight">{review.title}</h3> : null}
                {review.comment ? <p className="mt-3 whitespace-pre-wrap text-sm leading-7 opacity-72">“{review.comment}”</p> : null}
                <footer className="mt-5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] opacity-55">
                  <span>{review.reviewer_name || "Müşteri"}</span>
                  {review.verified_purchase ? <span>· Doğrulanmış alışveriş</span> : null}
                </footer>
              </blockquote>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
