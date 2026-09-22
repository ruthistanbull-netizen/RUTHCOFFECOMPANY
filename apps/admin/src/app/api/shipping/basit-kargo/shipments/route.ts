import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic="force-dynamic";

export async function POST(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({}));
  const orderId=String(body.orderId||"").trim();
  if(!orderId) return NextResponse.json({ok:false,error:"Sipariş id eksik."},{status:400});

  const current=await auth.supabase.from("orders").select("id,shipping_provider,cargo_tracking_no,basit_kargo_order_id").eq("id",orderId).maybeSingle();
  if(current.error||!current.data) return NextResponse.json({ok:false,error:current.error?.message||"Sipariş bulunamadı."},{status:404});

  if(current.data.cargo_tracking_no||current.data.basit_kargo_order_id){
    return NextResponse.json({ok:true,existing:true,order:current.data});
  }

  return NextResponse.json({
    ok:false,
    code:"shipping_not_configured",
    error:"ROSTA için Basit Kargo sağlayıcı bağlantısı henüz yapılandırılmadı. Takip numarasını sipariş detayından manuel girebilirsin.",
  },{status:400});
}
