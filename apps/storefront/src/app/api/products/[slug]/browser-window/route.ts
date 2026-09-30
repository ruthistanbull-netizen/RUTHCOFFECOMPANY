import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getProductPageWindowForSource } from "@/data/productNavigationContext";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const source = cookieStore.get("rosta_product_source")?.value || "";
  const window = await getProductPageWindowForSource(slug, source);

  if (!window.current) {
    return NextResponse.json(
      { ok: false, error: "Ürün bulunamadı." },
      { status: 404 },
    );
  }

  const response = NextResponse.json({ ok: true, window });
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}
