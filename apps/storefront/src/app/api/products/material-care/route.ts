import { NextResponse } from "next/server";
import { getProductBySlug } from "@/data/catalogReadModel";

export const runtime = "nodejs";
export const revalidate = 300;

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("slug")?.trim();
    if (!slug) return NextResponse.json({ ok: false }, { status: 400 });
    const product = await getProductBySlug(slug);
    if (!product) return NextResponse.json({ ok: false }, { status: 404 });

    return NextResponse.json(
      {
        ok: true,
        material: clean(product.material),
        coating: clean(product.finish_color || product.material_note),
        care: clean(product.care_advice),
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
