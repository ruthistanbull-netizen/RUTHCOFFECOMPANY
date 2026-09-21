export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ProductId = Brand<string, "ProductId">;
export type VariantId = Brand<string, "VariantId">;
export type CartId = Brand<string, "CartId">;
export type CheckoutId = Brand<string, "CheckoutId">;
export type PaymentIntentId = Brand<string, "PaymentIntentId">;
export type PaymentAttemptId = Brand<string, "PaymentAttemptId">;
export type OrderId = Brand<string, "OrderId">;
export type OrderItemId = Brand<string, "OrderItemId">;
export type CustomerId = Brand<string, "CustomerId">;
export type AddressId = Brand<string, "AddressId">;
export type ShipmentId = Brand<string, "ShipmentId">;
export type ReturnId = Brand<string, "ReturnId">;
export type InventoryItemId = Brand<string, "InventoryItemId">;
export type InventoryReservationId = Brand<string, "InventoryReservationId">;
export type PointsLedgerEntryId = Brand<string, "PointsLedgerEntryId">;
export type CampaignId = Brand<string, "CampaignId">;
export type CouponId = Brand<string, "CouponId">;
export type CorrelationId = Brand<string, "CorrelationId">;
export type IdempotencyKey = Brand<string, "IdempotencyKey">;

export type CurrencyCode = "TRY";
export type IsoDateTime = string;

export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

export interface MoneyBreakdown {
  subtotal: Money;
  discount: Money;
  pointsDiscount: Money;
  shipping: Money;
  tax: Money;
  total: Money;
  calculationId: string;
}

export type OrderStatus =
  | "draft"
  | "awaiting_payment"
  | "paid"
  | "queued"
  | "in_production"
  | "quality_control"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "return_requested"
  | "returned";

export type PaymentStatus =
  | "pending"
  | "requires_action"
  | "processing"
  | "authorized"
  | "paid"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded";

export type FulfillmentStatus =
  | "unfulfilled"
  | "queued"
  | "in_production"
  | "quality_control"
  | "ready"
  | "fulfilled"
  | "cancelled";

export type ShipmentStatus =
  | "not_created"
  | "label_created"
  | "ready_for_handover"
  | "in_transit"
  | "delivered"
  | "exception"
  | "cancelled"
  | "returned";

export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "in_transit"
  | "received"
  | "inspected"
  | "refunded"
  | "exchanged"
  | "cancelled";

export type InventoryMovementType =
  | "initial"
  | "adjustment"
  | "reservation_created"
  | "reservation_released"
  | "allocation"
  | "sale"
  | "return"
  | "damage"
  | "transfer";

export type PointsLedgerEntryType =
  | "earned"
  | "spent"
  | "expired"
  | "admin_credit"
  | "admin_debit"
  | "refund_reversal";

export type RuthChannel =
  | "storefront"
  | "admin"
  | "commerce-api"
  | "worker"
  | "commerce-core";

export interface Address {
  id?: AddressId;
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2?: string;
  district: string;
  city: string;
  postalCode?: string;
  countryCode: "TR";
}

