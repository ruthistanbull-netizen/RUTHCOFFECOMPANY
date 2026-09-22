import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";

export const dynamic="force-dynamic";
export const revalidate=0;

function stringIds(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(v=>String(v||"").trim()).filter(Boolean))] : [];
}
function imageUrls(value: unknown) {
  return Array.isArray(value) ? value.map(v=>String(v||"").trim()).filter(Boolean).slice(0,24) : [];
}

export async function GET(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const id=new URL(request.url).searchParams.get("id")?.trim();
  if(!id) return NextResponse.json({ok:false,error:"Ürün id eksik."},{status:400});
  const [images,categories,collections,allCategories,allCollections]=await Promise.all([
    auth.supabase.from("product_images").select("id,image_url,alt_text,is_main,sort_order").eq("product_id",id).order("is_main",{ascending:false}).order("sort_order",{ascending:true}),
    auth.supabase.from("product_categories").select("category_id").eq("product_id",id),
    auth.supabase.from("product_collections").select("collection_id").eq("product_id",id),
    auth.supabase.from("categories").select("id,name,slug,status").eq("status","active").order("sort_order",{ascending:true}).order("name",{ascending:true}),
    auth.supabase.from("collections").select("id,name,slug,status").eq("status","active").order("sort_order",{ascending:true}).order("name",{ascending:true}),
  ]);
  const error=images.error||categories.error||collections.error||allCategories.error||allCollections.error;
  if(error) return NextResponse.json({ok:false,error:error.message},{status:500});
  return NextResponse.json({
    ok:true,
    images:images.data||[],
    categoryIds:(categories.data||[]).map((x:any)=>String(x.category_id)),
    collectionIds:(collections.data||[]).map((x:any)=>String(x.collection_id)),
    categories:allCategories.data||[],
    collections:allCollections.data||[],
  },{headers:{"Cache-Control":"private, no-store"}});
}

export async function PUT(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({})); const productId=String(body.product_id||"").trim();
  if(!productId) return NextResponse.json({ok:false,error:"Ürün id eksik."},{status:400});
  const images=imageUrls(body.image_urls);
  const categoryIds=stringIds(body.category_ids);
  const collectionIds=stringIds(body.collection_ids);

  const imageDelete=await auth.supabase.from("product_images").delete().eq("product_id",productId);
  if(imageDelete.error) return NextResponse.json({ok:false,error:imageDelete.error.message},{status:400});
  if(images.length){
    const {error}=await auth.supabase.from("product_images").insert(images.map((url,index)=>({
      product_id:productId,image_url:url,is_main:index===0,is_primary:index===0,sort_order:index,
    })));
    if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  }

  const catDelete=await auth.supabase.from("product_categories").delete().eq("product_id",productId);
  if(catDelete.error) return NextResponse.json({ok:false,error:catDelete.error.message},{status:400});
  if(categoryIds.length){
    const {error}=await auth.supabase.from("product_categories").insert(categoryIds.map(category_id=>({product_id:productId,category_id})));
    if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  }

  const colDelete=await auth.supabase.from("product_collections").delete().eq("product_id",productId);
  if(colDelete.error) return NextResponse.json({ok:false,error:colDelete.error.message},{status:400});
  if(collectionIds.length){
    const {error}=await auth.supabase.from("product_collections").insert(collectionIds.map(collection_id=>({product_id:productId,collection_id})));
    if(error) return NextResponse.json({ok:false,error:error.message},{status:400});
  }

  const primaryCollection = collectionIds[0] || null;
  const {error:updateError}=await auth.supabase.from("products").update({
    main_image_url:images[0]||null,
    collection_id:primaryCollection,
    updated_at:new Date().toISOString(),
  }).eq("id",productId);
  if(updateError) return NextResponse.json({ok:false,error:updateError.message},{status:400});

  const storefront=await revalidateStorefront("rosta-admin-product-detail-update","catalog");
  return NextResponse.json({ok:true,storefront});
}
