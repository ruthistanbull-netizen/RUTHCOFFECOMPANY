export type OrderDisplayStatus = "created" | "preparing" | "ready" | "shipped" | "completed" | "reviewed" | "cancelled";

export type PaymentDisplayStatus = "waiting" | "paid" | "failed" | "refunded";

export type CommerceStatusDomain = "order" | "payment" | "fulfillment" | "shipping" | "refund";

export interface OrderStatusContext {
  status?: string | null;
  payment_status?: string | null;
  shipping_status?: string | null;
  imported_source?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
}
