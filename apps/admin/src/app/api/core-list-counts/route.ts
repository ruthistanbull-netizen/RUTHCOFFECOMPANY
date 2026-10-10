import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

async function exactCount(query: PromiseLike<{ count?: number | null; error?: { message?: string } | null }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message || "Sayaç sorgusu başarısız.");
  if (!Number.isSafeInteger(result.count) || Number(result.count) < 0) throw new Error("Sayaç yanıtı eksik.");
  return Number(result.count);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { supabase } = auth;
    const kind = new URL(request.url).searchParams.get("kind");
    if (kind && !["products", "orders", "customers"].includes(kind)) {
      return NextResponse.json({ ok: false, error: "Geçersiz liste türü." }, { status: 400, headers: NO_STORE });
    }
    const [products, orders, customers] = await Promise.all([
      !kind || kind === "products" ?
      exactCount(
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .neq("status", "deleted")
          .neq("status", "archived") as any,
      ) : undefined,
      !kind || kind === "orders" ? exactCount(supabase.from("orders").select("id", { count: "exact", head: true }) as any) : undefined,
      !kind || kind === "customers" ? exactCount(supabase.from("customer_read_model").select("id", { count: "exact", head: true }) as any) : undefined,
    ]);

    return NextResponse.json(
      { ok: true, counts: { products, orders, customers } },
      { headers: NO_STORE },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Core liste sayaçları alınamadı." },
      { status: 500, headers: NO_STORE },
    );
  }
}
