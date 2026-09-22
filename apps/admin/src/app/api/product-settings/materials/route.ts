import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { productMaterialOptions } from "@/lib/productMaterials";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("products")
    .select("material")
    .neq("status", "archived")
    .limit(1000);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    options: productMaterialOptions((data || []).map((row: any) => row.material)),
  });
}
