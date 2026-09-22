export type RuthiePresentationKind =
  | "orders"
  | "products"
  | "shipments"
  | "customers"
  | "returns"
  | "payments"
  | "campaigns"
  | "reviews"
  | "points"
  | "catalog"
  | "email"
  | "health"
  | "generic";

export type RuthiePresentationView = "cards" | "table" | "summary";
export type RuthiePresentationFormat = "text" | "money" | "date" | "status" | "number";

export type RuthiePresentationColumn = {
  key: string;
  label: string;
  format: RuthiePresentationFormat;
};

export type RuthiePresentationRow = {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  imageUrl?: string;
  href?: string;
  values: Record<string, string>;
};

export type RuthiePresentationSummary = {
  label: string;
  value: string;
};

export type RuthiePresentation = {
  id: string;
  action: string;
  title: string;
  subtitle: string;
  kind: RuthiePresentationKind;
  view: RuthiePresentationView;
  columns: RuthiePresentationColumn[];
  rows: RuthiePresentationRow[];
  summary: RuthiePresentationSummary[];
  totalCount: number;
  createdAt: string;
  autoOpen: boolean;
};

type BuildOptions = {
  userText?: string;
  forceAutoOpen?: boolean;
  maxRows?: number;
};

type FieldSpec = {
  key: string;
  label: string;
  aliases: string[];
  format?: RuthiePresentationFormat;
};

const ARRAY_KEYS = [
  "orders", "products", "shipments", "customers", "returns", "payments", "campaigns",
  "reviews", "transactions", "movements", "collections", "categories", "messages", "items",
  "rows", "results", "records", "entries", "data",
];

const COMMON_FIELDS: FieldSpec[] = [
  { key: "name", label: "Ad", aliases: ["name", "title", "label", "full_name", "fullName", "customer_name", "customerName"] },
  { key: "status", label: "Durum", aliases: ["status", "state", "shipment_status", "payment_status"], format: "status" },
  { key: "createdAt", label: "Tarih", aliases: ["created_at", "createdAt", "date", "updated_at", "updatedAt"], format: "date" },
];

