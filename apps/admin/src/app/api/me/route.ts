import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const auth=await requireAdmin(request);
  if("error" in auth)return auth.error;
  return NextResponse.json({ok:true,profile:auth.profile,user:{id:auth.user.id,email:auth.user.email||null}},{headers:{"Cache-Control":"no-store"}});
}
