export type OrderLifecycle = "received" | "preparing" | "ready" | "shipped" | "delivered" | "cancelled";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(value: unknown, currency = "TRY") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(Number.isFinite(number) ? number : 0);
}

export function lifecycleForStatus(status: unknown): OrderLifecycle | null {
  const value = clean(status).toUpperCase();
  if (["CANCELLED", "CANCELED"].includes(value)) return "cancelled";
  if (["DELIVERED", "COMPLETED", "FULFILLED"].includes(value)) return "delivered";
  if (["SHIPPED", "OUT_FOR_DELIVERY", "DELAYED", "IN_TRANSIT"].includes(value)) return "shipped";
  if (["READY_TO_SHIP", "READY", "READY_FOR_HANDOVER", "LABEL_CREATED", "PREPARED"].includes(value)) return "ready";
  if (["QUEUED", "IN_PRODUCTION", "QUALITY_CONTROL", "PREPARING", "PROCESSING"].includes(value)) return "preparing";
  if (["PAID", "CREATED", "NEW", "CONFIRMED"].includes(value)) return "received";
  return null;
}

export function lifecycleCopy(lifecycle: OrderLifecycle, order: any) {
  const orderNo = clean(order.order_no) || clean(order.id);
  if (lifecycle === "received") return { subject: `Siparişini aldık - ${orderNo}`, eyebrow: "Sipariş Alındı", headline: "Siparişin başarıyla alındı", intro: `${orderNo} numaralı siparişin sistemimize ulaştı. Hazırlama süreci başladığında seni yeniden bilgilendireceğiz.`, accent: "#9A7B52" };
  if (lifecycle === "preparing") return { subject: `Siparişin hazırlanıyor - ${orderNo}`, eyebrow: "Hazırlanıyor", headline: "Siparişini hazırlıyoruz", intro: `${orderNo} numaralı siparişin hazırlama sürecine alındı. Ürünlerin kontrol edilip paketlendikten sonra kargoya hazır olacak.`, accent: "#8B6D46" };
  if (lifecycle === "ready") return { subject: `Siparişin kargoya hazır - ${orderNo}`, eyebrow: "Kargoya Hazır", headline: "Siparişin gönderime hazırlandı", intro: `${orderNo} numaralı siparişin için kargo kodu oluşturuldu. Kargon firmaya teslim edildiğinde yeniden haber vereceğiz.`, accent: "#9A7B52" };
  if (lifecycle === "shipped") return { subject: `Siparişin yola çıktı - ${orderNo}`, eyebrow: "Gönderildi", headline: "Siparişin kargoya verildi", intro: `${orderNo} numaralı siparişin yola çıktı. Güncel hareketleri sipariş takip sayfasından kontrol edebilirsin.`, accent: "#725838" };
  if (lifecycle === "cancelled") return { subject: `Siparişin iptal edildi - ${orderNo}`, eyebrow: "İptal Edildi", headline: "Siparişin iptal edildi", intro: `${orderNo} numaralı siparişin iptal edildi. Ödeme iadesi gerekiyorsa bankana yansıma süresi ödeme yöntemine göre değişebilir.`, accent: "#8B4B45" };
  return { subject: `Siparişin teslim edildi - ${orderNo}`, eyebrow: "Teslim Edildi", headline: "Siparişin sana ulaştı", intro: `${orderNo} numaralı siparişin teslim edildi. Ruth Istanbul'u tercih ettiğin için teşekkür ederiz.`, accent: "#55704B" };
}

