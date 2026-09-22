import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic="force-dynamic";

export async function POST(request:Request){
  const auth=await requireAdmin(request); if("error" in auth) return auth.error;
  return NextResponse.json({ok:true,removed:0,updated:0});
}