const FIELD_MAP: Record<RuthiePresentationKind, FieldSpec[]> = {
  orders: [
    { key: "orderNumber", label: "Sipariş", aliases: ["order_number", "orderNumber", "order_no", "orderNo", "number", "code", "id"] },
    { key: "customer", label: "Müşteri", aliases: ["customer_name", "customerName", "full_name", "fullName", "customer", "email"] },
    { key: "total", label: "Tutar", aliases: ["total_amount", "totalAmount", "grand_total", "grandTotal", "total", "amount", "price"], format: "money" },
    { key: "status", label: "Durum", aliases: ["status", "order_status", "orderStatus"], format: "status" },
    { key: "payment", label: "Ödeme", aliases: ["payment_status", "paymentStatus", "payment", "payment_method"], format: "status" },
    { key: "shipping", label: "Kargo", aliases: ["cargo_company", "cargoCompany", "shipping_provider", "shippingProvider", "carrier"] },
    { key: "createdAt", label: "Tarih", aliases: ["created_at", "createdAt", "order_date", "date"], format: "date" },
  ],
  products: [
    { key: "name", label: "Ürün", aliases: ["name", "title", "product_name", "productName"] },
    { key: "sku", label: "SKU", aliases: ["sku", "stock_code", "stockCode", "barcode"] },
    { key: "price", label: "Fiyat", aliases: ["sale_price", "salePrice", "price", "unit_price", "unitPrice"], format: "money" },
    { key: "stock", label: "Stok", aliases: ["stock_quantity", "stockQuantity", "stock", "quantity", "inventory"], format: "number" },
    { key: "status", label: "Durum", aliases: ["status", "publication_status", "publicationStatus", "is_active", "active"], format: "status" },
    { key: "category", label: "Kategori", aliases: ["category_name", "categoryName", "category", "collection_name", "collectionName"] },
  ],
  shipments: [
    { key: "tracking", label: "Takip No", aliases: ["tracking_number", "trackingNumber", "tracking_code", "trackingCode", "barcode"] },
    { key: "orderNumber", label: "Sipariş", aliases: ["order_number", "orderNumber", "order_no", "orderNo", "order_id", "orderId"] },
    { key: "carrier", label: "Firma", aliases: ["carrier", "provider", "cargo_company", "cargoCompany", "shipping_provider"] },
    { key: "recipient", label: "Alıcı", aliases: ["recipient_name", "recipientName", "customer_name", "customerName", "recipient"] },
    { key: "status", label: "Durum", aliases: ["status", "shipment_status", "shipmentStatus"], format: "status" },
    { key: "updatedAt", label: "Güncelleme", aliases: ["updated_at", "updatedAt", "created_at", "createdAt"], format: "date" },
  ],
  customers: [
    { key: "name", label: "Müşteri", aliases: ["full_name", "fullName", "name", "customer_name", "customerName"] },
    { key: "email", label: "E-posta", aliases: ["email", "customer_email", "customerEmail"] },
    { key: "phone", label: "Telefon", aliases: ["phone", "phone_number", "phoneNumber"] },
    { key: "orders", label: "Sipariş", aliases: ["order_count", "orderCount", "total_orders", "totalOrders"], format: "number" },
    { key: "spent", label: "Toplam Harcama", aliases: ["total_spent", "totalSpent", "lifetime_value", "lifetimeValue", "revenue"], format: "money" },
    { key: "points", label: "Puan", aliases: ["points", "point_balance", "pointBalance", "balance"], format: "number" },
  ],
  returns: [
    { key: "orderNumber", label: "Sipariş", aliases: ["order_number", "orderNumber", "order_no", "orderNo", "order_id", "orderId"] },
    { key: "customer", label: "Müşteri", aliases: ["customer_name", "customerName", "full_name", "fullName", "email"] },
    { key: "type", label: "Tür", aliases: ["type", "request_type", "requestType", "return_type", "returnType"] },
    { key: "status", label: "Durum", aliases: ["status", "return_status", "returnStatus"], format: "status" },
    { key: "amount", label: "Tutar", aliases: ["refund_amount", "refundAmount", "amount", "total"], format: "money" },
    { key: "createdAt", label: "Tarih", aliases: ["created_at", "createdAt", "date"], format: "date" },
  ],
  payments: [
    { key: "orderNumber", label: "Sipariş", aliases: ["order_number", "orderNumber", "merchant_oid", "merchantOid", "order_id", "orderId"] },
    { key: "amount", label: "Tutar", aliases: ["amount", "payment_amount", "paymentAmount", "total"], format: "money" },
    { key: "provider", label: "Sağlayıcı", aliases: ["provider", "payment_provider", "paymentProvider", "method"] },
    { key: "status", label: "Durum", aliases: ["status", "payment_status", "paymentStatus"], format: "status" },
    { key: "createdAt", label: "Tarih", aliases: ["created_at", "createdAt", "paid_at", "paidAt", "date"], format: "date" },
  ],
  campaigns: [
    { key: "name", label: "Kampanya", aliases: ["name", "title", "campaign_name", "campaignName", "code"] },
    { key: "type", label: "Tür", aliases: ["type", "discount_type", "discountType"] },
    { key: "value", label: "Değer", aliases: ["value", "discount_value", "discountValue", "amount", "percentage"] },
    { key: "status", label: "Durum", aliases: ["status", "is_active", "active"], format: "status" },
    { key: "endsAt", label: "Bitiş", aliases: ["ends_at", "endsAt", "end_date", "endDate"], format: "date" },
  ],
  reviews: [
    { key: "product", label: "Ürün", aliases: ["product_name", "productName", "product", "title"] },
    { key: "customer", label: "Müşteri", aliases: ["customer_name", "customerName", "full_name", "fullName", "email"] },
    { key: "rating", label: "Puan", aliases: ["rating", "score", "stars"], format: "number" },
    { key: "status", label: "Durum", aliases: ["status", "moderation_status", "moderationStatus"], format: "status" },
    { key: "createdAt", label: "Tarih", aliases: ["created_at", "createdAt", "date"], format: "date" },
  ],
  points: [
    { key: "customer", label: "Müşteri", aliases: ["customer_name", "customerName", "full_name", "fullName", "email"] },
    { key: "points", label: "Puan", aliases: ["points", "amount", "balance", "point_balance", "pointBalance"], format: "number" },
    { key: "type", label: "İşlem", aliases: ["type", "operation", "reason"] },
    { key: "createdAt", label: "Tarih", aliases: ["created_at", "createdAt", "date"], format: "date" },
  ],
  catalog: [
    { key: "name", label: "Ad", aliases: ["name", "title", "label"] },
    { key: "type", label: "Tür", aliases: ["type", "group_type", "groupType"] },
    { key: "products", label: "Ürün", aliases: ["product_count", "productCount", "count"], format: "number" },
    { key: "status", label: "Durum", aliases: ["status", "is_active", "active"], format: "status" },
  ],
  email: [
    { key: "subject", label: "Konu", aliases: ["subject", "title", "name"] },
    { key: "recipient", label: "Alıcı", aliases: ["recipient", "email", "to"] },
    { key: "status", label: "Durum", aliases: ["status", "delivery_status", "deliveryStatus"], format: "status" },
    { key: "createdAt", label: "Tarih", aliases: ["created_at", "createdAt", "sent_at", "sentAt"], format: "date" },
  ],
  health: [
    { key: "name", label: "Servis", aliases: ["name", "service", "provider", "title"] },
    { key: "status", label: "Durum", aliases: ["status", "state", "healthy", "ok"], format: "status" },
    { key: "latency", label: "Gecikme", aliases: ["latency", "latency_ms", "latencyMs", "response_time"] },
    { key: "updatedAt", label: "Kontrol", aliases: ["checked_at", "checkedAt", "updated_at", "updatedAt"], format: "date" },
  ],
  generic: COMMON_FIELDS,
};

