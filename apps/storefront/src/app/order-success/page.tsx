import type { Metadata } from "next";
import { PaytrOrderResult } from "@/components/checkout/PaytrOrderResult";
import "@/components/checkout/PaytrOrderResult.success.css";

export const metadata: Metadata = {
  title: "Siparişiniz Tamamlandı",
  description: "Ruth Istanbul sipariş başarı sayfası.",
};

type Props = {
  searchParams?: Promise<{ order?: string }> | { order?: string };
};

export default async function OrderSuccessPage({ searchParams }: Props) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const orderNo = typeof resolvedSearchParams.order === "string" ? resolvedSearchParams.order : undefined;

  return (
    <div className="order-success-page min-h-screen bg-ivory px-4 pb-8 pt-24 text-center md:pt-32">
      <PaytrOrderResult orderNo={orderNo} />
    </div>
  );
}
