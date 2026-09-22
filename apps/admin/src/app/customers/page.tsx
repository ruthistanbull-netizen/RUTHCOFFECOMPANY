import { Suspense } from "react";
import { ExactCustomers } from "@/components/base44-exact/ExactCustomers";

export default function CustomersPage() {
  return <Suspense fallback={<div className="ruth-loading-state">Müşteriler yükleniyor…</div>}><ExactCustomers /></Suspense>;
}