export function buildRuthiePresentation(result: unknown, options: BuildOptions = {}): RuthiePresentation | null {
  const envelope = asRecord(result);
  if (envelope && envelope.ok === false) return null;
  if (envelope?.pendingAction) return null;

  const action = cleanString(envelope?.action) || "panel.summary";
  const kind = inferKind(action, envelope);
  const title = cleanString(envelope?.title) || defaultTitle(kind);
  const data = envelope && "data" in envelope ? envelope.data : result;
  const maxRows = Math.max(1, Math.min(100, options.maxRows || 50));
  const sourceRows = findBestRows(data).slice(0, maxRows);
  const specs = selectSpecs(kind, sourceRows);
  const rows = sourceRows.map((item, index) => buildRow(item, index, kind, specs));
  const summary = buildSummary(data, rows.length);

  if (!rows.length && !summary.length) return null;

  const totalCount = detectTotalCount(data) || rows.length;
  const view = rows.length
    ? prefersCards(kind) ? "cards" : "table"
    : "summary";

  return {
    id: makeId(),
    action,
    title,
    subtitle: totalCount > rows.length
      ? `${rows.length} kayıt gösteriliyor · toplam ${totalCount}`
      : rows.length ? `${rows.length} kayıt` : "Canlı panel özeti",
    kind,
    view,
    columns: specs.filter((spec) => rows.some((row) => row.values[spec.key])).map((spec) => ({
      key: spec.key,
      label: spec.label,
      format: spec.format || "text",
    })),
    rows,
    summary,
    totalCount,
    createdAt: new Date().toISOString(),
    autoOpen: Boolean(options.forceAutoOpen || wantsVisualResult(options.userText || "")),
  };
}

