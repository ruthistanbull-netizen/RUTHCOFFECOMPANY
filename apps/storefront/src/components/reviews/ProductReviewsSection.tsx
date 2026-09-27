"use client";

import Link from "next/link";
import { Star, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

const STAR_GOLD = "#C8A77D";

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

function Stars({ value, size = 16, interactive = false, onSelect }: { value: number; size?: number; interactive?: boolean; onSelect?: (rating: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5" style={{ color: STAR_GOLD }}>
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index < Math.round(value);
        if (interactive) {
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect?.(index + 1)}
              className="premium-touch p-0.5 transition "
              aria-label={`${index + 1} yıldız ver`}
            >
              <Star size={size} className={filled ? "fill-current" : ""} strokeWidth={1.8} />
            </button>
          );
        }
        return <Star key={index} size={size} className={filled ? "fill-current" : ""} strokeWidth={1.7} />;
      })}
    </span>
  );
}

export function ProductReviewsSection({ productId, productSlug, productName }: { productId: string; productSlug: string; productName?: string }) {
  const { session, isLoading, isLoggedIn } = useAuth();
  const [summary, setSummary] = useState<Summary>({ averageRating: 0, reviewCount: 0, reviews: [] });
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const authRedirect = useMemo(() => `/products/${productSlug}#degerlendirmeler`, [productSlug]);

  const loadReviews = () => {
    setLoading(true);
    const params = new URLSearchParams({ productId, slug: productSlug });
    fetch(`/api/reviews/summary?${params.toString()}`)
      .then((response) => response.json())
      .then((data) => {
        if (!data?.ok) return;
        setSummary({ averageRating: Number(data.averageRating || 0), reviewCount: Number(data.reviewCount || 0), reviews: data.reviews || [] });
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ productId, slug: productSlug });
    fetch(`/api/reviews/summary?${params.toString()}`)
      .then((response) => response.json())
      .then((data) => {
        if (!alive || !data?.ok) return;
        setSummary({ averageRating: Number(data.averageRating || 0), reviewCount: Number(data.reviewCount || 0), reviews: data.reviews || [] });
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [productId, productSlug]);

  const submitReview = async () => {
    if (!session?.access_token) {
      setMessage("Yorum yazmak için giriş yapman gerekiyor.");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ productId, productSlug, productName, rating, title, comment }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Yorum gönderilemedi.");
      setTitle("");
      setComment("");
      setRating(5);
      setMessage("Yorumun alındı. İndirimin hesabına eklendi.");
      loadReviews();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Yorum gönderilemedi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      data-editor-id={`reviews:${productId}`}
      data-editor-type="reviews"
      data-editor-label="Yorumlar"
      id="degerlendirmeler" className="bg-carbon px-4 py-12 md:px-8 md:py-16">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-2xl border border-kraft/35 bg-carbon-soft p-4 md:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide-luxe text-brick">Yorumlar</p>
              <h2 className="font-heading text-2xl md:text-3xl">Değerlendirmeler</h2>
              <p className="mt-2 text-sm leading-6 text-cream/70">Ürünle ilgili deneyimini paylaşabilir, diğer müşterilerin yorumlarını inceleyebilirsin.</p>
            </div>
            <div className="text-left sm:text-right">
              {summary.reviewCount > 0 ? (
                <>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <Stars value={summary.averageRating} size={18} />
                    <span className="font-heading text-xl">{summary.averageRating.toFixed(1)}</span>
                  </div>
                  <p className="mt-1 text-xs text-cream/70">{summary.reviewCount} değerlendirme</p>
                </>
              ) : (
                <p className="text-sm text-cream/70">Henüz değerlendirme yok.</p>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {loading ? (
              <div className="h-24 animate-pulse rounded-xl bg-carbon" />
            ) : summary.reviews.length ? (
              summary.reviews.map((review) => (
                <article key={review.id} className="rounded-xl border border-kraft/25 bg-carbon p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading text-base">{review.reviewer_name || "ROSTA Coffee müşterisi"}</p>
                        {review.verified_purchase && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-kraft/40 bg-carbon-soft px-2 py-1 text-[10px] uppercase tracking-wide-luxe text-brick">
                            <CheckCircle2 size={12} /> Satın alınmış
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-cream/70">{review.created_at ? new Date(review.created_at).toLocaleDateString("tr-TR") : ""}</p>
                    </div>
                    <Stars value={Number(review.rating || 0)} />
                  </div>
                  {review.title && <p className="mt-3 font-heading text-lg">{review.title}</p>}
                  {review.comment && <p className="mt-2 text-sm leading-7 text-cream/70">{review.comment}</p>}
                </article>
              ))
            ) : (
              <div className="rounded-xl border border-kraft/25 bg-carbon p-5 text-sm leading-7 text-cream/70">
                Bu ürün için yorum henüz yok. İlk yorumu sen bırakabilirsin.
              </div>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-kraft/25 bg-carbon p-3 md:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-heading text-lg">Yorum Yaz</p>
                <p className="mt-1 text-xs leading-5 text-cream/70">Giriş yapan herkes yorum bırakabilir. Satın alan müşteriler “Satın alınmış” olarak görünür.</p>
              </div>
              {!isLoading && !isLoggedIn && (
                <div className="flex shrink-0 gap-2">
                  <Link href={`/login?redirect=${encodeURIComponent(authRedirect)}`} className="inline-flex items-center justify-center border border-brick px-4 py-2 text-[10px] uppercase tracking-wide-luxe text-cream">
                    Giriş Yap
                  </Link>
                  <Link href={`/register?redirect=${encodeURIComponent(authRedirect)}`} className="inline-flex items-center justify-center bg-brick px-4 py-2 text-[10px] uppercase tracking-wide-luxe text-[var(--rosta-action-text)]">
                    Kayıt Ol
                  </Link>
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="mt-4 h-16 animate-pulse rounded-xl bg-carbon-soft" />
            ) : isLoggedIn ? (
              <div className="mt-4">
                <div className="mb-3 flex items-center gap-3">
                  <Stars value={rating} size={23} interactive onSelect={setRating} />
                  <span className="text-xs text-cream/70">{rating}/5</span>
                </div>
                <div className="grid gap-3 md:grid-cols-[0.9fr_1.4fr]">
                  <label className="block text-[10px] uppercase tracking-wide-luxe text-cream/70">
                    Başlık
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-2 w-full rounded-lg border border-kraft/35 bg-carbon-soft px-3 py-2 text-sm outline-none transition focus:border-brick/45"
                      placeholder="Kısa başlık"
                      maxLength={90}
                    />
                  </label>
                  <label className="block text-[10px] uppercase tracking-wide-luxe text-cream/70">
                    Yorum
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      className="mt-2 min-h-20 w-full rounded-lg border border-kraft/35 bg-carbon-soft px-3 py-2 text-sm outline-none transition focus:border-brick/45"
                      placeholder="Ürünle ilgili deneyimini yaz"
                      maxLength={900}
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {message && <p className="rounded-lg bg-carbon-soft px-3 py-2 text-xs leading-5 text-cream/70">{message}</p>}
                  <button
                    type="button"
                    onClick={submitReview}
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center bg-brick px-5 py-3 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] disabled:opacity-60 sm:ml-auto sm:w-auto"
                  >
                    {submitting ? "Gönderiliyor..." : "Yorumu Gönder"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-carbon-soft px-4 py-3 text-sm leading-6 text-cream/70">
                Yorum yazmak için hesabına giriş yapabilir veya yeni hesap oluşturabilirsin.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
