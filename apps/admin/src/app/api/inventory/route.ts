import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const [variants,products]=await Promise.all([
    auth.supabase.from("product_variants").select("id,product_id,name,sku,price,stock,stock_status,is_active,option_summary,updated_at").order("updated_at",{ascending:false}).limit(1500),
    auth.supabase.from("products").select("id,name,slug,status"),
  ]);
  const error=variants.error||products.error;
  if(error) return NextResponse.json({ok:false,error:error.message},{status:500});
  const productMap=new Map((products.data||[]).map((p:any)=>[String(p.id),p]));
  const rows=(variants.data||[]).map((v:any)=>({...v,product:productMap.get(String(v.product_id))||null}));
  return NextResponse.json({ok:true,inventory:rows},{headers:{"Cache-Control":"private, no-store"}});
}

export async function PATCH(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const id=String(body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Varyant id eksik."},{status:400});
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  if("stock" in body) update.stock=Math.max(0,Math.trunc(Number(body.stock)||0));
  if("price" in body) update.price=Math.max(0,Number(body.price)||0);
  if("stock_status" in body) update.stock_status=body.stock_status;
  if("is_active" in body) update.is_active=Boolean(body.is_active);
  const {data,error}=await auth.supabase.from("product_variants").update(update).eq("id",id).select("*").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  const storefront=await revalidateStorefront("rosta-admin-inventory-update","catalog");
  return NextResponse.json({ok:true,variant:data,storefront});
}
