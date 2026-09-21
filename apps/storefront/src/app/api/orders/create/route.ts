import { NextResponse } from "next/server";
import { createCheckoutDraft } from "@/lib/orderServer";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    const order = await createCheckoutDraft({
      customer: body.customer || {},
      items: body.items || [],
      authToken: bearerToken(request),
    });

    return NextResponse.json({
      ok: true,
      orderNo: order.orderNo,
      totalAmount: order.totalAmount,
      currency: order.currency,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Ödeme taslağı oluşturulamadı." },
      { status: 400 }
    );
  }
}
