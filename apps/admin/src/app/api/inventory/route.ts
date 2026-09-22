import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const [variants,products]=await Promise.all([
    auth.supabase.from("product_variants").select("id,product_id,name,sku,price,compare_at_price,stock,stock_status,is_active,option_summary,options,image_url,sort_order,updated_at").order("updated_at",{ascending:false}).limit(1500),
    auth.supabase.from("products").select("id,name,slug,status,price").neq("status","archived").order("name",{ascending:true}),
  ]);
  const error=variants.error||products.error;
  if(error) return NextResponse.json({ok:false,error:error.message},{status:500});
  const productMap=new Map((products.data||[]).map((p:any)=>[String(p.id),p]));
  const rows=(variants.data||[]).map((v:any)=>({...v,product:productMap.get(String(v.product_id))||null}));
  return NextResponse.json({ok:true,inventory:rows,products:products.data||[]},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({}));
  const productId=String(body.product_id||"").trim();
  if(!productId) return NextResponse.json({ok:false,error:"Ürün seçmelisin."},{status:400});
  const optionSummary=String(body.option_summary||body.name||"Standart").trim()||"Standart";
  const payload={
    product_id:productId,
    name:String(body.name||optionSummary).trim()||optionSummary,
    option_summary:optionSummary,
    options:body.options && typeof body.options==="object" ? body.options : {},
    sku:String(body.sku||"").trim()||null,
    price:Number(body.price||0),
    compare_at_price:body.compare_at_price==null||body.compare_at_price===""?null:Number(body.compare_at_price),
    stock:Math.max(0,Math.trunc(Number(body.stock)||0)),
    stock_status:String(body.stock_status||"in_stock"),
    is_active:body.is_active!==false,
    image_url:String(body.image_url||"").trim()||null,
    sort_order:Number.isFinite(Number(body.sort_order))?Number(body.sort_order):0,
    status:"active",
    updated_at:new Date().toISOString(),
  };
  const {data,error}=await auth.supabase.from("product_variants").insert(payload).select("*").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  const storefront=await revalidateStorefront("rosta-admin-variant-create","catalog");
  return NextResponse.json({ok:true,variant:data,storefront});
}

export async function PATCH(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const id=String(body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Varyant id eksik."},{status:400});
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const key of ["name","sku","price","compare_at_price","stock","stock_status","is_active","option_summary","options","image_url","sort_order"]){
    if(key in body) update[key]=key==="stock"?Math.max(0,Math.trunc(Number(body[key])||0)):body[key];
  }
  const {data,error}=await auth.supabase.from("product_variants").update(update).eq("id",id).select("*").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  const storefront=await revalidateStorefront("rosta-admin-inventory-update","catalog");
  return NextResponse.json({ok:true,variant:data,storefront});
}

export async function DELETE(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const id=String(body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Varyant id eksik."},{status:400});
  const {error}=await auth.supabase.from("product_variants").update({is_active:false,status:"archived",updated_at:new Date().toISOString()}).eq("id",id);
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  const storefront=await revalidateStorefront("rosta-admin-variant-archive","catalog");
  return NextResponse.json({ok:true,storefront});
}