export interface CustomerSnapshot {
  id?: CustomerId;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface ProductSnapshot {
  productId: ProductId;
  variantId: VariantId;
  sku: string;
  title: string;
  variantTitle?: string;
  material?: string;
  imageUrl?: string;
  unitPrice: Money;
}

export interface CartItem {
  id: string;
  product: ProductSnapshot;
  quantity: number;
  lineTotal: Money;
}

export interface Cart {
  id: CartId;
  customerId?: CustomerId;
  items: CartItem[];
  pricing: MoneyBreakdown;
  couponCode?: string;
  pointsToSpend?: number;
  expiresAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface OrderItem {
  id: OrderItemId;
  product: ProductSnapshot;
  quantity: number;
  unitPrice: Money;
  discountTotal: Money;
  lineTotal: Money;
  fulfillmentStatus: FulfillmentStatus;
}

export interface Order {
  id: OrderId;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  shipmentStatus: ShipmentStatus;
  customer: CustomerSnapshot;
  shippingAddress: Address;
  billingAddress?: Address;
  items: OrderItem[];
  pricing: MoneyBreakdown;
  notes?: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface PaymentAttempt {
  id: PaymentAttemptId;
  paymentIntentId: PaymentIntentId;
  orderId: OrderId;
  provider: "paytr";
  status: PaymentStatus;
  amount: Money;
  providerReference?: string;
  failureCode?: string;
  failureMessage?: string;
  threeDSecure: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface InventoryItem {
  id: InventoryItemId;
  variantId: VariantId;
  sku: string;
  onHand: number;
  reserved: number;
  allocated: number;
  incoming: number;
  safetyStock: number;
  updatedAt: IsoDateTime;
}

export interface InventoryReservation {
  id: InventoryReservationId;
  orderId: OrderId;
  variantId: VariantId;
  quantity: number;
  status: "active" | "allocated" | "released" | "expired";
  expiresAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface InventoryMovement {
  id: string;
  inventoryItemId: InventoryItemId;
  variantId: VariantId;
  type: InventoryMovementType;
  quantity: number;
  orderId?: OrderId;
  reservationId?: InventoryReservationId;
  reason?: string;
  occurredAt: IsoDateTime;
}

export interface Shipment {
  id: ShipmentId;
  orderId: OrderId;
  provider: "basit-kargo" | "manual";
  status: ShipmentStatus;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  shippedAt?: IsoDateTime;
  deliveredAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface PointsLedgerEntry {
  id: PointsLedgerEntryId;
  customerId: CustomerId;
  type: PointsLedgerEntryType;
  points: number;
  balanceAfter: number;
  orderId?: OrderId;
  reason?: string;
  expiresAt?: IsoDateTime;
  createdAt: IsoDateTime;
}

export interface Campaign {
  id: CampaignId;
  name: string;
  status: "draft" | "active" | "paused" | "expired";
  type: "percentage" | "fixed_amount" | "free_shipping" | "points_multiplier";
  value: number;
  startsAt?: IsoDateTime;
  endsAt?: IsoDateTime;
}

export interface Coupon {
  id: CouponId;
  campaignId: CampaignId;
  code: string;
  maxRedemptions?: number;
  perCustomerLimit?: number;
  redeemedCount: number;
  active: boolean;
}

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
  correlationId: CorrelationId;
  fieldErrors?: FieldError[];
  details?: Record<string, unknown>;
}

export interface RuthEventEnvelope<TPayload = unknown> {
  eventId: string;
  type: string;
  version: number;
  aggregateId: string;
  aggregateType: string;
  occurredAt: IsoDateTime;
  channel: RuthChannel;
  correlationId: CorrelationId;
  causationId?: string;
  actorId?: string;
  payload: TPayload;
}

export type CommerceEventType =
  | "order.created"
  | "order.status_changed"
  | "payment.authorized"
  | "payment.paid"
  | "payment.failed"
  | "payment.refunded"
  | "inventory.reserved"
  | "inventory.released"
  | "inventory.allocated"
  | "shipment.created"
  | "shipment.shipped"
  | "shipment.delivered"
  | "points.earned"
  | "points.spent"
  | "points.adjusted";

export interface CommerceEvent<TPayload = Record<string, unknown>>
  extends RuthEventEnvelope<TPayload> {
  type: CommerceEventType;
}

export interface OrderSummary {
  id: OrderId;
  orderNumber: string;
  createdAt: IsoDateTime;
  customerName: string;
  total: Money;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  shipmentStatus: ShipmentStatus;
  itemCount: number;
}

export interface CommandContext {
  actorId?: string;
  channel: RuthChannel;
  correlationId: CorrelationId;
  idempotencyKey: IdempotencyKey;
}

export type PaymentProvider = "paytr" | "manual" | "legacy";
export type PaymentMethod = "card" | "payment_link" | "manual";
export type PaymentSummarySource = "commerce_v2" | "legacy";
export type PaymentSummaryFallbackReason =
  | "legacy_order"
  | "missing_payment_intent"
  | "missing_quote_metadata";
export type PaymentQuoteId = Brand<string, "PaymentQuoteId">;
export type RefundId = Brand<string, "RefundId">;

export interface InstallmentOption {
  installmentCount: number;
  rateBps: number;
  cardProgram?: string;
  orderAmount: Money;
  installmentFee: Money;
  chargedAmount: Money;
  regularInstallmentAmount: Money;
  finalInstallmentAmount: Money;
}

export interface PaymentQuote {
  id: PaymentQuoteId;
  provider: "paytr";
  method: "card";
  currency: CurrencyCode;
  options: InstallmentOption[];
  selectedOption?: InstallmentOption;
  expiresAt?: IsoDateTime;
}

export interface PaymentIntent {
  id: PaymentIntentId;
  orderId?: OrderId;
  checkoutId?: CheckoutId;
  provider: PaymentProvider;
  method: PaymentMethod;
  status: PaymentStatus;
  orderAmount: Money;
  chargedAmount: Money;
  installmentCount: number;
  cardProgram?: string;
  providerReference?: string;
  quoteId?: PaymentQuoteId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface PaymentSummary {
  source: PaymentSummarySource;
  provider: PaymentProvider;
  method: PaymentMethod;
  status: PaymentStatus;
  orderAmount: Money;
  chargedAmount: Money;
  installmentFee: Money;
  installmentCount: number;
  installmentRateBps: number;
  regularInstallmentAmount: Money;
  finalInstallmentAmount: Money;
  cardProgram?: string;
  quoteId?: PaymentQuoteId;
  providerReference?: string;
  paidAt?: IsoDateTime;
  fallbackReason?: PaymentSummaryFallbackReason;
}

export type OrderTimelineDomain =
  | "order"
  | "payment"
  | "fulfillment"
  | "shipping"
  | "return";

export interface OrderTimelineEvent {
  id: string;
  orderId: OrderId;
  domain: OrderTimelineDomain;
  type: string;
  status: string;
  label: string;
  occurredAt: IsoDateTime;
  actorId?: string;
  correlationId?: CorrelationId;
  details?: Record<string, unknown>;
}

export interface OrderDetail extends Order {
  paymentSummary: PaymentSummary;
  timeline: OrderTimelineEvent[];
}

export interface InventoryAvailability {
  inventoryItemId: InventoryItemId;
  variantId: VariantId;
  sku: string;
  onHand: number;
  reserved: number;
  allocated: number;
  safetyStock: number;
  available: number;
  updatedAt: IsoDateTime;
}

export interface ShipmentSummary {
  id: ShipmentId;
  orderId: OrderId;
  provider: "basit-kargo" | "manual";
  status: ShipmentStatus;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  latestEventAt?: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface TrackingEvent {
  id: string;
  shipmentId: ShipmentId;
  provider: "basit-kargo" | "manual";
  providerEventId?: string;
  status: ShipmentStatus;
  description?: string;
  location?: string;
  occurredAt: IsoDateTime;
  receivedAt: IsoDateTime;
}

export type ConsentPurpose =
  | "terms"
  | "privacy"
  | "marketing_email"
  | "marketing_sms"
  | "marketing_whatsapp";

export interface ConsentSnapshot {
  purpose: ConsentPurpose;
  granted: boolean;
  textVersion: string;
  capturedAt: IsoDateTime;
  channel: RuthChannel;
  ipHash?: string;
  userAgentHash?: string;
}

export interface PointsAccount {
  customerId: CustomerId;
  availablePoints: number;
  reservedPoints: number;
  lifetimeEarnedPoints: number;
  lifetimeSpentPoints: number;
  updatedAt: IsoDateTime;
}

export type ReturnType = "return" | "exchange";

export interface ReturnCase {
  id: ReturnId;
  orderId: OrderId;
  type: ReturnType;
  status: ReturnStatus;
  reason: string;
  requestedAmount?: Money;
  approvedAmount?: Money;
  requestedAt: IsoDateTime;
  approvedAt?: IsoDateTime;
  receivedAt?: IsoDateTime;
  completedAt?: IsoDateTime;
}

export interface RefundSummary {
  id: RefundId;
  orderId: OrderId;
  paymentIntentId: PaymentIntentId;
  provider: PaymentProvider;
  status: "requested" | "processing" | "succeeded" | "failed" | "cancelled";
  type: "full" | "partial";
  amount: Money;
  providerReference?: string;
  reason?: string;
  requestedAt: IsoDateTime;
  completedAt?: IsoDateTime;
}

export interface SearchQuery {
  text: string;
  cursor?: string;
  limit?: number;
  fields?: string[];
  filters?: Record<string, string | number | boolean | string[]>;
  sort?: Array<{ field: string; direction: "asc" | "desc" }>;
}

export interface SearchResult<TEntity = unknown> {
  id: string;
  entityType: string;
  title: string;
  subtitle?: string;
  score: number;
  highlights?: Record<string, string[]>;
  entity: TEntity;
}

export interface SearchGroup<TEntity = unknown> {
  key: string;
  label: string;
  results: SearchResult<TEntity>[];
  total: number;
  nextCursor?: string;
}

export interface SearchDiagnostics {
  queryId: string;
  normalizedText: string;
  durationMs: number;
  resultCount: number;
  zeroResult: boolean;
  searchedFields: string[];
  provider: string;
}

export interface SearchResponse<TEntity = unknown> {
  groups: SearchGroup<TEntity>[];
  diagnostics: SearchDiagnostics;
}

export type ActionResult<TData = unknown> =
  | {
      ok: true;
      data: TData;
      correlationId: CorrelationId;
      idempotencyKey?: IdempotencyKey;
    }
  | {
      ok: false;
      error: ApiError;
      correlationId: CorrelationId;
      idempotencyKey?: IdempotencyKey;
    };
