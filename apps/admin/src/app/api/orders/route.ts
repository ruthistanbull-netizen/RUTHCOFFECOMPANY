import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const {data,error}=await auth.supabase.from("orders")
    .select("id,order_no,customer_name,customer_email,customer_phone,total_amount,currency,status,payment_status,shipping_status,shipping_provider,cargo_tracking_no,admin_note,created_at,updated_at")
    .order("created_at",{ascending:false}).limit(500);
  if(error) return NextResponse.json({ok:false,error:error.message},{status:500});
  return NextResponse.json({ok:true,orders:data||[]},{headers:{"Cache-Control":"private, no-store"}});
}

export async function PATCH(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const id=String(body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Sipariş id eksik."},{status:400});
  const allowed=["status","payment_status","shipping_status","shipping_provider","cargo_tracking_no","cargo_tracking_url","admin_note"];
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const key of allowed) if(key in body) update[key]=body[key] === "" ? null : body[key];
  const {data,error}=await auth.supabase.from("orders").update(update).eq("id",id).select("*").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  return NextResponse.json({ok:true,order:data});
}
