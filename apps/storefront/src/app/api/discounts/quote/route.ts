import { NextResponse } from "next/server";
import { createCheckoutQuote, repriceExistingCheckoutDraft } from "@/lib/orderServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const draftToken = String(body.draftToken || "");
    if (/^[A-Za-z0-9_-]{10,128}$/.test(draftToken)) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from("checkout_drafts")
        .select("id, merchant_oid, order_no, resume_token, customer, items, subtotal, shipping_fee, discount_total, total_amount, currency, status, order_id, paytr_request")
        .or(`resume_token.eq.${draftToken},merchant_oid.eq.${draftToken},order_no.eq.${draftToken}`)
        .maybeSingle();
      const meta = data?.paytr_request && typeof data.paytr_request === "object" ? data.paytr_request as Record<string, unknown> : {};
      if (data && meta.source === "admin_payment_link" && !data.order_id && ["waiting", "failed"].includes(String(data.status))) {
        const quote = await repriceExistingCheckoutDraft({
          draft: {
            draftId: String(data.id),
            resumeToken: String(data.resume_token || draftToken),
            orderNo: String(data.order_no),
            merchantOid: String(data.merchant_oid),
            customer: data.customer as any,
            items: Array.isArray(data.items) ? data.items as any[] : [],
            subtotal: Number(data.subtotal || 0),
            shippingFee: Number(data.shipping_fee || 0),
            discountTotal: Number(data.discount_total || 0),
            totalAmount: Number(data.total_amount || 0),
            currency: String(data.currency || "TRY"),
          },
          authToken: bearerToken(request),
          rewards: body.rewards || null,
          coupon: { code: body.couponCode || body.coupon?.code || null },
        });
        return NextResponse.json({ ok: true, quote }, { headers: { "Cache-Control": "no-store" } });
      }
    }
    const quote = await createCheckoutQuote({
      items: Array.isArray(body.items) ? body.items : [],
      couponCode: body.couponCode || body.coupon?.code || null,
      authToken: bearerToken(request),
      customerEmail: body.customerEmail || null,
      rewards: body.rewards || null,
    });
    return NextResponse.json({ ok: true, quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "İndirim hesaplanamadı." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
