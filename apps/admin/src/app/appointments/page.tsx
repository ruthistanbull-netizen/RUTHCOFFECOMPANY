import { Suspense } from "react";
import { ExactAppointments } from "@/components/base44-exact/ExactAppointments";

export default function AppointmentsPage() {
  return <Suspense fallback={<p role="status">Randevular yükleniyor…</p>}><ExactAppointments /></Suspense>;
}
