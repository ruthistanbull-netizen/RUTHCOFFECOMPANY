import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { appointmentColumns, appointmentFailure, readAppointmentBody } from "@/lib/appointmentApi";
import { APPOINTMENT_STATUSES, isAppointmentId } from "@ruth-commerce/commerce-core/appointments";
import { normalizeBusinessInquiry, validateBusinessInquiry } from "@ruth-commerce/commerce-core/business-inquiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const status = params.get("status") || "all";
  const context = params.get("context") || "all";
  const page = Number(params.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || (status !== "all" && !APPOINTMENT_STATUSES.some(s => s.value === status)) || !["all","studio","wholesale"].includes(context)) return NextResponse.json({ ok: false, error: "Geçersiz filtre." }, { status: 400 });
  const q = (params.get("q") || "").slice(0,120).replace(/[,()%\\.]/g," ").trim();
  let query = auth.supabase.from("business_appointments").select(appointmentColumns, { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page-1)*50,page*50-1);
  if (status !== "all") query = query.eq("status",status);
  if (context !== "all") query = query.eq("context",context);
  if (q) query = query.or(`business_name.ilike.%${q}%,contact_name.ilike.%${q}%`);
  const [list, counts] = await Promise.all([query,auth.supabase.rpc("business_appointment_counts")]);
  if (list.error) return appointmentFailure(list.error);
  if (counts.error) return appointmentFailure(counts.error);
  return NextResponse.json({ ok:true, appointments:list.data || [], total:list.count || 0, page, pageSize:50, counts:counts.data }, { headers:{ "Cache-Control":"private, no-store" } });
}
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await readAppointmentBody(request);
  if (!body || !isAppointmentId(body.requestKey) || !["pending","confirmed"].includes(String(body.status)) || typeof body.admin_notes !== "string" || body.admin_notes.length > 4000) return NextResponse.json({ ok:false,error:"Geçersiz randevu bilgileri." },{status:400});
  const inquiry = normalizeBusinessInquiry(body.inquiry);
  const errors = validateBusinessInquiry(inquiry);
  if (Object.keys(errors).length) return NextResponse.json({ok:false,error:"Lütfen işaretli alanları kontrol edin.",errors},{status:400});
  const { data:id, error } = await auth.supabase.rpc("submit_business_appointment",{p_request_key:body.requestKey,p_inquiry:inquiry,p_source:"manual",p_created_by:auth.internal ? null : auth.profile.id,p_status:body.status,p_admin_notes:body.admin_notes.trim()});
  if (error) return appointmentFailure(error);
  const result = await auth.supabase.from("business_appointments").select(appointmentColumns).eq("id",id).single();
  if (result.error) return appointmentFailure(result.error);
  return NextResponse.json({ok:true,appointment:result.data},{status:201,headers:{"Cache-Control":"no-store"}});
}
