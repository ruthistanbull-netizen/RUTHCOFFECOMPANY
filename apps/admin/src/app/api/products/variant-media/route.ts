import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";
export const dynamic="force-dynamic"; export const revalidate=0;
function urls(value:unknown){return Array.isArray(value)?[...new Set(value.map(v=>String(v||"").trim()).filter(Boolean))].slice(0,24):[];}
export async function GET(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const productId=new URL(request.url).searchParams.get("product_id")?.trim();
  if(!productId) return NextResponse.json({ok:false,error:"Ürün id eksik."},{status:400});
  const {data,error}=await auth.supabase.from("product_images").select("variant_id,image_url,sort_order").eq("product_id",productId).not("variant_id","is",null).order("sort_order",{ascending:true});
  if(error) return NextResponse.json({ok:false,error:error.message},{status:500});
  const variantImages:Record<string,string[]>={};
  for(const row of data||[]){const id=String((row as any).variant_id||"");if(id) variantImages[id]=[...(variantImages[id]||[]),String((row as any).image_url||"")].filter(Boolean);}
  return NextResponse.json({ok:true,variantImages});
}
export async function POST(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const productId=String(body.productId||body.product_id||"").trim();
  if(!productId) return NextResponse.json({ok:false,error:"Ürün id eksik."},{status:400});
  const {data:stored,error:variantError}=await auth.supabase.from("product_variants").select("id,option_summary,name").eq("product_id",productId).order("sort_order",{ascending:true});
  if(variantError) return NextResponse.json({ok:false,error:variantError.message},{status:400});
  await auth.supabase.from("product_images").delete().eq("product_id",productId).not("variant_id","is",null);
  const rows:any[]=[];
  const incoming=Array.isArray(body.variants)?body.variants:[];
  incoming.forEach((variant:any,index:number)=>{
    const actual=(stored||[]).find((item:any)=>variant.id&&String(item.id)===String(variant.id))||(stored||[])[index];
    if(!actual) return;
    urls(variant.image_urls?.length?variant.image_urls:[variant.image_url]).forEach((url,sort_order)=>rows.push({product_id:productId,variant_id:actual.id,image_url:url,is_main:false,is_primary:false,sort_order}));
  });
  if(rows.length){const {error}=await auth.supabase.from("product_images").insert(rows);if(error) return NextResponse.json({ok:false,error:error.message},{status:400});}
  const storefront=await revalidateStorefront("rosta-admin-variant-media","catalog");
  return NextResponse.json({ok:true,variantImages:Object.fromEntries((stored||[]).map((v:any)=>[String(v.id),rows.filter(r=>r.variant_id===v.id).map(r=>r.image_url)])),storefront});
}
