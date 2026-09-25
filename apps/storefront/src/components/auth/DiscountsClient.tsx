"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgePercent, TicketPercent, UserRound } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type AccountDiscount = {
  code: string;
  title: string;
  discountPercent: number;
  expiresAt?: string | null;
};

export function DiscountsClient() {
  const router = useRouter();
  const { user, session, isLoading } = useAuth();
  const [discounts, setDiscounts] = useState<AccountDiscount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoading) return;
    if (!session?.access_token) {
      setDiscounts([]);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);

    fetch("/api/review-coupons/list", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (!alive || !data?.ok) return;
        setDiscounts(data.discounts || []);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, [isLoading, session?.access_token]);

  const applyDiscount = (discount: AccountDiscount) => {
    window.localStorage.setItem("ruth-selected-discount-code", discount.code);
    router.push("/checkout");
  };

  if (isLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-carbon px-4 pt-20 text-cream" role="status" aria-busy="true">
        <LoadingIndicator size="lg" className="text-brick" label="İndirimler yükleniyor" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-carbon px-4 pt-20 text-center text-cream">
        <div className="max-w-md rounded-2xl border border-kraft/35 bg-carbon-soft p-8">
          <UserRound className="mx-auto mb-5 text-brick" size={34} />
          <h1 className="font-heading text-4xl">Giriş yapman gerekiyor</h1>
          <p className="mt-4 text-sm leading-7 text-cream/70">İndirimlerini görmek için hesabına giriş yap.</p>
          <Link href="/login?redirect=/account/discounts" className="mt-7 inline-block bg-brick px-8 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)]">
            Giriş Yap
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-carbon px-4 pb-24 pt-28 md:px-8 md:pt-32 text-cream">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-wide-luxe text-brick">Hesabım</p>
          <h1 className="font-heading text-4xl md:text-5xl">İndirimlerim</h1>
          <p className="mt-4 text-sm leading-7 text-cream/70">Yorum ve değerlendirmelerden kazandığın aktif indirimler burada görünür.</p>
        </div>

        {discounts.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {discounts.map((discount) => (
              <div key={discount.code} className="rounded-2xl border border-kraft/35 bg-carbon-soft p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide-luxe text-cream/70">Aktif indirim</p>
                    <h2 className="mt-3 font-heading text-2xl">%{discount.discountPercent} Yorum İndirimi</h2>
                    <p className="mt-2 text-sm leading-6 text-cream/70">
                      Ödeme ekranında direkt seçip kullanabilirsin. Kod girmen gerekmez.
                    </p>
                    {discount.expiresAt && (
                      <p className="mt-2 text-xs text-cream/70">Son kullanım: {new Date(discount.expiresAt).toLocaleDateString("tr-TR")}</p>
                    )}
                  </div>
                  <BadgePercent className="shrink-0 text-brick" size={28} />
                </div>
                <button
                  type="button"
                  onClick={() => applyDiscount(discount)}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 bg-brick px-6 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)]"
                >
                  <TicketPercent size={16} /> İndirimi Kullan
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-kraft/35 bg-carbon-soft p-8 text-center">
            <BadgePercent className="mx-auto mb-4 text-brick" size={34} />
            <h2 className="font-heading text-2xl">Aktif indirimin yok</h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-cream/70">
              Bir ürün için yorum bıraktığında yorum indirimin burada görünür ve ödeme ekranında seçilerek kullanılabilir.
            </p>
            <Link href="/products" className="mt-6 inline-block bg-brick px-7 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)]">
              Ürünleri Keşfet
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
