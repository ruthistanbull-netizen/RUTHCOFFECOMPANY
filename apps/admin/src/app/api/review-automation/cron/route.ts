import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { reviewSettings, sendReviewRequests } from "@/lib/reviewAutomation";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function POST(request:Request){
  const auth=await requireAdmin(request); if("error" in auth)return auth.error;
  try{
    const settings=await reviewSettings(auth.supabase);
    if(!settings.enabled)return NextResponse.json({ok:true,sent:0,failed:0,skipped:0});
    const cutoff=new Date(Date.now()-settings.delayDaysAfterDelivered*86400000).toISOString();
    const orders=await auth.supabase.from("orders").select("id").in("status",["delivered","completed","fulfilled"]).lte("updated_at",cutoff).order("updated_at",{ascending:true}).limit(100);
    if(orders.error)throw new Error(orders.error.message);
    const ids=(orders.data||[]).map((row:any)=>String(row.id));
    const sentAlready=ids.length?await auth.supabase.from("review_request_emails").select("order_id,status").in("order_id",ids):{data:[],error:null};
    const done=new Set((sentAlready.data||[]).filter((row:any)=>row.status==="sent").map((row:any)=>String(row.order_id)));
    const pending=ids.filter((id)=>!done.has(id));
    const result=await sendReviewRequests(auth.supabase,auth.profile.id,pending);
    return NextResponse.json({ok:true,...result,skipped:result.skipped+done.size});
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Değerlendirme otomasyonu çalıştırılamadı."},{status:400});}
}
