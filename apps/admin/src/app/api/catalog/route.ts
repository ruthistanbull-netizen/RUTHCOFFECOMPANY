import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function tableFor(value: unknown) {
  return value === "collection" ? "collections" : value === "category" ? "categories" : null;
}
function slugify(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u").replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const [categories, collections] = await Promise.all([
    auth.supabase.from("categories").select("*").order("sort_order",{ascending:true}).order("name",{ascending:true}),
    auth.supabase.from("collections").select("*").order("sort_order",{ascending:true}).order("name",{ascending:true}),
  ]);
  const error = categories.error || collections.error;
  if (error) return NextResponse.json({ok:false,error:error.message},{status:500});
  return NextResponse.json({ok:true,categories:categories.data||[],collections:collections.data||[]},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const body = await request.json().catch(()=>({}));
  const table = tableFor(body.type);
  if (!table) return NextResponse.json({ok:false,error:"Geçersiz katalog tipi."},{status:400});
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ok:false,error:"Ad gerekli."},{status:400});
  const payload = {
    name, slug:slugify(body.slug || name), description:String(body.description || "").trim() || null,
    cover_image_url:String(body.cover_image_url || "").trim() || null,
    sort_order:Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    status:body.status === "inactive" ? "inactive" : "active", updated_at:new Date().toISOString(),
  };
  const {data,error}=await auth.supabase.from(table).insert(payload).select("*").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  const storefront=await revalidateStorefront("rosta-admin-catalog-create","catalog");
  return NextResponse.json({ok:true,item:data,storefront});
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const body = await request.json().catch(()=>({}));
  const table = tableFor(body.type); const id=String(body.id||"").trim();
  if(!table || !id) return NextResponse.json({ok:false,error:"Katalog tipi veya id eksik."},{status:400});
  const allowed=["name","slug","description","cover_image_url","sort_order","status"];
  const update:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const key of allowed) if(key in body) update[key]=key==="slug"?slugify(body[key]):body[key];
  const {data,error}=await auth.supabase.from(table).update(update).eq("id",id).select("*").single();
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  const storefront=await revalidateStorefront("rosta-admin-catalog-update","catalog");
  return NextResponse.json({ok:true,item:data,storefront});
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({}));
  const table=tableFor(body.type); const id=String(body.id||"").trim();
  if(!table||!id) return NextResponse.json({ok:false,error:"Katalog tipi veya id eksik."},{status:400});
  const {error}=await auth.supabase.from(table).update({status:"inactive",updated_at:new Date().toISOString()}).eq("id",id);
  if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  const storefront=await revalidateStorefront("rosta-admin-catalog-disable","catalog");
  return NextResponse.json({ok:true,storefront});
}
