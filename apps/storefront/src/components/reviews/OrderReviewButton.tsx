"use client";

import { Star, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

const STAR_GOLD = "#C8A77D";

type Props = {
  orderId: string;
  orderNo: string;
  orderStatus: string;
  orderPaymentStatus: string;
  item: { id: string; product_id?: string | null; product_slug?: string | null; product_name: string; image_url?: string | null };
};

const reviewableStatuses = new Set(["completed", "delivered", "paid", "shipped"]);

export function OrderReviewButton({ orderId, orderNo, orderStatus, orderPaymentStatus, item }: Props) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canReview = reviewableStatuses.has(orderStatus) || orderPaymentStatus === "paid";
  if (!canReview || !item.product_id) return null;

  const submit = async () => {
    if (!session?.access_token) { setMessage("Değerlendirme için tekrar giriş yapman gerekiyor."); return; }
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/reviews/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ orderId, orderNo, orderItemId: item.id, productId: item.product_id, productSlug: item.product_slug, productName: item.product_name, rating, title, comment }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Değerlendirme gönderilemedi.");
      setMessage("Yorumun alındı. İndirimin hesabına eklendi.");
      setTitle(""); setComment("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Değerlendirme gönderilemedi.");
    } finally { setLoading(false); }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-kraft/45 bg-carbon-soft px-4 py-2 text-[10px] uppercase tracking-wide-luxe text-cream transition active:bg-brick active:text-[var(--rosta-action-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick">
        <Star size={12} /> Değerlendir
      </button>
      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-carbon/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-kraft/35 bg-carbon-soft p-5 text-cream shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div><p className="text-xs uppercase tracking-wide-luxe text-brick">Değerlendirme</p><h3 className="mt-2 font-heading text-2xl">{item.product_name}</h3></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-kraft/40 p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"><X size={16} /></button>
            </div>
            <div className="mb-4 flex gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <button key={index} type="button" onClick={() => setRating(index + 1)} style={{ color: STAR_GOLD }}><Star size={28} className={index < rating ? "fill-current" : ""} /></button>
              ))}
            </div>
            <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">Başlık<input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-2 w-full rounded-lg border border-kraft/35 bg-carbon px-4 py-3 text-sm outline-none" placeholder="Kısa bir başlık" /></label>
            <label className="mt-4 block text-xs uppercase tracking-wide-luxe text-cream/70">Yorum<textarea value={comment} onChange={(e) => setComment(e.target.value)} className="mt-2 min-h-28 w-full rounded-lg border border-kraft/35 bg-carbon px-4 py-3 text-sm outline-none" placeholder="Ürünle ilgili deneyimini yaz" /></label>
            {message && <p className="mt-4 rounded-lg bg-carbon px-3 py-2 text-xs leading-5 text-cream/70">{message}</p>}
            <button type="button" onClick={submit} disabled={loading} className="mt-5 w-full bg-brick px-5 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] active:bg-espresso disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick">{loading ? "Gönderiliyor..." : "Yorumu Gönder"}</button>
          </div>
        </div>
      )}
    </>
  );
}
