import {
  createCheckoutDraft,
  repriceExistingCheckoutDraft,
  type CreatedCheckoutDraft,
} from "@/lib/orderServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type CheckoutOrderDraft = CreatedCheckoutDraft & { draftId: string };

function safeText(value: unknown, maxLength: number) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function getAdminPaymentDraft(token: string): Promise<CheckoutOrderDraft | null> {
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(token)) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("checkout_drafts")
    .select("id, merchant_oid, order_no, resume_token, customer, items, subtotal, shipping_fee, discount_total, total_amount, currency, status, order_id, paytr_request")
    .or(`resume_token.eq.${token},merchant_oid.eq.${token},order_no.eq.${token}`)
    .maybeSingle();
  if (error || !data || !["waiting", "failed"].includes(String(data.status)) || data.order_id) return null;
  const requestMeta = data.paytr_request && typeof data.paytr_request === "object" ? data.paytr_request as Record<string, unknown> : {};
  if (requestMeta.source !== "admin_payment_link") return null;
  return {
    draftId: String(data.id), resumeToken: String(data.resume_token || token), orderNo: String(data.order_no),
    merchantOid: String(data.merchant_oid), customer: data.customer as any,
    items: Array.isArray(data.items) ? data.items as any[] : [], subtotal: Number(data.subtotal || 0),
    shippingFee: Number(data.shipping_fee || 0), discountTotal: Number(data.discount_total || 0),
    totalAmount: Number(data.total_amount || 0), currency: String(data.currency || "TRY"),
  };
}

export async function resolveCheckoutOrder(input: {
  body: any;
  authToken?: string | null;
}): Promise<CheckoutOrderDraft> {
  const { body, authToken } = input;
  const existingDraftToken = body.draftToken || body.resumeToken || body.abandonedDraftToken || null;
  const adminDraft = await getAdminPaymentDraft(String(existingDraftToken || ""));
  if (adminDraft) {
    return repriceExistingCheckoutDraft({ draft: adminDraft, authToken, rewards: body.rewards || null, coupon: body.coupon || null });
  }
  return createCheckoutDraft({
    customer: body.customer || {}, items: body.items || [], authToken, existingDraftToken,
    rewards: body.rewards || null, coupon: body.coupon || null, attribution: body.attribution || null,
  }) as Promise<CheckoutOrderDraft>;
}

export function buildPaytrBasket(draft: CheckoutOrderDraft, installmentFeeKurus = 0) {
  const subtotalKurus = draft.items.reduce((sum, item) => sum + Math.round(Number(item.totalPrice || 0) * 100), 0);
  let remainingDiscountKurus = Math.min(Math.max(Math.round(Number(draft.discountTotal || 0) * 100), 0), subtotalKurus);
  const rows: [string, string, number][] = draft.items.map((item, index) => {
    const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1)));
    const lineKurus = Math.round(Number(item.totalPrice || 0) * 100);
    const proportional = index === draft.items.length - 1 || subtotalKurus <= 0
      ? remainingDiscountKurus
      : Math.min(remainingDiscountKurus, Math.round((lineKurus / subtotalKurus) * Math.round(Number(draft.discountTotal || 0) * 100)));
    remainingDiscountKurus -= proportional;
    const discountedLineKurus = Math.max(quantity, lineKurus - proportional);
    const unitKurus = Math.round(discountedLineKurus / quantity);
    const name = item.variantName ? `${item.productName} - ${item.variantName}` : item.productName;
    return [safeText(name, 120), (unitKurus / 100).toFixed(2), quantity];
  });
  const shippingKurus = Math.round(Number(draft.shippingFee || 0) * 100);
  if (shippingKurus > 0) rows.push(["Kargo", (shippingKurus / 100).toFixed(2), 1]);
  if (installmentFeeKurus > 0) rows.push(["Taksit vade farkı", (installmentFeeKurus / 100).toFixed(2), 1]);
  return rows;
}
