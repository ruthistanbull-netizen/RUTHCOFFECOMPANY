"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";

type Summary = {
  averageRating: number;
  reviewCount: number;
};

type IdleApi = {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const summaryCache = new Map<string, Summary | null>();
const summaryRequests = new Map<string, Promise<Summary | null>>();

function loadSummary(key: string, url: string) {
  if (summaryCache.has(key)) {
    return Promise.resolve(summaryCache.get(key) || null);
  }

  const pending = summaryRequests.get(key);
  if (pending) return pending;

  const request = fetch(url)
    .then((response) => response.json())
    .then((data) => {
      if (!data?.ok) return null;
      return {
        averageRating: Number(data.averageRating || 0),
        reviewCount: Number(data.reviewCount || 0),
      } satisfies Summary;
    })
    .catch(() => null)
    .then((summary) => {
      summaryCache.set(key, summary);
      return summary;
    })
    .finally(() => {
      summaryRequests.delete(key);
    });

  summaryRequests.set(key, request);
  return request;
}

export function ProductReviewMini({ productId, productSlug }: { productId: string; productSlug?: string | null }) {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams();
    if (productId) params.set("productId", productId);
    if (productSlug) params.set("slug", productSlug);
    const key = productId || productSlug || "";
    if (!key) return;

    const run = () => {
      void loadSummary(key, `/api/reviews/summary?${params.toString()}`).then((data) => {
        if (!alive || !data) return;
        setSummary(data);
      });
    };

    const idleApi = window as unknown as IdleApi;
    const useIdleCallback = typeof idleApi.requestIdleCallback === "function";
    const idleId = useIdleCallback
      ? idleApi.requestIdleCallback!(run, { timeout: 1200 })
      : window.setTimeout(run, 650);

    return () => {
      alive = false;
      if (useIdleCallback && idleApi.cancelIdleCallback) {
        idleApi.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [productId, productSlug]);

  if (!summary || summary.reviewCount <= 0) return null;

  return (
    <div className="mt-2 flex w-full flex-col items-center justify-center gap-1 text-center text-[0.65rem] leading-none text-ink sm:text-[0.72rem]">
      <span className="flex items-center justify-center gap-0.5 text-ink" aria-label={`${summary.averageRating.toFixed(1)} yıldız`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} size={12} className={index < Math.round(summary.averageRating) ? "fill-current" : ""} strokeWidth={1.6} />
        ))}
      </span>
      <span>{summary.reviewCount} değerlendirme</span>
    </div>
  );
}