export function wantsVisualResult(text: string) {
  const normalized = text.toLocaleLowerCase("tr-TR");
  return [
    "göster", "goster", "getir", "listele", "tablo", "kart", "popup", "pop up",
    "ekrana", "aç", "ac", "önüme", "onume", "son ", "görüntüle", "goruntule",
  ].some((term) => normalized.includes(term));
}

function findBestRows(value: unknown, depth = 0): unknown[] {
  if (Array.isArray(value)) return value.filter(isRenderableRow);
  if (depth > 3) return [];
  const record = asRecord(value);
  if (!record) return [];

  for (const key of ARRAY_KEYS) {
    const candidate = record[key];
    if (Array.isArray(candidate) && candidate.some(isRenderableRow)) return candidate.filter(isRenderableRow);
  }

  for (const candidate of Object.values(record)) {
    if (Array.isArray(candidate) && candidate.some(isRenderableRow)) return candidate.filter(isRenderableRow);
  }

  for (const candidate of Object.values(record)) {
    const nested = findBestRows(candidate, depth + 1);
    if (nested.length) return nested;
  }
  return [];
}

function isRenderableRow(value: unknown) {
  return value !== null && value !== undefined && (typeof value !== "object" || !Array.isArray(value));
}

function selectSpecs(kind: RuthiePresentationKind, rows: unknown[]) {
  const preferred = FIELD_MAP[kind] || COMMON_FIELDS;
  const present = preferred.filter((spec) => rows.some((row) => pickValue(asRecord(row), spec.aliases) !== undefined));
  if (present.length >= 2) return present.slice(0, 7);

  const first = rows.map(asRecord).find(Boolean);
  if (!first) return preferred.slice(0, 4);
  const fallback = Object.keys(first)
    .filter((key) => isScalar(first[key]) && !isTechnicalKey(key))
    .slice(0, 6)
    .map((key) => ({ key, label: humanize(key), aliases: [key], format: inferFormat(key) } satisfies FieldSpec));
  return [...present, ...fallback.filter((item) => !present.some((current) => current.key === item.key))].slice(0, 7);
}

function buildRow(value: unknown, index: number, kind: RuthiePresentationKind, specs: FieldSpec[]): RuthiePresentationRow {
  const record = asRecord(value) || { value };
  const values: Record<string, string> = {};
  for (const spec of specs) {
    const raw = pickValue(record, spec.aliases);
    if (raw === undefined || raw === null || raw === "") continue;
    values[spec.key] = formatValue(raw, spec.format || inferFormat(spec.key));
  }

  const title = rowTitle(record, kind, values, index);
  const subtitle = rowSubtitle(kind, values);
  const status = values.status || values.payment;
  const imageUrl = cleanString(pickValue(record, ["image_url", "imageUrl", "image", "thumbnail", "thumbnail_url", "media_url"]));
  const id = cleanString(pickValue(record, ["id", "uuid", "order_id", "orderId", "product_id", "productId", "shipment_id", "shipmentId"])) || `${kind}-${index + 1}`;

  return {
    id,
    title,
    subtitle,
    status,
    imageUrl: imageUrl?.startsWith("http") ? imageUrl : undefined,
    href: moduleHref(kind),
    values,
  };
}

function rowTitle(record: Record<string, unknown>, kind: RuthiePresentationKind, values: Record<string, string>, index: number) {
  const candidates: Record<RuthiePresentationKind, string[]> = {
    orders: ["orderNumber", "customer"],
    products: ["name", "sku"],
    shipments: ["tracking", "orderNumber"],
    customers: ["name", "email"],
    returns: ["orderNumber", "customer"],
    payments: ["orderNumber", "provider"],
    campaigns: ["name", "type"],
    reviews: ["product", "customer"],
    points: ["customer", "type"],
    catalog: ["name", "type"],
    email: ["subject", "recipient"],
    health: ["name", "status"],
    generic: ["name", "title", "id"],
  };
  for (const key of candidates[kind]) if (values[key]) return values[key];
  const raw = pickValue(record, ["name", "title", "label", "id", "code"]);
  return raw == null ? `${defaultRowLabel(kind)} ${index + 1}` : formatValue(raw, "text");
}

