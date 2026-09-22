import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const {data,error}=await auth.supabase.from("customer_read_model")
    .select("id,profile_id,full_name,email,phone,is_member,membership_source,city,district,created_at,last_order_at,last_order_no,order_count,total_spent,marketing_email_consent")
    .order("created_at",{ascending:false}).limit(500);
  if(error) return NextResponse.json({ok:false,error:error.message},{status:500});
  return NextResponse.json({ok:true,customers:data||[]},{headers:{"Cache-Control":"private, no-store"}});
}

export async function PATCH(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const id=String(body.profile_id||body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Müşteri profil id eksik."},{status:400});
  const allowed=["full_name","phone","birth_date","marketing_email_consent"];
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const key of allowed) if(key in body) update[key]=body[key] === "" ? null : body[key];
  const {data,error}=await auth.supabase.from("profiles").update(update).eq("id",id).select("id,email,full_name,phone,marketing_email_consent").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  return NextResponse.json({ok:true,profile:data});
}
