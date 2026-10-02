import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { appointmentColumns, appointmentFailure, readAppointmentBody } from "@/lib/appointmentApi";
import { isAppointmentId, validateAppointmentEdit, type Appointment, type AppointmentEdit } from "@ruth-commerce/commerce-core/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id:string }> };
export async function GET(request:Request,context:Context) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const {id} = await context.params;
  if (!isAppointmentId(id)) return NextResponse.json({ok:false,error:"Geçersiz randevu."},{status:400});
  const {data,error} = await auth.supabase.from("business_appointments").select(appointmentColumns).eq("id",id).maybeSingle();
  if (error) return appointmentFailure(error);
  if (!data) return NextResponse.json({ok:false,error:"Randevu bulunamadı."},{status:404});
  return NextResponse.json({ok:true,appointment:data},{headers:{"Cache-Control":"private, no-store"}});
}
export async function PATCH(request:Request,context:Context) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const {id} = await context.params;
  const body = await readAppointmentBody(request);
  const keys = ["scheduled_date","scheduled_time","meeting","address","status","admin_notes"] as const;
  if (!isAppointmentId(id) || !body || !Number.isSafeInteger(body.revision) || keys.some(key => typeof body[key] !== "string")) return NextResponse.json({ok:false,error:"Geçersiz randevu bilgileri."},{status:400});
  const {data:previous,error:readError} = await auth.supabase.from("business_appointments").select(appointmentColumns).eq("id",id).maybeSingle();
  if (readError) return appointmentFailure(readError);
  if (!previous) return NextResponse.json({ok:false,error:"Randevu bulunamadı."},{status:404});
  const edit = Object.fromEntries(keys.map(key => [key,(body[key] as string).trim()])) as AppointmentEdit;
  const errors = validateAppointmentEdit(edit,previous as Appointment);
  if (Object.keys(errors).length) return NextResponse.json({ok:false,error:"Lütfen işaretli alanları kontrol edin.",errors},{status:400});
  if (edit.meeting !== "in_person") edit.address = "";
  const {data,error} = await auth.supabase.from("business_appointments").update(edit).eq("id",id).eq("revision",body.revision).select(appointmentColumns).maybeSingle();
  if (error) return appointmentFailure(error);
  if (!data) return NextResponse.json({ok:false,error:"Bu randevu başka bir yerde güncellendi. Yenileyip değişiklikleri kontrol edin."},{status:409});
  return NextResponse.json({ok:true,appointment:data},{headers:{"Cache-Control":"no-store"}});
}
