import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function exactCount(query: PromiseLike<{ count?: number | null; error?: { message?: string } | null }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message || "Sayaç alınamadı.");
  return Number(result.count || 0);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { supabase } = auth;
    const [products, variants] = await Promise.all([
      exactCount(supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active") as any),
      exactCount(supabase.from("product_variants").select("id", { count: "exact", head: true }) as any),
    ]);

    return NextResponse.json(
      { ok: true, products, variants },
      { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ürün sayaçları alınamadı." },
      { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } },
    );
  }
}
