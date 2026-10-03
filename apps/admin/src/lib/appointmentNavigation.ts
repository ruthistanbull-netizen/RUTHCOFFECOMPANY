import { APPOINTMENT_STATUSES } from "@ruth-commerce/commerce-core/appointments";

// Only list state is carried between the list and a detail, never an arbitrary redirect.
export function appointmentListSearch(params: { get: (key:string) => string | null }) {
  const next = new URLSearchParams();
  const query = (params.get("q") || "").trim().slice(0,160);
  const status = params.get("status");
  const context = params.get("context");
  const page = Number(params.get("page") || 1);
  if (query) next.set("q",query);
  if (APPOINTMENT_STATUSES.some(item => item.value === status)) next.set("status",status!);
  if (context === "studio" || context === "wholesale") next.set("context",context);
  if (Number.isSafeInteger(page) && page > 1 && page <= 10000) next.set("page",String(page));
  return next.toString();
}
