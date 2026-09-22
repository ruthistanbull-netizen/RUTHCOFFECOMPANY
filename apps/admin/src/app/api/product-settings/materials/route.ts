import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { data } = await auth.supabase.from("products").select("material").neq("status", "archived").limit(1000);
  const options = [...new Set((data || []).map((row: any) => String(row.material || "").trim()).filter(Boolean))];
  return NextResponse.json({ ok: true, options });
}
