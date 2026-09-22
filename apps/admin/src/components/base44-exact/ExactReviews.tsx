"use client";

import { Check, MessageSquareText, RefreshCw, ShieldCheck, Star, Ticket, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { hardRefreshAdminResource } from "@/lib/adminFreshnessActions";
import { ExactButton, ExactIconButton, ExactPageHeader, ExactSegmentedControl, ExactSkeleton, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactDataCard, ExactEmptyState, ExactMetricCard } from "./data";

type Review = {
  id: string;
  product_name: string | null;
  product_slug: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  status: string;
  reviewer_name: string | null;
  reviewer_email: string | null;
  coupon_code: string | null;
  created_at: string | null;
};
type ReviewStatus = "pending" | "approved" | "rejected";
type ReviewsResponse = { reviews?: Review[] };

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function Stars({ value }: { value: number }) {
  return <span className="inline-flex gap-0.5" aria-label={`${value} / 5 yıldız`}>
    {Array.from({ length: 5 }).map((_, index) => <Star key={index} className={`h-4 w-4 ${index < value ? "fill-warning text-warning" : "text-border-strong"}`} />)}
  </span>;
}

export function ExactReviews() {
  const toast = useExactToast();
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const reviewPath = useMemo(() => `/api/reviews?status=${status}`, [status]);

  const applyReviews = useCallback((result: ReviewsResponse) => {
    setReviews(result.reviews || []);
  }, []);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      if (mode === "refresh") {
        applyReviews((await hardRefreshAdminResource<ReviewsResponse>(reviewPath)).value);
      } else {
        applyReviews(await adminRequest<ReviewsResponse>(reviewPath));
        void hardRefreshAdminResource<ReviewsResponse>(reviewPath)
          .then((result) => { if (result.accepted) applyReviews(result.value); })
          .catch(() => undefined);
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Yorumlar alınamadı.");
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [applyReviews, reviewPath, toast]);

  useEffect(() => { void load("initial"); }, [load]);

  const stats = useMemo(() => ({
    count: reviews.length,
    average: reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length : 0,
    coupons: reviews.filter((review) => Boolean(review.coupon_code)).length,
  }), [reviews]);

  const update = async (review: Review, nextStatus: ReviewStatus) => {
    setBusy(review.id);
    try {
      await adminRequest("/api/reviews/status", { method: "PUT", body: JSON.stringify({ id: review.id, status: nextStatus }) });
      toast.success(nextStatus === "approved" ? "Yorum onaylandı ve ürün sayfasında yayınlanabilir." : nextStatus === "rejected" ? "Yorum reddedildi." : "Yorum yeniden incelemeye alındı.");
      await load("refresh");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Yorum durumu güncellenemedi.");
    } finally {
      setBusy(null);
    }
  };

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="reviews">
    <ExactPageHeader
      title="Yorum ve Değerlendirmeler"
      subtitle="Müşteri yorumlarını incele, onayla veya reddet"
      actions={<ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load("refresh")} loading={loading || refreshing} />}
    />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <ExactMetricCard label="Bu Sekmedeki Yorum" value={stats.count} icon={MessageSquareText} />
      <ExactMetricCard label="Ortalama Puan" value={Number(stats.average.toFixed(1))} icon={Star} />
      <ExactMetricCard label="Kuponlu Değerlendirme" value={stats.coupons} icon={Ticket} />
      <ExactMetricCard label="Moderasyon" value={1} icon={ShieldCheck} />
    </div>
    <ExactSegmentedControl value={status} onChange={(value) => setStatus(value as ReviewStatus)} options={[{ value: "pending", label: "Onay Bekleyen" }, { value: "approved", label: "Onaylı" }, { value: "rejected", label: "Reddedilen" }]} />
    {loading ? <div className="grid md:grid-cols-2 gap-3"><ExactSkeleton className="h-72" /><ExactSkeleton className="h-72" /></div> : !reviews.length ? <ExactDataCard><ExactEmptyState icon={MessageSquareText} title="Bu durumda yorum yok" description="Diğer moderasyon sekmelerini kontrol et." /></ExactDataCard> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
      {reviews.map((review) => <ExactDataCard key={review.id} className="flex flex-col" bodyClassName="flex flex-col h-full">
        <div className="flex items-start justify-between gap-3">
          <div><p className="ruth-type-label font-semibold uppercase tracking-wide text-accent">{review.product_name || review.product_slug || "Ürün"}</p><h3 className="ruth-type-card-title mt-1 text-main">{review.title || "Başlıksız yorum"}</h3><div className="mt-2"><Stars value={Number(review.rating || 0)} /></div></div>
          <ExactStatusBadge status={review.status} label={review.status === "approved" ? "Onaylı" : review.status === "rejected" ? "Reddedildi" : "Bekliyor"} size="sm" />
        </div>
        <p className="ruth-type-body mt-4 flex-1 text-muted">{review.comment || "Yorum metni yok."}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="p-2.5 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Yazan</p><p className="ruth-type-table truncate font-medium text-main">{review.reviewer_name || "Anonim"}</p></div>
          <div className="p-2.5 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Kupon</p><p className="ruth-type-code truncate text-main">{review.coupon_code || "—"}</p></div>
        </div>
        <p className="ruth-type-caption mt-3 text-subtle">{review.reviewer_email || "E-posta yok"} · {dateTime(review.created_at)}</p>
        <div className="flex gap-2 mt-4">
          {status === "pending" ? <>
            <ExactButton size="sm" className="flex-1" onClick={() => void update(review, "approved")} loading={busy === review.id}><Check className="h-4 w-4" /> Onayla</ExactButton>
            <ExactButton variant="destructive" size="sm" className="flex-1" onClick={() => void update(review, "rejected")} loading={busy === review.id}><X className="h-4 w-4" /> Reddet</ExactButton>
          </> : <ExactButton variant="secondary" size="sm" className="w-full" onClick={() => void update(review, "pending")} loading={busy === review.id}>Yeniden incelemeye al</ExactButton>}
        </div>
      </ExactDataCard>)}
    </div>}
  </div>;
}
