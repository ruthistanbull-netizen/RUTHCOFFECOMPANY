import { buildMarketingEmailHtml } from "@/lib/emailTemplates";
import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";

const STORE_URL="https://rostacoffecompany.zeabur.app";

function clean(value:unknown){return typeof value==="string"?value.trim():"";}
function render(template:string,vars:Record<string,string>){return Object.entries(vars).reduce((text,[key,value])=>text.replaceAll(`{{${key}}}`,value),template);}

export async function reviewSettings(supabase:any){
  const result=await supabase.from("site_settings").select("setting_value").eq("setting_key","review_request_email_settings").maybeSingle();
  const v=result.data?.setting_value&&typeof result.data.setting_value==="object"?result.data.setting_value:{};
  return {
    enabled:typeof v.enabled==="boolean"?v.enabled:true,
    delayDaysAfterDelivered:Math.max(1,Math.min(14,Number(v.delayDaysAfterDelivered||1))),
    discountPercent:Math.max(0,Math.min(100,Number(v.discountPercent??10))),
    subject:String(v.subject||"Ürünü değerlendir, %10 indirim kazan"),
    template:String(v.template||"Merhaba {{customer_name}}, siparişindeki ürünleri değerlendirmek ister misin? {{review_url}}"),
  };
}

export async function sendReviewRequests(supabase:any, profileId:string, orderIds:string[]){
  const ids=[...new Set(orderIds.filter(Boolean))].slice(0,200);
  if(!ids.length) return {sent:0,failed:0,skipped:0,results:[] as any[]};
  const settings=await reviewSettings(supabase);
  if(!settings.enabled) return {sent:0,failed:0,skipped:ids.length,results:[] as any[]};

  const integration=await getActiveEmailIntegration(supabase,profileId);
  if(!integration) throw new Error("Değerlendirme maili için Gmail hesabını bağla.");

  const orders=await supabase.from("orders").select("id,order_no,customer_name,customer_email,profile_id").in("id",ids);
  if(orders.error) throw new Error(orders.error.message);

  let sent=0,failed=0,skipped=0;
  const results:any[]=[];
  for(const order of orders.data||[]){
    const email=clean(order.customer_email).toLocaleLowerCase("en-US");
    if(!email){skipped++;results.push({order_id:order.id,status:"skipped",error:"Müşteri e-postası yok."});continue;}
    const existing=await supabase.from("review_request_emails").select("id,status").eq("order_id",order.id).maybeSingle();
    if(existing.data?.status==="sent"){skipped++;results.push({order_id:order.id,status:"skipped"});continue;}

    const reviewUrl=`${STORE_URL}/account/orders?review=${encodeURIComponent(order.order_no||order.id)}`;
    const text=render(settings.template,{
      customer_name:clean(order.customer_name)||"ROSTA müşterisi",
      order_no:clean(order.order_no),
      review_url:reviewUrl,
      discount_percent:String(settings.discountPercent),
    });
    const fields={
      subject:settings.subject,preheader:"Deneyimini paylaş.",headline:"Deneyimini paylaş",
      intro:text,offer:settings.discountPercent>0?`Yorumunu gönderdiğinde %${settings.discountPercent} avantaj kazanabilirsin.`:"",
      buttonLabel:"Değerlendir",buttonUrl:reviewUrl,note:"Teşekkür ederiz.",heroImageUrl:"",logoUrl:"",
    };
    try{
      const result=await sendEmailWithIntegration(supabase,integration,{to:email,subject:settings.subject,html:buildMarketingEmailHtml(fields)});
      const record={order_id:order.id,profile_id:order.profile_id||null,email,status:"sent",sent_at:new Date().toISOString(),error_message:null};
      if(existing.data?.id) await supabase.from("review_request_emails").update(record).eq("id",existing.data.id);
      else await supabase.from("review_request_emails").insert(record);
      await supabase.from("email_logs").insert({provider:"gmail",profile_id:profileId,order_id:order.id,to_email:email,subject:settings.subject,template_key:"review_request",status:"sent",gmail_message_id:result.id,sent_at:new Date().toISOString()});
      sent++;results.push({order_id:order.id,status:"sent"});
    }catch(error){
      const message=error instanceof Error?error.message:"Gönderilemedi.";
      const record={order_id:order.id,profile_id:order.profile_id||null,email,status:"failed",sent_at:new Date().toISOString(),error_message:message};
      if(existing.data?.id) await supabase.from("review_request_emails").update(record).eq("id",existing.data.id);
      else await supabase.from("review_request_emails").insert(record);
      failed++;results.push({order_id:order.id,status:"failed",error:message});
    }
  }
  return {sent,failed,skipped,results};
}
