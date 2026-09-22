import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createReturnForOrder } from "@/lib/basitKargoShipping";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const { orderId } = await context.params;
    const result = await createReturnForOrder(auth.supabase, orderId);
    const revalidate = await revalidateWebsite({ source: "basit-kargo-return-created" });
    return NextResponse.json({ ok: true, ...result, revalidate }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "İade kodu oluşturulamadı." }, { status: 400, headers: noStoreHeaders() });
  }
}
