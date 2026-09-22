import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic="force-dynamic";
export const revalidate=0;

const SETTINGS_KEY="rosta_points_settings";
const DEFAULT_SETTINGS={signupPoints:1000,birthdayPoints:2000};

function positiveInt(value:unknown,max=10_000_000){
  const n=Math.trunc(Number(value||0));
  return Number.isFinite(n)?Math.max(0,Math.min(max,n)):0;
}

async function getSettings(supabase:any){
  const result=await supabase.from("site_settings").select("setting_value,updated_at").eq("setting_key",SETTINGS_KEY).maybeSingle();
  if(result.error)throw new Error(result.error.message);
  const value=result.data?.setting_value&&typeof result.data.setting_value==="object"?result.data.setting_value:{};
  return{
    signupPoints:positiveInt(value.signupPoints??DEFAULT_SETTINGS.signupPoints),
    birthdayPoints:positiveInt(value.birthdayPoints??DEFAULT_SETTINGS.birthdayPoints),
    updatedAt:result.data?.updated_at||null,
    updatedByProfileId:typeof value.updatedByProfileId==="string"?value.updatedByProfileId:null,
  };
}

async function adjustOne(supabase:any,adminProfileId:string,profileId:string,operation:"add"|"remove",points:number,reason:string){
  const current=await supabase.from("profiles").select("id,reward_points_balance").eq("id",profileId).maybeSingle();
  if(current.error||!current.data)throw new Error(current.error?.message||"Müşteri profili bulunamadı.");
  const oldBalance=positiveInt(current.data.reward_points_balance);
  const requested=positiveInt(points);
  if(requested<=0)throw new Error("Puan miktarı 0'dan büyük olmalı.");
  const applied=operation==="remove"?-Math.min(requested,oldBalance):requested;
  const balance=Math.max(0,oldBalance+applied);

  const updated=await supabase.from("profiles").update({reward_points_balance:balance,updated_at:new Date().toISOString()}).eq("id",profileId);
  if(updated.error)throw new Error(updated.error.message);
  const tx=await supabase.from("rosta_point_transactions").insert({
    profile_id:profileId,
    amount:applied,
    balance_after:balance,
    transaction_type:"admin_adjustment",
    reason:reason||"Panel puan düzenlemesi",
    reference_type:"admin",
    reference_id:null,
    admin_profile_id:adminProfileId,
  });
  if(tx.error){
    await supabase.from("profiles").update({reward_points_balance:oldBalance,updated_at:new Date().toISOString()}).eq("id",profileId);
    throw new Error(tx.error.message);
  }
  return{appliedAmount:applied,balance};
}

export async function GET(request:Request){
  const auth=await requireAdmin(request);if("error" in auth)return auth.error;
  const url=new URL(request.url);
  const settings=await getSettings(auth.supabase);
  if(url.searchParams.get("settingsOnly")==="1"){
    return NextResponse.json({ok:true,settings},{headers:{"Cache-Control":"private, no-store"}});
  }

  const page=Math.max(1,Number(url.searchParams.get("page")||1));
  const pageSize=Math.min(100,Math.max(1,Number(url.searchParams.get("pageSize")||25)));
  const q=String(url.searchParams.get("q")||"").trim();
  const profileId=String(url.searchParams.get("profileId")||"").trim();
  const from=(page-1)*pageSize,to=from+pageSize-1;

  let query=auth.supabase.from("customer_read_model").select("*",{count:"exact"}).not("profile_id","is",null);
  if(q)query=query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const result=await query.order("created_at",{ascending:false}).range(from,to);
  if(result.error)return NextResponse.json({ok:false,error:result.error.message},{status:400});

  const [allCount,memberCount,pointsRows] = await Promise.all([
    auth.supabase.from("customer_read_model").select("id",{count:"exact",head:true}).not("profile_id","is",null),
    auth.supabase.from("customer_read_model").select("id",{count:"exact",head:true}).not("profile_id","is",null).eq("is_member",true),
    auth.supabase.from("profiles").select("reward_points_balance").gt("reward_points_balance",0).limit(5000),
  ]);
  const customerCount=Number(allCount.count||0);
  const members=Number(memberCount.count||0);
  const totalPoints=(pointsRows.data||[]).reduce((sum:number,row:any)=>sum+positiveInt(row.reward_points_balance),0);
  const customersWithPoints=(pointsRows.data||[]).filter((row:any)=>positiveInt(row.reward_points_balance)>0).length;
  const total=Number(result.count||0),totalPages=Math.max(1,Math.ceil(total/pageSize));

  let transactions:any[]=[];
  if(profileId){
    const tx=await auth.supabase.from("rosta_point_transactions").select("*").eq("profile_id",profileId).order("created_at",{ascending:false}).limit(100);
    if(tx.error)return NextResponse.json({ok:false,error:tx.error.message},{status:400});
    transactions=tx.data||[];
  }

  return NextResponse.json({
    ok:true,
    customers:(result.data||[]).map((row:any)=>({
      id:row.profile_id||row.id,
      auth_user_id:null,
      is_legacy_member:row.membership_source==="ikas",
      is_member:Boolean(row.is_member),
      membership_source:row.membership_source||null,
      full_name:row.full_name||null,
      email:row.email||null,
      phone:row.phone||null,
      reward_points_balance:positiveInt(row.reward_points_balance),
      birthday_reward_points:positiveInt(row.birthday_reward_points),
      created_at:row.created_at||null,
    })),
    summary:{customerCount,memberCount:members,nonMemberCount:Math.max(0,customerCount-members),totalPoints,customersWithPoints},
    pagination:{page,pageSize,total,totalPages},
    transactions,
    settings,
  },{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request){
  const auth=await requireAdmin(request);if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>({}));
  const operation: "add"|"remove"=body.operation==="remove"?"remove":"add";
  const points=positiveInt(body.points);
  const reason=String(body.reason||"").trim();

  const ids=Array.isArray(body.profileIds)
    ? [...new Set(body.profileIds.map((value:unknown)=>String(value||"").trim()).filter(Boolean))].slice(0,300)
    : [String(body.profileId||body.profile_id||"").trim()].filter(Boolean);
  if(!ids.length||points<=0)return NextResponse.json({ok:false,error:"Müşteri ve puan miktarı gerekli."},{status:400});

  if(ids.length===1){
    try{return NextResponse.json({ok:true,...await adjustOne(auth.supabase,auth.profile.id,ids[0],operation,points,reason)});}
    catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Puan güncellenemedi."},{status:400});}
  }

  let successCount=0,failedCount=0;
  const errors:string[]=[];
  for(const id of ids){
    try{await adjustOne(auth.supabase,auth.profile.id,id,operation,points,reason);successCount++;}
    catch(error){failedCount++;errors.push(`${id}: ${error instanceof Error?error.message:"Hata"}`);}
  }
  return NextResponse.json({ok:true,successCount,failedCount,errors});
}

export async function PUT(request:Request){
  const auth=await requireAdmin(request);if("error" in auth)return auth.error;
  const body=await request.json().catch(()=>({}));
  const settings={
    signupPoints:positiveInt(body.signupPoints),
    birthdayPoints:positiveInt(body.birthdayPoints),
    updatedByProfileId:auth.profile.id,
  };
  const now=new Date().toISOString();
  const result=await auth.supabase.from("site_settings").upsert({
    setting_key:SETTINGS_KEY,setting_value:settings,is_public:false,updated_at:now,
  },{onConflict:"setting_key"});
  if(result.error)return NextResponse.json({ok:false,error:result.error.message},{status:400});
  return NextResponse.json({ok:true,settings:{...settings,updatedAt:now}});
}
