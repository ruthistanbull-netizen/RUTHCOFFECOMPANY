import { MEETING_PREFERENCES, TIME_SLOTS, parseBusinessDate, slotIsPast, formatBusinessDate, type BusinessInquiry } from "./business-inquiry.ts";

export const APPOINTMENT_STATUSES = [
  { value: "pending", label: "Yeni talep" },
  { value: "confirmed", label: "Onaylandı" },
  { value: "completed", label: "Tamamlandı" },
  { value: "cancelled", label: "İptal edildi" },
] as const;
export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number]["value"];
export type Appointment = {
  id: string; source: "storefront" | "manual"; context: "studio" | "wholesale";
  inquiry: BusinessInquiry; business_name: string; contact_name: string;
  scheduled_date: string; scheduled_time: string; meeting: string; address: string;
  status: AppointmentStatus; admin_notes: string; revision: number;
  created_at: string; updated_at: string;
};
export type AppointmentEdit = Pick<Appointment, "scheduled_date" | "scheduled_time" | "meeting" | "address" | "status" | "admin_notes">;
export const isAppointmentId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function appointmentEdit(row: Appointment): AppointmentEdit {
  return { scheduled_date: row.scheduled_date, scheduled_time: row.scheduled_time, meeting: row.meeting, address: row.address, status: row.status, admin_notes: row.admin_notes };
}
export function validateAppointmentEdit(edit: AppointmentEdit, previous: Appointment, now = new Date()) {
  const errors: Partial<Record<keyof AppointmentEdit, string>> = {};
  if (!APPOINTMENT_STATUSES.some(item => item.value === edit.status)) errors.status = "Geçerli bir durum seç.";
  if (!parseBusinessDate(edit.scheduled_date)) errors.scheduled_date = "Geçerli bir tarih seç.";
  if (!(TIME_SLOTS as readonly string[]).includes(edit.scheduled_time)) errors.scheduled_time = "Geçerli bir saat aralığı seç.";
  const rescheduled = edit.scheduled_date !== previous.scheduled_date || edit.scheduled_time !== previous.scheduled_time;
  if ((rescheduled || (edit.status === "confirmed" && previous.status !== "confirmed")) && slotIsPast(edit.scheduled_date, edit.scheduled_time, now)) errors.scheduled_time = "Onaylamak veya yeniden planlamak için gelecek bir saat seç.";
  if (!MEETING_PREFERENCES.some(item => item.value === edit.meeting)) errors.meeting = "Görüşme tercihini seç.";
  if (edit.meeting === "in_person" && (edit.address.trim().length < 10 || edit.address.length > 600)) errors.address = "İlçe ve şehir bilgileriyle açık adres yaz (10–600 karakter).";
  if (edit.admin_notes.length > 4000) errors.admin_notes = "Not en fazla 4.000 karakter olabilir.";
  return errors;
}
export function appointmentNotification(payload: Record<string, unknown>) {
  if (!isAppointmentId(payload.appointment_id)) return null;
  const text = (key: string) => typeof payload[key] === "string" ? (payload[key] as string).trim() : "";
  const context = payload.context === "studio" ? "ROSTA.Studio" : "Toptan Kahve";
  return {
    title: `Yeni randevu talebi · ${context}`,
    body: `${text("business_name") || "Bir işletme"} · ${formatBusinessDate(text("date"))} · ${text("time")}`,
    url: `/appointments?appointment=${payload.appointment_id}`,
    tag: `rosta-appointment-${payload.appointment_id}`,
    type: "appointment",
  };
}
