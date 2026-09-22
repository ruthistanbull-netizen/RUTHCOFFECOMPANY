import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildMarketingEmailHtml, buildSubject, getReadyEmailTemplate } from "@/lib/emailTemplates";
import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";
import { loadRostaInlineLogo } from "@/lib/gmail";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function asObj(value:unknown):Record<string,any>{return value&&typeof value==="object"?value as Record<string,any>:{};}
function clean(value:unknown){return typeof value==="string"?value.trim():"";}
function minutesAgo(value:unknown){const t=new Date(String(value||"")).getTime();return Number.isFinite(t)?(Date.now()-t)/60000:Number.POSITIVE_INFINITY;}
function rangeStart(key:string){const now=Date.now();if(key==="today"){const d=new Date();d.setHours(0,0,0,0);return d.toISOString();}if(key==="7d")return new Date(now-7*86400000).toISOString();if(key==="30d")return new Date(now-30*86400000).toISOString();if(key==="90d")return new Date(now-90*86400000).toISOString();return null;}
function due(draft:any,settings:any,manual:boolean){const count=Number(draft.abandoned_email_count||0);if(count>=3)return null;if(manual)return count+1;if(count===0)return minutesAgo(draft.created_at)>=settings.firstDelayHours*60?1:null;if(count===1)return minutesAgo(draft.abandoned_email_last_sent_at)>=settings.secondDelayHours*60?2:null;if(count===2)return minutesAgo(draft.abandoned_email_last_sent_at)>=settings.thirdDelayHours*60?3:null;return null;}
function checkoutUrl(draft:any){const token=clean(draft.resume_token)||clean(draft.merchant_oid)||clean(draft.order_no)||clean(draft.id);return `https://rostacoffecompany.zeabur.app/checkout?draft=${encodeURIComponent(token)}`;}
async function settings(supabase:any){const r=await supabase.from("site_settings").select("setting_value").eq("setting_key","abandoned_cart_email_settings").maybeSingle();const v=r.data?.setting_value&&typeof r.data.setting_value==="object"?r.data.setting_value:{};return{enabled:typeof v.enabled==="boolean"?v.enabled:true,firstDelayHours:Math.max(1,Math.min(72,Number(v.firstDelayHours||3))),secondDelayHours:Math.max(1,Math.min(72,Number(v.secondDelayHours||6))),thirdDelayHours:Math.max(1,Math.min(72,Number(v.thirdDelayHours||6)))};}

export async function POST(request:Request){
  const auth=await requireAdmin(request);if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>({}));const range=String(body.range||"all");const manual=Boolean(body.range);
  const cfg=await settings(auth.supabase);
  if(!cfg.enabled)return NextResponse.json({ok:true,sent:0,failed:0,matched:0,eligible:0});
  const integration=await getActiveEmailIntegration(auth.supabase,auth.profile.id);
  if(!integration)return NextResponse.json({ok:false,error:"Önce Gmail hesabını bağla."},{status:400});

  let query=auth.supabase.from("checkout_drafts")
    .select("id,merchant_oid,order_no,customer,items,total_amount,currency,status,order_id,created_at,abandoned_email_count,abandoned_email_last_sent_at,resume_token")
    .in("status",["waiting","failed"]).is("order_id",null).order("created_at",{ascending:true}).limit(200);
  const start=rangeStart(range);if(start)query=query.gte("created_at",start);
  const drafts=await query;if(drafts.error)return NextResponse.json({ok:false,error:drafts.error.message},{status:400});

  const candidates=(drafts.data||[]).map((draft:any)=>({draft,reminderNo:due(draft,cfg,manual)})).filter((item:any)=>{
    const email=clean(asObj(item.draft.customer).email);
    return item.reminderNo&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  });
  const template=getReadyEmailTemplate("abandoned_cart");
  let sent=0,failed=0;const errors:string[]=[];
  for(const item of candidates){
    const draft=item.draft;const reminderNo=Number(item.reminderNo);const customer=asObj(draft.customer);const to=clean(customer.email).toLocaleLowerCase("en-US");
    const vars={customer_name:clean(customer.fullName||customer.full_name||customer.name)||"ROSTA müşterisi",checkout_url:checkoutUrl(draft),order_no:clean(draft.order_no),total_amount:Number(draft.total_amount||0),reminder_no:reminderNo};
    const fields={
      ...template.fields,
      logoUrl:"cid:rosta-email-logo",
      subject:reminderNo===1?"Sepetindeki ürünler seni bekliyor":reminderNo===2?"Sepetin hâlâ hazır":"Son hatırlatma: sepetine dön",
      headline:reminderNo===3?"Sepetin için son hatırlatma":"Sepetin seni bekliyor",
      buttonUrl:"{{checkout_url}}",
      offer:"Sepetindeki ürünleri kaldığın yerden tamamlayabilirsin.",
    };
    const subject=buildSubject(fields,vars);const html=buildMarketingEmailHtml(fields,vars);
    try{
      const mail=await sendEmailWithIntegration(auth.supabase,integration,{to,subject,html,inlineImages:loadRostaInlineLogo()});
      const now=new Date().toISOString();
      await auth.supabase.from("email_logs").insert({provider:"gmail",profile_id:auth.profile.id,to_email:to,subject,template_key:`abandoned_cart_${reminderNo}`,status:"sent",gmail_message_id:mail.id,sent_at:now,campaign_group:"abandoned_cart",campaign_name:`Terk Sepet ${reminderNo}. Mail`});
      await auth.supabase.from("checkout_drafts").update({abandoned_email_count:reminderNo,abandoned_email_last_sent_at:now,abandoned_email_status:reminderNo>=3?"completed":"partial",abandoned_email_error:null,updated_at:now}).eq("id",draft.id);
      sent++;
    }catch(error){
      const message=error instanceof Error?error.message:"Gönderilemedi.";failed++;errors.push(`${draft.order_no}: ${message}`);
      await auth.supabase.from("checkout_drafts").update({abandoned_email_status:"failed",abandoned_email_error:message,updated_at:new Date().toISOString()}).eq("id",draft.id);
    }
  }
  await auth.supabase.from("site_settings").upsert({setting_key:"abandoned_cart_last_run",setting_value:{sent,failed,matched:(drafts.data||[]).length,eligible:candidates.length,ranAt:new Date().toISOString()},is_public:false,updated_at:new Date().toISOString()},{onConflict:"setting_key"});
  return NextResponse.json({ok:failed===0,sent,failed,errors,matched:(drafts.data||[]).length,eligible:candidates.length});
}
