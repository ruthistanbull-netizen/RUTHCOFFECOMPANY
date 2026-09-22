import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic="force-dynamic";

export async function POST(request:Request,{params}:{params:Promise<{orderId:string}>}){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const {orderId}=await params;
  const result=await auth.supabase.from("orders").select("id,shipping_status,shipping_provider,cargo_tracking_no,cargo_tracking_url,shipping_updated_at").eq("id",orderId).maybeSingle();
  if(result.error||!result.data) return NextResponse.json({ok:false,error:result.error?.message||"Sipariş bulunamadı."},{status:404});
  return NextResponse.json({ok:true,order:result.data,warning:"Harici kargo sağlayıcısı bağlı olmadığı için mevcut ROSTA kargo verisi döndürüldü."});
}
