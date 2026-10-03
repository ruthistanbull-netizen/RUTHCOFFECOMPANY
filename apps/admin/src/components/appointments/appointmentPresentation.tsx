import { APPOINTMENT_STATUSES, type Appointment } from "@ruth-commerce/commerce-core/appointments";
import { MEETING_PREFERENCES } from "@ruth-commerce/commerce-core/business-inquiry";
import { ExactStatusBadge } from "../base44-exact/primitives";

export const kindLabel = (context:string) => context === "studio" ? "ROSTA.Studio" : "Toptan Kahve";
export const meetingLabel = (value:string) => MEETING_PREFERENCES.find(item => item.value === value)?.label || value;
export function AppointmentBadge({ row }: {row:Appointment}) {
  return <ExactStatusBadge status={row.status} label={APPOINTMENT_STATUSES.find(s => s.value === row.status)?.label} tone={row.status === "pending" ? "warning" : row.status === "confirmed" ? "info" : row.status === "completed" ? "success" : "neutral"} />;
}
export function ErrorText({error}:{error?:string}) {
  return error ? <p role="alert" className="ruth-type-caption mt-1 text-danger">{error}</p> : null;
}
