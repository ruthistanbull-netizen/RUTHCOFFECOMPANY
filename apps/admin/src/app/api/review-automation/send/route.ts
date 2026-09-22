import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendReviewRequests } from "@/lib/reviewAutomation";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(request:Request){
  const auth=await requireAdmin(request); if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>({}));
  const raw=Array.isArray(body.order_ids)?body.order_ids:[body.order_id];
  const ids=raw.map((value:unknown)=>String(value||"").trim()).filter(Boolean);
  if(!ids.length)return NextResponse.json({ok:false,error:"Sipariş seçilmedi."},{status:400});
  try{return NextResponse.json({ok:true,...await sendReviewRequests(auth.supabase,auth.profile.id,ids)});}
  catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Değerlendirme maili gönderilemedi."},{status:400});}
}