function rowSubtitle(kind: RuthiePresentationKind, values: Record<string, string>) {
  const keys: Record<RuthiePresentationKind, string[]> = {
    orders: ["customer", "total", "createdAt"],
    products: ["sku", "price", "stock"],
    shipments: ["carrier", "recipient", "orderNumber"],
    customers: ["email", "phone", "orders"],
    returns: ["customer", "type", "amount"],
    payments: ["amount", "provider", "createdAt"],
    campaigns: ["type", "value", "endsAt"],
    reviews: ["customer", "rating", "createdAt"],
    points: ["points", "type", "createdAt"],
    catalog: ["type", "products"],
    email: ["recipient", "createdAt"],
    health: ["latency", "updatedAt"],
    generic: ["createdAt", "status"],
  };
  const parts = keys[kind].map((key) => values[key]).filter(Boolean).slice(0, 3);
  return parts.length ? parts.join(" · ") : undefined;
}

function buildSummary(value: unknown, rowCount: number): RuthiePresentationSummary[] {
  const root = asRecord(value);
  if (!root) return [];
  const preferred = [
    "total", "count", "total_count", "totalCount", "revenue", "total_revenue", "totalRevenue",
    "pending", "completed", "failed", "active", "inactive", "average", "avg", "balance",
    "healthy", "unhealthy", "last_updated", "lastUpdated",
  ];
  const items: RuthiePresentationSummary[] = [];
  for (const key of [...preferred, ...Object.keys(root)]) {
    if (items.length >= 6 || items.some((item) => item.label === humanize(key))) continue;
    const raw = root[key];
    if (!isScalar(raw) || raw === "" || raw === null || raw === undefined) continue;
    if (rowCount && ["ok", "status", "message"].includes(key)) continue;
    items.push({ label: humanize(key), value: formatValue(raw, inferFormat(key)) });
  }
  return items;
}

