import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const MAX_BYTES=24*1024*1024;

export async function POST(request:Request){
  const auth=await requireAdmin(request);if("error" in auth)return auth.error;
  const form=await request.formData().catch(()=>null);
  const file=form?.get("file");
  if(!(file instanceof File))return NextResponse.json({ok:false,error:"Görsel dosyası gerekli."},{status:400});
  if(file.size<=0||file.size>MAX_BYTES)return NextResponse.json({ok:false,error:"Görsel en fazla 24 MB olabilir."},{status:400});
  if(!String(file.type||"").startsWith("image/"))return NextResponse.json({ok:false,error:"Yalnızca görsel yüklenebilir."},{status:400});

  try{
    const input=Buffer.from(await file.arrayBuffer());
    const output=await sharp(input,{failOn:"none"})
      .rotate()
      .resize({width:3000,height:3000,fit:"inside",withoutEnlargement:true})
      .webp({quality:92,effort:4})
      .toBuffer();
    const objectPath=`theme/${Date.now()}-${randomUUID().slice(0,10)}.webp`;
    const uploaded=await auth.supabase.storage.from("rosta-media").upload(objectPath,output,{
      contentType:"image/webp",cacheControl:"31536000",upsert:false,
    });
    if(uploaded.error)throw new Error(uploaded.error.message);
    const {data}=auth.supabase.storage.from("rosta-media").getPublicUrl(objectPath);
    return NextResponse.json({ok:true,url:data.publicUrl,path:objectPath});
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Tema görseli yüklenemedi."},{status:400});
  }
}
