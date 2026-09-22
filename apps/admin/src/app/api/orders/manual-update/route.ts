import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizedItem(item:any){
  const quantity=Math.max(1,Math.trunc(Number(item.quantity||1)));
  const unitPrice=Math.max(0,Number(item.unit_price||0));
  return {
    product_id:item.product_id||null,
    variant_id:item.variant_id||null,
    product_slug:String(item.product_slug||"").trim()||null,
    product_name:String(item.product_name||"Ürün"),
    variant_name:String(item.variant_name||"").trim()||null,
    quantity,
    unit_price:unitPrice,
    total_price:Number((quantity*unitPrice).toFixed(2)),
    image_url:String(item.image_url||"").trim()||null,
  };
}

export async function PATCH(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({}));
  const id=String(body.id||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Sipariş id eksik."},{status:400});

  const orderPatch:Record<string,unknown>={updated_at:new Date().toISOString()};
  for(const key of ["status","payment_status","admin_note","reminder_note","reminder_at"]){
    if(key in body) orderPatch[key]=body[key] === "" ? null : body[key];
  }

  const existingItems=await auth.supabase.from("order_items").select("*").eq("order_id",id).order("created_at",{ascending:true});
  if(existingItems.error) return NextResponse.json({ok:false,error:existingItems.error.message},{status:400});

  let replacement:any[]|null=null;
  if(Array.isArray(body.order_items)){
    replacement=body.order_items.map(normalizedItem);
    if(!replacement.length) return NextResponse.json({ok:false,error:"Siparişte en az bir ürün olmalı."},{status:400});
    const subtotal=replacement.reduce((sum,item)=>sum+Number(item.total_price||0),0);
    const orderCurrent=await auth.supabase.from("orders").select("shipping_fee,discount_total,tax_total,reward_discount_total").eq("id",id).maybeSingle();
    if(orderCurrent.error) return NextResponse.json({ok:false,error:orderCurrent.error.message},{status:400});
    const current=orderCurrent.data||{};
    const total=Math.max(0,subtotal+Number(current.shipping_fee||0)+Number(current.tax_total||0)-Number(current.discount_total||0)-Number(current.reward_discount_total||0));
    orderPatch.subtotal=Number(subtotal.toFixed(2));
    orderPatch.total_amount=Number(total.toFixed(2));
  }

  const updated=await auth.supabase.from("orders").update(orderPatch).eq("id",id).select("*").single();
  if(updated.error) return NextResponse.json({ok:false,error:updated.error.message},{status:400});

  if(replacement){
    const removed=await auth.supabase.from("order_items").delete().eq("order_id",id);
    if(removed.error) return NextResponse.json({ok:false,error:removed.error.message},{status:400});
    const inserted=await auth.supabase.from("order_items").insert(replacement.map(item=>({...item,order_id:id})));
    if(inserted.error){
      if((existingItems.data||[]).length){
        const restore=(existingItems.data||[]).map((row:any)=>({
          id:row.id,order_id:row.order_id,product_id:row.product_id,variant_id:row.variant_id,product_slug:row.product_slug,
          product_name:row.product_name,variant_name:row.variant_name,quantity:row.quantity,unit_price:row.unit_price,total_price:row.total_price,image_url:row.image_url,created_at:row.created_at,
        }));
        await auth.supabase.from("order_items").insert(restore);
      }
      return NextResponse.json({ok:false,error:inserted.error.message},{status:400});
    }
  }

  return NextResponse.json({ok:true,order:updated.data,warning:body.notify_customer?"Müşteri bildirimi bu güncellemede ayrıca gönderilmedi.":undefined});
}
