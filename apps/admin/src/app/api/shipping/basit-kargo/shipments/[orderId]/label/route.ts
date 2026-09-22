import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic="force-dynamic";

export async function GET(request:Request,{params}:{params:Promise<{orderId:string}>}){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const {orderId}=await params;
  const result=await auth.supabase.from("orders").select("id,cargo_tracking_no,basit_kargo_barcode").eq("id",orderId).maybeSingle();
  if(result.error||!result.data) return NextResponse.json({ok:false,error:result.error?.message||"Sipariş bulunamadı."},{status:404});
  return NextResponse.json({ok:false,error:"Kargo etiketi üretmek için ROSTA Basit Kargo entegrasyonu bağlanmalı."},{status:400});
}
