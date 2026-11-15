/**
 * Runa cards backed by actual, authorized admin gateway results.
 * Never extrapolate product photos, prices, customer names or financial data
 * from generated language. The response is display-only (no credentials).
 */
export type RunaVisualField = { label: string; value: string };
export type RunaVisualPoint = { label: string; series: string; value: number };
export type RunaVisualCard = {
  id: string; kind: string; title: string; subtitle?: string;
  body?: string; status?: string; image_url?: string;
  fields?: RunaVisualField[]; points?: RunaVisualPoint[];
};
export type RunaVisualDeck = {
  title: string; subtitle?: string; body?: string;
  verified: true; cards: RunaVisualCard[];
};

function text(value: unknown, max = 150): string {
  return (typeof value === "string" || typeof value === "number"
    ? String(value) : "").trim().slice(0, max);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function items(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record).filter(row => Object.keys(row).length > 0) : [];
}
function add(fields: RunaVisualField[], label: string, value: unknown) {
  const formatted = text(value);
  if (formatted) fields.push({ label, value: formatted });
}
function amount(value: unknown, currency?: unknown) {
  if (typeof value === "string" && /(?:₺|\bTL\b|\bTRY\b)/i.test(value)) {
    // The existing Ruthie speech normalizer already renders monetary values
    // in Turkish notation. Avoid parsing "1.190 TL" as 1.19 or dropping it.
    return text(value, 70);
  }
  const n = typeof value === "number" ? value
    : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())
      ? Number(value) : NaN;
  if (!Number.isFinite(n)) return "";
  const code = text(currency, 3);
  const valid = /^[A-Z]{3}$/.test(code) ? code : "TRY";
  try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: valid }).format(n); }
  catch { return new Intl.NumberFormat("tr-TR").format(n) + " " + valid; }
}
function safeImage(value: unknown): string | undefined {
  const image = text(value, 1200);
  if (!image || image.length < 8) return undefined;
  try {
    const parsed = new URL(image);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? image : undefined;
  } catch { return undefined; }
}
function unwrap(value: unknown): Record<string, unknown> {
  const one = record(value);
  const nested = record(one.data);
  return Object.keys(nested).length ? nested : one;
}
function firstArray(data: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const entry = items(data[name]);
    if (entry.length) return entry;
  }
  return [] as Record<string, unknown>[];
}
function itemPhoto(row: Record<string, unknown>): string | undefined {
  const nested = firstArray(row, "order_items", "items", "line_items");
  const variant = firstArray(row, "product_variants");
  return safeImage(row.main_image_url ?? row.image_url ??
    row.cover_image_url ?? row.image ?? nested[0]?.image_url ??
    nested[0]?.main_image_url ?? variant[0]?.image_url);
}
function orderCard(row: Record<string, unknown>, index: number): RunaVisualCard {
  const fields: RunaVisualField[] = [];
  add(fields, "Müşteri", row.customer_name);
  add(fields, "Tutar", amount(row.total_amount, row.currency));
  add(fields, "Sipariş", row.status);
  add(fields, "Ödeme", row.payment_status);
  add(fields, "Kargo", row.shipping_status);
  add(fields, "Tarih", row.created_at ? text(row.created_at, 10) : "");
  const orderItems = firstArray(row, "order_items", "items", "line_items");
  for (const entry of orderItems.slice(0, 3)) {
    const name = text(entry.product_name, 85);
    if (name) add(fields, "Ürün", name);
  }
  return {
    id: text(row.id ?? row.order_no) || "order-" + index,
    kind: "order", title: text(row.order_no) || "Sipariş",
    subtitle: text(row.customer_name), status: text(row.status),
    image_url: itemPhoto(row), fields
  };
}
function productCard(row: Record<string, unknown>, index: number): RunaVisualCard {
  const fields: RunaVisualField[] = [];
  add(fields, "Fiyat", amount(row.price, row.currency));
  add(fields, "İndirimli fiyat", amount(row.sale_price, row.currency));
  add(fields, "SKU", row.sku);
  add(fields, "Stok", row.stock_quantity ?? row.stock);
  add(fields, "Materyal", row.material);
  add(fields, "Koleksiyon", row.collection_name);
  add(fields, "Durum", row.stock_status ?? row.status);
  const variants = firstArray(row, "product_variants");
  add(fields, "Varyant", variants.length || "");
  return {
    id: text(row.id ?? row.slug) || "product-" + index,
    kind: "product", title: text(row.name) || "Ürün",
    subtitle: text(row.sku) || undefined,
    status: text(row.stock_status ?? row.status),
    image_url: itemPhoto(row), fields
  };
}
function customerCard(row: Record<string, unknown>, index: number): RunaVisualCard {
  const fields: RunaVisualField[] = [];
  add(fields, "E-posta", row.email ?? row.customer_email);
  add(fields, "Telefon", row.phone ?? row.customer_phone);
  add(fields, "Sipariş", row.order_count ?? row.orders_count);
  add(fields, "Toplam harcama", amount(row.total_spent ?? row.total_amount, row.currency));
  add(fields, "Puan", row.points ?? row.points_balance);
  add(fields, "Üyelik", row.membership_status);
  return {
    id: text(row.id) || "customer-" + index,
    kind: "customer", title: text(row.full_name ?? row.name ?? row.customer_name) || "Müşteri",
    subtitle: text(row.membership_status) || undefined,
    fields
  };
}
function shipmentCard(row: Record<string, unknown>, index: number): RunaVisualCard {
  const fields: RunaVisualField[] = [];
  add(fields, "Sipariş", row.order_no);
  add(fields, "Müşteri", row.customer_name);
  add(fields, "Kargo firması", row.shipping_provider ?? row.cargo_company);
  add(fields, "Takip numarası", row.tracking_number ?? row.shipment_code);
  add(fields, "Durum", row.shipping_status ?? row.status);
  add(fields, "Tarih", row.created_at ? text(row.created_at, 10) : "");
  return {
    id: text(row.id ?? row.shipment_id) || "shipment-" + index,
    kind: "shipping",
    title: text(row.order_no ?? row.tracking_number ?? row.id) || "Gönderi",
    subtitle: text(row.customer_name),
    status: text(row.shipping_status ?? row.status),
    fields, image_url: itemPhoto(row)
  };
}
function returnCard(row: Record<string, unknown>, index: number): RunaVisualCard {
  const fields: RunaVisualField[] = [];
  add(fields, "Sipariş", row.order_no ?? row.order_number);
  add(fields, "Müşteri", row.customer_name);
  add(fields, "Talep", row.case_number ?? row.request_no);
  add(fields, "Tür", row.type ?? row.request_type);
  add(fields, "Durum", row.status);
  add(fields, "Tutar", amount(row.refund_amount ?? row.amount, row.currency));
  add(fields, "Tarih", row.created_at ? text(row.created_at, 10) : "");
  return {
    id: text(row.id ?? row.case_number) || "return-" + index,
    kind: "returns", title: text(row.case_number ?? row.request_no) || "Talep",
    subtitle: text(row.customer_name),
    status: text(row.status), fields
  };
}
function numericValue(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return NaN;
  // The legacy Ruthie speech normalizer formats e.g. 1190 as "1.190 TL".
  const trimmed = raw.trim().replace(/\s*(?:TL|TRY|₺)\s*$/i, "");
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(trimmed)) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }
  if (/^-?\d+(?:,\d+)?$/.test(trimmed)) return Number(trimmed.replace(",", "."));
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return NaN;
}

