import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
export const dynamic="force-dynamic"; export const revalidate=0;
export async function GET(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const {data,error}=await auth.supabase.from("products").select("id,price,compare_at_price").neq("status","archived");
  if(error) return NextResponse.json({ok:false,error:error.message},{status:500});
  const pricing=(data||[]).map((row:any)=>{
    const sale=Number(row.price||0), original=Number(row.compare_at_price||0);
    const has=original>sale&&sale>=0;
    return {productId:String(row.id),originalPrice:has?original:sale,discountedPrice:sale,discountAmount:has?original-sale:0,discountPercentage:has?Math.round((1-sale/original)*100):0,hasDiscount:has,rules:[]};
  });
  return NextResponse.json({ok:true,pricing},{headers:{"Cache-Control":"private, no-store"}});
}
