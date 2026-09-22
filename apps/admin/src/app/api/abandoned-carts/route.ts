import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function asObj(value:unknown):Record<string,any>{return value&&typeof value==="object"?value as Record<string,any>:{};}
function clean(value:unknown){return typeof value==="string"?value.trim():"";}
function rangeStart(key:string){
  const now=Date.now();
  if(key==="today"){const d=new Date();d.setHours(0,0,0,0);return d.toISOString();}
  if(key==="7d")return new Date(now-7*86400000).toISOString();
  if(key==="30d")return new Date(now-30*86400000).toISOString();
  if(key==="90d")return new Date(now-90*86400000).toISOString();
  return null;
}
function itemsCount(items:unknown){return Array.isArray(items)?items.reduce((sum,item:any)=>sum+Math.max(1,Number(item?.quantity||1)),0):0;}
function checkoutUrl(draft:any){const token=clean(draft.resume_token)||clean(draft.merchant_oid)||clean(draft.order_no)||clean(draft.id);return `https://rostacoffecompany.zeabur.app/checkout?draft=${encodeURIComponent(token)}`;}
function reason(draft:any){const payload=asObj(draft.callback_payload);const raw=clean(payload.failed_reason||payload.fail_reason||payload.reason||payload.error||payload.message);if(raw)return raw;if(draft.status==="paid"||draft.order_id)return "Satın alma tamamlandı, kurtarılan sepet.";if(draft.status==="waiting")return "Müşteri iletişim bilgilerini bıraktı ancak satın almayı tamamlamadı.";if(draft.status==="failed")return "Ödeme denemesi başarısız oldu.";return "Checkout tamamlanmadı.";}
function normalizeItems(items:unknown){
  if(!Array.isArray(items))return[];
  return items.map((item:any)=>{
    const quantity=Math.max(1,Number(item.quantity||1));
    const unitPrice=Number(item.unitPrice||item.unit_price||item.price||0);
    return{
      productName:clean(item.productName||item.product_name||item.name)||"Ürün",
      variantName:clean(item.variantName||item.variant_name||item.size||item.option_summary),
      quantity,
      unitPrice,
      totalPrice:Number(item.totalPrice||item.total_price||unitPrice*quantity||0),
      imageUrl:clean(item.imageUrl||item.image_url||item.image)||null,
      imageCandidates:[clean(item.imageUrl||item.image_url||item.image)].filter(Boolean),
      productSlug:clean(item.productSlug||item.product_slug||item.slug),
    };
  });
}
function diagnosis(draft:any,email:string){
  const count=Number(draft.abandoned_email_count||0);
  if(draft.status==="paid"||draft.order_id)return{label:"Siparişe döndü",detail:"Bu sepet satın almaya dönüştü."};
  if(!email)return{label:"Mail yok",detail:"Müşteri e-posta bırakmadı."};
  if(draft.abandoned_email_error)return{label:"Mail hatası",detail:String(draft.abandoned_email_error)};
  if(count>=3||draft.abandoned_email_status==="completed")return{label:"Seri tamamlandı",detail:"3 hatırlatma maili gönderildi."};
  return{label:count>0?`${count}/3 gönderildi`:"Gönderime hazır",detail:count>0?"Sonraki otomasyon adımı bekleniyor.":"İlk terk sepet maili için uygun."};
}

export async function GET(request:Request){
  const auth=await requireAdmin(request);if("error" in auth)return auth.error;
  const range=new URL(request.url).searchParams.get("range")||"all";
  let query=auth.supabase.from("checkout_drafts")
    .select("id,merchant_oid,order_no,customer,items,total_amount,currency,status,callback_payload,order_id,created_at,paid_at,failed_at,abandoned_email_count,abandoned_email_status,abandoned_email_last_sent_at,abandoned_email_error,resume_token")
    .order("created_at",{ascending:false}).limit(200);
  const start=rangeStart(range);if(start)query=query.gte("created_at",start);
  const result=await query;if(result.error)return NextResponse.json({ok:false,error:result.error.message},{status:400});
  const drafts=result.data||[];
  const rows=drafts.map((draft:any)=>{
    const customer=asObj(draft.customer);const cartItems=normalizeItems(draft.items);const email=clean(customer.email).toLocaleLowerCase("en-US");const d=diagnosis(draft,email);
    return{
      ...draft,
      customer_name:clean(customer.fullName||customer.full_name||customer.name)||"-",
      customer_email:email||"-",
      customer_phone:clean(customer.phone)||"-",
      item_count:itemsCount(draft.items),
      cart_items:cartItems,
      reason:reason(draft),
      recovered:draft.status==="paid"||Boolean(draft.order_id),
      checkout_url:checkoutUrl(draft),
      abandoned_email_count:Number(draft.abandoned_email_count||0),
      abandoned_email_status:draft.abandoned_email_status||"not_sent",
      abandoned_email_last_sent_at:draft.abandoned_email_last_sent_at||null,
      abandoned_email_error:draft.abandoned_email_error||null,
      mail_diagnosis_label:d.label,
      mail_diagnosis_detail:d.detail,
    };
  }).filter((row:any)=>row.recovered||row.customer_email!=="-");
  const abandoned=rows.filter((row:any)=>!row.recovered);const recovered=rows.filter((row:any)=>row.recovered);
  const setting=await auth.supabase.from("site_settings").select("setting_value").eq("setting_key","abandoned_cart_last_run").maybeSingle();
  return NextResponse.json({
    ok:true,carts:rows,
    stats:{
      abandoned:abandoned.length,
      recovered:recovered.length,
      recoveredProducts:recovered.reduce((sum:number,row:any)=>sum+Number(row.item_count||0),0),
      recoveredRevenue:recovered.reduce((sum:number,row:any)=>sum+Number(row.total_amount||0),0),
    },
    automation:setting.data?.setting_value||null,
  },{headers:{"Cache-Control":"private, no-store"}});
}
