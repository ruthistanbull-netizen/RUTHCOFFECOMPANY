import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const productId = String(new URL(request.url).searchParams.get("product_id") || "").trim();
  if (!productId) {
    return NextResponse.json(
      { ok: false, error: "Ürün kimliği eksik." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const { data, error } = await auth.supabase
    .from("products")
    .select("id, name, product_code")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Ürün bulunamadı." },
      { status: 404, headers: noStoreHeaders() },
    );
  }

  return NextResponse.json(
    { ok: true, product: data },
    { headers: noStoreHeaders() },
  );
}
