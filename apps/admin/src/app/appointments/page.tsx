import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAppointmentId } from "@ruth-commerce/commerce-core/appointments";
import { appointmentListSearch } from "@/lib/appointmentNavigation";
import { ExactAppointments } from "@/components/base44-exact/ExactAppointments";

type Search = Record<string,string|string[]|undefined>;
export default async function AppointmentsPage({searchParams}:{searchParams:Promise<Search>}) {
  const search = await searchParams;
  const id = search.appointment;
  // Preserve notifications delivered before the detail became a dedicated route.
  if (isAppointmentId(id)) {
    const listSearch = appointmentListSearch({get:key => typeof search[key] === "string" ? search[key] as string : null});
    redirect(`/appointments/${id}${listSearch ? `?${listSearch}` : ""}`);
  }
  return <Suspense fallback={<p role="status">Randevular yükleniyor…</p>}><ExactAppointments /></Suspense>;
}
