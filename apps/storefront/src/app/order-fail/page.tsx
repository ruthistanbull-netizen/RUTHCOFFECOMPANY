import Link from "next/link";
import type { Metadata } from "next";
import { XCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Ödeme Başarısız",
  description: "Ruth Istanbul ödeme başarısız sayfası.",
};

type Props = {
  searchParams?: Promise<{ order?: string; message?: string }> | { order?: string; message?: string };
};

export default async function OrderFailPage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const message = typeof resolvedSearchParams.message === "string" ? resolvedSearchParams.message : "";
  const orderNo = typeof resolvedSearchParams.order === "string" ? resolvedSearchParams.order : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-4 pt-20 text-center">
      <div className="max-w-lg rounded-xl border border-gold/15 bg-cream p-8">
        <XCircle className="mx-auto mb-5 text-gold-dark" size={40} />
        <p className="mb-3 text-xs uppercase tracking-wide-luxe text-gold-dark">Ödeme Tamamlanmadı</p>
        <h1 className="font-heading text-4xl">Ödeme başarısız oldu</h1>
        <p className="mt-4 text-sm leading-7 text-muted-ruth">
          {message || "Kart onayı alınamadı veya ödeme iptal edildi. Sepetine dönüp tekrar deneyebilirsin."}
        </p>
        {orderNo && <p className="mt-3 text-[11px] text-muted-ruth">Ödeme referansı: {orderNo}</p>}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/checkout" className="bg-ink px-7 py-4 text-xs uppercase tracking-wide-luxe text-cream">
            Tekrar Dene
          </Link>
          <Link href="/products" className="border border-gold/25 px-7 py-4 text-xs uppercase tracking-wide-luxe text-ink">
            Ürünlere Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
