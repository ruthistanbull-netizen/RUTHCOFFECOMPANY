import { NextResponse } from "next/server";
import { PATCH as patchProduct, DELETE as deleteProduct } from "../route";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";
export const dynamic="force-dynamic"; export const revalidate=0;
export async function PATCH(request:Request){ return patchProduct(request); }
export async function DELETE(request:Request){ return deleteProduct(request); }
export async function POST(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const id=String(body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Ürün id eksik."},{status:400});
  if(body.action!=="restore") return NextResponse.json({ok:false,error:"Desteklenmeyen işlem."},{status:400});
  const {data,error}=await auth.supabase.from("products").update({status:"active",updated_at:new Date().toISOString()}).eq("id",id).select("*").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  const storefront=await revalidateStorefront("rosta-admin-product-restore","catalog");
  return NextResponse.json({ok:true,product:data,storefront});
}
