import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailWithIntegration } from "@/lib/mailDelivery";
import {
  PASSWORD_RECOVERY_SUBJECT,buildPasswordRecoveryHtml,buildPasswordRecoveryUrl,
  isPasswordRecoveryTarget,isValidRecoveryEmail,normalizeRecoveryEmail,
} from "@/lib/passwordRecovery";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const GENERIC={ok:true,message:"Bu e-posta ile bir hesap varsa şifre yenileme bağlantısı gönderildi."};

export async function POST(request:Request){
  const body=await request.json().catch(()=>({}));
  const email=normalizeRecoveryEmail(body.email),target=body.target;
  if(!isValidRecoveryEmail(email)||!isPasswordRecoveryTarget(target))return NextResponse.json({ok:false,error:"Geçerli e-posta ve hedef gerekli."},{status:400});
  const supabase=getSupabaseAdmin();

  if(target==="admin"){
    const admin=await supabase.from("profiles").select("id").eq("role","admin").ilike("email",email).limit(1).maybeSingle();
    if(!admin.data)return NextResponse.json(GENERIC,{headers:{"Cache-Control":"no-store"}});
  }

  const cutoff=new Date(Date.now()-15*60*1000).toISOString();
  const attempts=await supabase.from("email_logs").select("id",{count:"exact",head:true}).eq("template_key","password_recovery").eq("to_email",email).gte("created_at",cutoff);
  if(Number(attempts.count||0)>=3)return NextResponse.json(GENERIC,{headers:{"Cache-Control":"no-store"}});

  try{
    const link=await supabase.auth.admin.generateLink({type:"recovery",email});
    const props=link.data?.properties as {hashed_token?:string;action_link?:string}|undefined;
    let tokenHash=String(props?.hashed_token||"");
    if(!tokenHash&&props?.action_link){try{tokenHash=new URL(props.action_link).searchParams.get("token")||"";}catch{}}
    if(link.error||!tokenHash)return NextResponse.json(GENERIC,{headers:{"Cache-Control":"no-store"}});

    const integration=await supabase.from("email_integrations").select("*").eq("provider","gmail").eq("status","active").not("email","is",null).order("updated_at",{ascending:false}).limit(1).maybeSingle();
    if(!integration.data)return NextResponse.json({ok:false,error:"Şifre yenileme e-postası için Gmail bağlantısı aktif değil."},{status:503});

    const resetUrl=buildPasswordRecoveryUrl(target,tokenHash);
    const sent=await sendEmailWithIntegration(supabase,integration.data as any,{to:email,subject:PASSWORD_RECOVERY_SUBJECT,html:buildPasswordRecoveryHtml(resetUrl,target)});
    await supabase.from("email_logs").insert({provider:"gmail",profile_id:integration.data.profile_id||null,to_email:email,subject:PASSWORD_RECOVERY_SUBJECT,template_key:"password_recovery",status:"sent",gmail_message_id:sent.id,sent_at:new Date().toISOString()});
    return NextResponse.json(GENERIC,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    console.error("ROSTA password recovery:",error);
    return NextResponse.json({ok:false,error:"Şifre yenileme e-postası şu anda gönderilemiyor."},{status:503});
  }
}