function detectTotalCount(value: unknown) {
  const root = asRecord(value);
  if (!root) return 0;
  for (const key of ["total", "total_count", "totalCount", "count", "record_count", "recordCount"]) {
    const numeric = Number(root[key]);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  const nested = asRecord(root.meta) || asRecord(root.pagination) || asRecord(root.summary);
  if (nested) return detectTotalCount(nested);
  return 0;
}

function inferKind(action: string, envelope: Record<string, unknown> | null): RuthiePresentationKind {
  const normalized = `${action} ${cleanString(envelope?.title)}`.toLocaleLowerCase("tr-TR");
  if (normalized.includes("shipping") || normalized.includes("kargo") || normalized.includes("shipment")) return "shipments";
  if (normalized.includes("order") || normalized.includes("sipariş")) return "orders";
  if (normalized.includes("product") || normalized.includes("ürün") || normalized.includes("stok")) return "products";
  if (normalized.includes("customer") || normalized.includes("müşteri")) return "customers";
  if (normalized.includes("return") || normalized.includes("iade") || normalized.includes("değişim")) return "returns";
  if (normalized.includes("payment") || normalized.includes("ödeme") || normalized.includes("paytr")) return "payments";
  if (normalized.includes("campaign") || normalized.includes("kampanya") || normalized.includes("discount")) return "campaigns";
  if (normalized.includes("review") || normalized.includes("yorum")) return "reviews";
  if (normalized.includes("point") || normalized.includes("puan")) return "points";
  if (normalized.includes("catalog") || normalized.includes("kategori") || normalized.includes("koleksiyon")) return "catalog";
  if (normalized.includes("email") || normalized.includes("e-posta") || normalized.includes("message")) return "email";
  if (normalized.includes("health") || normalized.includes("sağlık") || normalized.includes("service")) return "health";
  return "generic";
}

function prefersCards(kind: RuthiePresentationKind) {
  return ["orders", "products", "shipments", "customers", "returns"].includes(kind);
}

function moduleHref(kind: RuthiePresentationKind) {
  const hrefs: Partial<Record<RuthiePresentationKind, string>> = {
    orders: "/orders",
    products: "/products",
    shipments: "/shipping",
    customers: "/customers",
    returns: "/returns",
    payments: "/payments",
    campaigns: "/discounts",
    reviews: "/reviews",
    points: "/points",
  };
  return hrefs[kind];
}

function defaultTitle(kind: RuthiePresentationKind) {
  const labels: Record<RuthiePresentationKind, string> = {
    orders: "Siparişler",
    products: "Ürünler",
    shipments: "Kargo kayıtları",
    customers: "Müşteriler",
    returns: "İade ve değişimler",
    payments: "Ödemeler",
    campaigns: "Kampanyalar",
    reviews: "Yorumlar",
    points: "ROSTA Points",
    catalog: "Kategori ve koleksiyonlar",
    email: "E-posta kayıtları",
    health: "Servis durumu",
    generic: "ROSTA Insight sonucu",
  };
  return labels[kind];
}

function defaultRowLabel(kind: RuthiePresentationKind) {
  return defaultTitle(kind).replace(/ler$|lar$/, "");
}

function pickValue(record: Record<string, unknown> | null, aliases: string[]) {
  if (!record) return undefined;
  for (const alias of aliases) if (alias in record) return record[alias];
  const normalized = new Map(Object.keys(record).map((key) => [normalizeKey(key), key]));
  for (const alias of aliases) {
    const actual = normalized.get(normalizeKey(alias));
    if (actual) return record[actual];
  }
  return undefined;
}

function formatValue(value: unknown, format: RuthiePresentationFormat): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Açık" : "Kapalı";
  if (format === "money") {
    const numeric = numberValue(value);
    return numeric === null
      ? cleanString(value) || "—"
      : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 }).format(numeric);
  }
  if (format === "number") {
    const numeric = numberValue(value);
    return numeric === null ? cleanString(value) || "—" : new Intl.NumberFormat("tr-TR").format(numeric);
  }
  if (format === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? cleanString(value) || "—"
      : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  }
  if (typeof value === "object") return cleanString(asRecord(value)?.name) || cleanString(asRecord(value)?.title) || "—";
  return String(value).trim() || "—";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s/g, "").replace(/₺|TL|TRY/gi, "");
  if (!normalized) return null;
  const decimal = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+(\.\d{1,2})?$/.test(normalized)
      ? normalized.split(".").map((part, index, parts) => index === parts.length - 1 && part.length <= 2 ? `.${part}` : part).join("")
      : normalized;
  const numeric = Number(decimal);
  return Number.isFinite(numeric) ? numeric : null;
}

function inferFormat(key: string): RuthiePresentationFormat {
  const normalized = normalizeKey(key);
  if (["amount", "total", "price", "revenue", "spent", "cost", "refund"].some((part) => normalized.includes(part))) return "money";
  if (["date", "created", "updated", "time", "ends", "starts", "paidat", "sentat"].some((part) => normalized.includes(part))) return "date";
  if (["status", "state", "active", "healthy", "enabled"].some((part) => normalized.includes(part))) return "status";
  if (["count", "quantity", "stock", "points", "rating", "score", "balance"].some((part) => normalized.includes(part))) return "number";
  return "text";
}

function humanize(value: string) {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced ? spaced.charAt(0).toLocaleUpperCase("tr-TR") + spaced.slice(1) : "Değer";
}

function normalizeKey(value: string) {
  return value.replace(/[_\-\s]/g, "").toLocaleLowerCase("tr-TR");
}

function isTechnicalKey(key: string) {
  const normalized = normalizeKey(key);
  return ["metadata", "raw", "payload", "token", "secret", "hash", "authuserid", "profileid"].some((part) => normalized.includes(part));
}

function isScalar(value: unknown) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `ruthie-result-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