export function buildOrderLifecycleHtml(lifecycle: OrderLifecycle, order: any) {
  const copy = lifecycleCopy(lifecycle, order);
  const siteUrl = clean(process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL) || "https://ruthistanbull.tr";
  const trackingUrl = `${siteUrl.replace(/\/$/, "")}/order-tracking`;
  const address = [clean(order.shipping_address_line) || clean(order.shipping_address_text), [clean(order.shipping_town), clean(order.shipping_city)].filter(Boolean).join(" / ")].filter(Boolean).join(", ");
  const trackingNo = ["shipped", "delivered"].includes(lifecycle) ? clean(order.cargo_tracking_no) || clean(order.basit_kargo_barcode) : "";
  const carrier = clean(order.cargo_company) || (["ready", "shipped", "delivered"].includes(lifecycle) ? "Kargo firması hazırlanıyor" : "Henüz kargo oluşturulmadı");
  const items = (order.order_items || []).map((item: any) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eadfce;vertical-align:top">
        <div style="font-size:14px;font-weight:700;color:#211a14">${escapeHtml(item.product_name || "Ürün")}</div>
        ${clean(item.variant_name) ? `<div style="margin-top:4px;font-size:12px;color:#817466">${escapeHtml(item.variant_name)}</div>` : ""}
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid #eadfce;text-align:center;vertical-align:top;font-size:13px;color:#817466">${Math.max(1, Number(item.quantity || 1))} adet</td>
      <td style="padding:12px 0;border-bottom:1px solid #eadfce;text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:#211a14">${formatMoney(item.total_price ?? item.unit_price, order.currency)}</td>
    </tr>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5efe5;font-family:Arial,Helvetica,sans-serif;color:#211a14"><div style="padding:24px 12px"><div style="max-width:640px;margin:0 auto;background:#fffaf2;border:1px solid #e8dccb;border-radius:22px;overflow:hidden"><div style="padding:28px 28px 18px;text-align:center;border-bottom:1px solid #eadfce"><div style="font-family:Georgia,serif;font-size:26px;letter-spacing:.13em">RUTH ISTANBUL</div><div style="margin-top:6px;font-size:9px;letter-spacing:.22em;color:#9a7b52">HANDMADE JEWELRY</div></div><div style="padding:30px 28px"><div style="font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:${copy.accent}">${copy.eyebrow}</div><h1 style="margin:12px 0 14px;font-family:Georgia,serif;font-size:30px;line-height:1.2;font-weight:500">${copy.headline}</h1><p style="margin:0;color:#6f6255;font-size:15px;line-height:1.75">Merhaba ${escapeHtml(order.customer_name || "")},</p><p style="margin:10px 0 0;color:#6f6255;font-size:15px;line-height:1.75">${escapeHtml(copy.intro)}</p><div style="margin-top:24px;padding:18px;border:1px solid #eadfce;border-radius:16px;background:#fff"><div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:10px"><span style="color:#817466;font-size:12px">Sipariş No</span><strong style="font-size:13px">${escapeHtml(order.order_no)}</strong></div><div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:10px"><span style="color:#817466;font-size:12px">Kargo Firması</span><strong style="font-size:13px">${escapeHtml(carrier)}</strong></div>${trackingNo ? `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#817466;font-size:12px">Takip No</span><strong style="font-size:13px;word-break:break-all">${escapeHtml(trackingNo)}</strong></div>` : ""}</div><div style="margin-top:24px"><div style="font-family:Georgia,serif;font-size:18px">Sipariş Özeti</div><table role="presentation" style="width:100%;border-collapse:collapse;margin-top:8px">${items}</table><div style="display:flex;justify-content:space-between;gap:16px;margin-top:16px;font-family:Georgia,serif;font-size:19px"><span>Toplam</span><strong>${formatMoney(order.total_amount, order.currency)}</strong></div></div>${address ? `<div style="margin-top:22px;padding:16px;border-radius:14px;background:#f5efe5"><div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#9a7b52">Teslimat Adresi</div><div style="margin-top:8px;font-size:13px;line-height:1.65;color:#5f5348">${escapeHtml(address)}</div></div>` : ""}<div style="margin-top:26px;text-align:center"><a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:15px 24px;background:#211a14;color:#fffaf2;text-decoration:none;font-size:11px;letter-spacing:.18em;text-transform:uppercase">Siparişini Takip Et</a></div><p style="margin:24px 0 0;text-align:center;color:#9a8d80;font-size:11px;line-height:1.6">Takip sayfasında sipariş numaranı ve siparişte kullandığın e-posta ya da telefonu girmen yeterli.</p></div></div></div></body></html>`;
}
