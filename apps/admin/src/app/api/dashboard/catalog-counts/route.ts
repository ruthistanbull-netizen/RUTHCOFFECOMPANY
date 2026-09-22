import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const [products, variants] = await Promise.all([
    auth.supabase.from("products").select("id", { count: "exact", head: true }).neq("status", "archived"),
    auth.supabase.from("product_variants").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  return NextResponse.json(
    {
      ok: true,
      products: Number(products.count || 0),
      variants: Number(variants.count || 0),
      warnings: [products.error?.message, variants.error?.message].filter(Boolean),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
