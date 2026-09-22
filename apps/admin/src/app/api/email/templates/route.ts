import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  buildMarketingEmailHtml,
  readyEmailTemplates,
  type EmailTemplateFields,
} from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const marker = /^<!--ROSTA_TEMPLATE_FIELDS:([A-Za-z0-9_-]+)-->/;

function clean(value: unknown, max = 20000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function slug(value: unknown) {
  return clean(value,120).toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/ı/g,"i").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,70);
}
function encodeFields(fields: EmailTemplateFields) {
  return Buffer.from(JSON.stringify(fields),"utf8").toString("base64url");
}
function decodeFields(html:string) {
  const match=html.match(marker); if(!match?.[1]) return null;
  try { return JSON.parse(Buffer.from(match[1],"base64url").toString("utf8")) as EmailTemplateFields; } catch { return null; }
}
function typeFor(key:string) {
  if(key.includes("abandoned")||key.includes("review")) return "automation";
  if(key.includes("order")||key.includes("account")||key.includes("site")) return "service";
  return "campaign";
}
function defaultTemplate(def:any) {
  return {
    id:def.key, template_key:def.key, name:def.title, type:typeFor(def.key),
    description:def.description, subject:def.fields.subject, preheader:def.fields.preheader,
    fields:def.fields, html:buildMarketingEmailHtml(def.fields), enabled:true, updated_at:null,
  };
}

export async function GET(request:Request) {
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const result=await auth.supabase.from("email_templates").select("*").order("updated_at",{ascending:false});
  if(result.error) return NextResponse.json({ok:false,error:result.error.message},{status:400});
  const byKey=new Map<string,any>();
  for(const row of result.data||[]) {
    const ready=readyEmailTemplates.find((item)=>item.key===row.template_key);
    const fields=decodeFields(row.html)||ready?.fields||{
      subject:row.subject,preheader:"",headline:row.name,intro:"",offer:"",buttonLabel:"ROSTA'yı Keşfet",
      buttonUrl:"https://rostacoffecompany.zeabur.app",note:"",heroImageUrl:"",logoUrl:""
    };
    byKey.set(row.template_key,{
      id:row.id,template_key:row.template_key,name:row.name,type:typeFor(row.template_key),
      description:ready?.description||"Panelden yönetilen özel e-posta şablonu.",
      subject:row.subject,preheader:fields.preheader,fields,html:row.html.replace(marker,"").trimStart(),
      enabled:row.is_active!==false,updated_at:row.updated_at,
    });
  }
  for(const def of readyEmailTemplates) if(!byKey.has(def.key)) byKey.set(def.key,defaultTemplate(def));
  return NextResponse.json({ok:true,templates:[...byKey.values()]},{headers:{"Cache-Control":"private, no-store"}});
}

async function save(request:Request,method:"POST"|"PUT") {
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const body=await request.json().catch(()=>({}));
  const id=clean(body.id,80);
  const name=clean(body.name,160);
  const templateKey=slug(body.template_key)||(!id.includes("-")?slug(id):"")||slug(name)||`custom_${Date.now()}`;
  const ready=readyEmailTemplates.find((item)=>item.key===templateKey);
  const fields={...(ready?.fields||{}),...(body.fields&&typeof body.fields==="object"?body.fields:{})} as EmailTemplateFields;
  fields.subject=clean(body.subject,300)||clean(fields.subject,300);
  if(!fields.buttonUrl) fields.buttonUrl="https://rostacoffecompany.zeabur.app";
  const html=clean(body.html,120000)||buildMarketingEmailHtml(fields);
  if(!name||!fields.subject||!html) return NextResponse.json({ok:false,error:"Şablon adı, konu ve içerik zorunlu."},{status:400});
  const stored=`<!--ROSTA_TEMPLATE_FIELDS:${encodeFields(fields)}-->\n${html}`;
  const record={template_key:templateKey,name,subject:fields.subject,html:stored,is_active:body.enabled!==false,updated_at:new Date().toISOString()};
  const query=method==="PUT"&&id
    ? auth.supabase.from("email_templates").update(record).eq("id",id).select("*").single()
    : auth.supabase.from("email_templates").upsert(record,{onConflict:"template_key"}).select("*").single();
  const result=await query;
  if(result.error) return NextResponse.json({ok:false,error:result.error.message},{status:400});
  return NextResponse.json({ok:true,template:result.data});
}
export async function POST(request:Request){return save(request,"POST");}
export async function PUT(request:Request){return save(request,"PUT");}
export async function DELETE(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  const id=String(new URL(request.url).searchParams.get("id")||"").trim();
  if(!id) return NextResponse.json({ok:false,error:"Şablon kimliği gerekli."},{status:400});
  const q=/^[0-9a-f-]{36}$/i.test(id)
    ? auth.supabase.from("email_templates").delete().eq("id",id)
    : auth.supabase.from("email_templates").delete().eq("template_key",slug(id));
  const result=await q; if(result.error) return NextResponse.json({ok:false,error:result.error.message},{status:400});
  return NextResponse.json({ok:true});
}
