import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { buildMarketingEmailHtml, buildSubject, type EmailTemplateFields } from "@/lib/emailTemplates";
import { getActiveEmailIntegration, sendEmailWithIntegration, verifyEmailIntegration } from "@/lib/mailDelivery";
import { loadRostaInlineLogo } from "@/lib/gmail";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const OWNER_TEST_EMAILS=new Set(String(process.env.ROSTA_OWNER_TEST_EMAILS||"").split(",").map((value)=>value.trim().toLocaleLowerCase("en-US")).filter(Boolean));
const SERVICE_KEYS=new Set(["order_thanks","account_migrated","site_moved","review_request"]);

function clean(value:unknown){return typeof value==="string"?value.trim():"";}
function normalizeEmail(value:unknown){return clean(value).toLocaleLowerCase("en-US");}

export async function POST(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({}));
  const recipients=Array.isArray(body.recipients)?body.recipients.slice(0,300):[];
  if(!recipients.length) return NextResponse.json({ok:false,error:"Alıcı seçilmedi."},{status:400});

  const templateKey=clean(body.template_key)||"soft_discount";
  const fields=(body.fields&&typeof body.fields==="object"?body.fields:{}) as EmailTemplateFields;
  if(!clean(fields.subject)) return NextResponse.json({ok:false,error:"E-posta konusu gerekli."},{status:400});

  const emails=[...new Set(recipients.map((item:any)=>normalizeEmail(item.email)).filter(Boolean))];
  const customers=await auth.supabase
    .from("customer_read_model")
    .select("email,is_member,marketing_email_consent,marketing_email_status,service_email_allowed")
    .in("email",emails);
  if(customers.error) return NextResponse.json({ok:false,error:customers.error.message},{status:400});

  const customerByEmail=new Map((customers.data||[]).map((row:any)=>[normalizeEmail(row.email),row]));
  const isService=SERVICE_KEYS.has(templateKey);
  const allowed=recipients.filter((item:any)=>{
    const email=normalizeEmail(item.email); if(!email) return false;
    if(OWNER_TEST_EMAILS.has(email)) return true;
    const row=customerByEmail.get(email) as any;
    if(!row) return false;
    if(templateKey==="account_migrated") return Boolean(row.is_member&&row.service_email_allowed);
    if(isService) return row.service_email_allowed!==false;
    return row.marketing_email_consent===true||row.marketing_email_status==="granted";
  });

  if(!allowed.length) return NextResponse.json({ok:true,sent:0,failed:0,skipped:recipients.length,errors:[]});

  const integration=await getActiveEmailIntegration(auth.supabase,auth.profile.id);
  if(!integration) return NextResponse.json({ok:false,error:"Önce Gmail hesabını bağla.",code:"gmail_not_connected"},{status:400});
  try{await verifyEmailIntegration(auth.supabase,integration);}catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Gmail bağlantısı hazır değil.",code:"gmail_not_ready"},{status:400});
  }

  let sent=0,failed=0;
  const errors:string[]=[];
  for(const recipient of allowed){
    const email=normalizeEmail(recipient.email);
    const variables={
      customer_name:clean(recipient.name)||"ROSTA müşterisi",
      customer_email:email,
      email,
      order_count:Number(recipient.order_count||0),
      total_spent:Number(recipient.total_spent||0),
      last_order_no:clean(recipient.last_order_no),
      checkout_url:"https://rostacoffecompany.zeabur.app/checkout",
      review_url:"https://rostacoffecompany.zeabur.app/account/orders",
      activation_url:"https://rostacoffecompany.zeabur.app/account/activate",
    };
    const finalFields={...fields,logoUrl:fields.logoUrl||"cid:rosta-email-logo"};
    const subject=buildSubject(finalFields,variables);
    const html=buildMarketingEmailHtml(finalFields,variables);
    try{
      const result=await sendEmailWithIntegration(auth.supabase,integration,{to:email,subject,html,inlineImages:loadRostaInlineLogo()});
      await auth.supabase.from("email_logs").insert({
        provider:"gmail",profile_id:auth.profile.id,to_email:email,subject,template_key:templateKey,
        status:"sent",gmail_message_id:result.id,sent_at:new Date().toISOString(),
      });
      sent+=1;
    }catch(error){
      failed+=1;
      const message=error instanceof Error?error.message:"Gönderilemedi.";
      errors.push(`${email}: ${message}`);
      await auth.supabase.from("email_logs").insert({
        provider:"gmail",profile_id:auth.profile.id,to_email:email,subject:clean(fields.subject),
        template_key:templateKey,status:"failed",error_message:message,
      });
    }
  }

  return NextResponse.json({ok:true,sent,failed,skipped:recipients.length-allowed.length,errors});
}