function financeCard(data: Record<string, unknown>): RunaVisualCard | undefined {
  const fields: RunaVisualField[] = [];
  add(fields, "Ciro", amount(data.revenue ?? data.total_revenue, data.currency));
  add(fields, "Gider", amount(data.expenses ?? data.total_expenses, data.currency));
  add(fields, "Net kâr", amount(data.net_profit ?? data.profit, data.currency));
  add(fields, "Sipariş", data.order_count);
  const sourcePoints = firstArray(data, "series", "points");
  const points = sourcePoints.slice(0, 60).flatMap(row => {
    const label = text(row.date ?? row.label ?? row.day, 40);
    const sources = [
      ["Ciro", row.revenue], ["Gider", row.expense ?? row.expenses],
      ["Net", row.profit ?? row.net_profit], ["Değer", row.value],
    ] as const;
    return sources.flatMap(([series, raw]) => {
      const value = numericValue(raw);
      return label && raw != null && Number.isFinite(value)
        ? [{ label, series, value }] : [];
    });
  }).slice(0, 90);
  if (!fields.length && !points.length) return undefined;
  return { id: "finance-summary", kind: "finance", title: "Finans özeti", fields, points };
}

export function buildRunaVerifiedVisual(action: string, source: unknown): RunaVisualDeck | undefined {
  const data = unwrap(source);
  const limits = 20;
  if (action === "orders.search") {
    const rows = firstArray(data, "orders");
    if (rows.length) return {
      title: "Siparişler", subtitle: String(Math.min(rows.length, limits)) + " kayıt",
      verified: true, cards: rows.slice(0, limits).map(orderCard),
    };
  }
  if (action === "shipping.orders") {
    const rows = firstArray(data, "shipments", "orders");
    if (rows.length) return {
      title: "Kargolar", subtitle: String(Math.min(rows.length, limits)) + " gönderi",
      verified: true, cards: rows.slice(0, limits).map(shipmentCard),
    };
  }
  if (action === "returns.search") {
    const rows = firstArray(data, "cases", "returns", "requests", "return_cases");
    if (rows.length) return {
      title: "İade ve değişim", subtitle: String(Math.min(rows.length, limits)) + " talep",
      verified: true, cards: rows.slice(0, limits).map(returnCard),
    };
  }
  if (action === "products.search") {
    const rows = firstArray(data, "products");
    if (rows.length) return {
      title: "Ürünler", subtitle: String(Math.min(rows.length, limits)) + " ürün",
      verified: true, cards: rows.slice(0, limits).map(productCard),
    };
  }
  if (action === "customers.search") {
    const rows = firstArray(data, "customers");
    if (rows.length) return {
      title: "Müşteriler", subtitle: String(Math.min(rows.length, limits)) + " müşteri",
      verified: true, cards: rows.slice(0, limits).map(customerCard),
    };
  }
  if (action === "panel.summary" || action === "orders.search") {
    const finance = financeCard(data);
    if (finance) return { title: "Finans", verified: true, cards: [finance] };
  }
  return undefined;
}
