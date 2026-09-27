import Link from "next/link";
import type { Metadata } from "next";
import { XCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Ödeme Başarısız",
  description: "ROSTA Coffee Co. ödeme başarısız sayfası.",
};

type Props = {
  searchParams?: Promise<{ order?: string; message?: string }> | { order?: string; message?: string };
};

export default async function OrderFailPage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const message = typeof resolvedSearchParams.message === "string" ? resolvedSearchParams.message : "";
  const orderNo = typeof resolvedSearchParams.order === "string" ? resolvedSearchParams.order : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-carbon px-4 pt-20 text-center text-cream">
      <div className="max-w-lg rounded-xl border border-kraft/35 bg-carbon-soft p-8">
        <XCircle className="mx-auto mb-5 text-brick" size={40} />
        <p className="mb-3 text-xs uppercase tracking-wide-luxe text-brick">Ödeme Tamamlanmadı</p>
        <h1 className="font-heading text-4xl">Ödeme başarısız oldu</h1>
        <p className="mt-4 text-sm leading-7 text-cream/70">
          {message || "Kart onayı alınamadı veya ödeme iptal edildi. Sepetine dönüp tekrar deneyebilirsin."}
        </p>
        {orderNo && <p className="mt-3 text-[11px] text-cream/70">Ödeme referansı: {orderNo}</p>}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/checkout" className="bg-brick px-7 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)]">
            Tekrar Dene
          </Link>
          <Link href="/products" className="border border-kraft/45 px-7 py-4 text-xs uppercase tracking-wide-luxe text-cream">
            Ürünlere Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
