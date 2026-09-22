export function formatMoney(value: number | null | undefined, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatShortDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalize(value?: string | null) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

export function orderStatusLabel(value?: string | null) {
  const status = normalize(value);
  const labels: Record<string, string> = {
    created: "Yeni sipariş",
    new: "Yeni sipariş",
    pending: "Bekliyor",
    requires_action: "İşlem gerekli",
    preparing: "Hazırlanıyor",
    queued: "Hazırlanıyor",
    in_production: "Hazırlanıyor",
    quality_control: "Kalite kontrolünde",
    prepared: "Kargoya hazır",
    ready: "Kargoya hazır",
    ready_to_ship: "Kargoya hazır",
    shipped: "Gönderildi",
    in_transit: "Gönderildi",
    out_for_delivery: "Dağıtımda",
    completed: "Teslim edildi",
    delivered: "Teslim edildi",
    fulfilled: "Teslim edildi",
    cancelled: "İptal edildi",
    canceled: "İptal edildi",
    refunded: "İade edildi",
  };
  return labels[status] || value || "Bilinmiyor";
}

export function paymentStatusLabel(value?: string | null) {
  const status = normalize(value);
  const labels: Record<string, string> = {
    paid: "Ödendi",
    succeeded: "Ödendi",
    success: "Ödendi",
    pending: "Ödeme Bekleniyor",
    waiting: "Ödeme Bekleniyor",
    requires_action: "Ödeme İşlemi Gerekli",
    processing: "Ödeme İşleniyor",
    failed: "Ödeme Başarısız",
    rejected: "Ödeme Başarısız",
    cancelled: "Ödeme İptal Edildi",
    canceled: "Ödeme İptal Edildi",
    refunded: "Ödeme İade Edildi",
    partially_refunded: "Kısmi İade",
  };
  return labels[status] || value || "Bilinmiyor";
}

export function orderStatusTone(value?: string | null) {
  const status = normalize(value);
  if (["created", "new"].includes(status)) return "new";
  if (["preparing", "pending", "queued", "in_production", "quality_control"].includes(status)) return "preparing";
  if (["prepared", "ready", "ready_to_ship"].includes(status)) return "ready";
  if (["shipped", "in_transit", "out_for_delivery"].includes(status)) return "shipped";
  if (["completed", "delivered", "fulfilled"].includes(status)) return "delivered";
  if (["cancelled", "canceled", "refunded", "requires_action"].includes(status)) return "danger";
  return "neutral";
}

export function paymentStatusTone(value?: string | null) {
  const status = normalize(value);
  if (["paid", "succeeded", "success"].includes(status)) return "success";
  if (["pending", "waiting", "processing"].includes(status)) return "info";
  if (["requires_action"].includes(status)) return "warning";
  if (["failed", "rejected", "cancelled", "canceled"].includes(status)) return "danger";
  if (["refunded", "partially_refunded"].includes(status)) return "neutral";
  return "neutral";
}

export function initials(value?: string | null) {
  const parts = String(value || "Ruth").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toLocaleUpperCase("tr-TR") || "").join("") || "R";
}

export function formatPrice(value: unknown, currency = "TRY") {
  const number = Number(value || 0);
  return formatMoney(Number.isFinite(number) ? number : 0, currency);
}

export function formatDate(value: unknown) {
  return formatDateTime(value ? String(value) : null);
}

export function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
