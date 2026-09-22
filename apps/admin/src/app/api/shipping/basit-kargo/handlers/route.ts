import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { basitKargoRequest, type BasitKargoHandler } from "@/lib/basitKargo";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const handlers = await basitKargoRequest<BasitKargoHandler[]>("/handlers");
    return NextResponse.json({ ok: true, handlers }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Kargo firmaları alınamadı." }, { status: 400, headers: noStoreHeaders() });
  }
}
