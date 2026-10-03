import { notFound } from "next/navigation";
import { isAppointmentId } from "@ruth-commerce/commerce-core/appointments";
import { appointmentListSearch } from "@/lib/appointmentNavigation";
import { ExactAppointmentDetailPage } from "@/components/appointments/ExactAppointmentDetailPage";

export default async function AppointmentDetailPage({params,searchParams}:{
  params:Promise<{id:string}>;
  searchParams:Promise<Record<string,string|string[]|undefined>>;
}) {
  const {id} = await params;
  if (!isAppointmentId(id)) notFound();
  const search = await searchParams;
  const query = appointmentListSearch({get:key => typeof search[key] === "string" ? search[key] as string : null});
  return <ExactAppointmentDetailPage key={id} appointmentId={id} backHref={`/appointments${query ? `?${query}` : ""}`}/>;
}
