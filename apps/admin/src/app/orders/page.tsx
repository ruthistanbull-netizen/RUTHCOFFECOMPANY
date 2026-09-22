import { Suspense } from "react";
import { ExactOrdersV2 } from "@/components/base44-exact/ExactOrdersV2";

export default function OrdersPage() {
  return <Suspense fallback={<div className="ruth-loading-state">Siparişler yükleniyor…</div>}><ExactOrdersV2 /></Suspense>;
}
