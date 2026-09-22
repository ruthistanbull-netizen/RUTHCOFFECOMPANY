export type EmailTemplateKey =
  | "soft_discount"
  | "new_collection"
  | "last_chance"
  | "abandoned_cart"
  | "review_request"
  | "order_thanks"
  | "account_migrated"
  | "site_moved";

export type EmailTemplateFields = {
  subject: string;
  preheader: string;
  headline: string;
  intro: string;
  offer: string;
  buttonLabel: string;
  buttonUrl: string;
  note: string;
  heroImageUrl: string;
  logoUrl?: string;
};

export type EmailTemplateDefinition = {
  key: EmailTemplateKey;
  title: string;
  category: string;
  description: string;
  fields: EmailTemplateFields;
};

const site = "https://rostacoffecompany.zeabur.app";

export const readyEmailTemplates: EmailTemplateDefinition[] = [
  { key: "soft_discount", title: "Sade İndirim Duyurusu", category: "İndirim", description: "Yakın hissettiren, sade kampanya maili.", fields: { subject: "ROSTA Coffee Co.’dan küçük bir sürpriz", preheader: "Seçili kahvelerde kısa süreli fırsat.", headline: "Kahve rutinine küçük bir ROSTA fırsatı", intro: "Merhaba {{customer_name}}, seçili ROSTA kahvelerinde kısa süreli bir fırsat hazırladık.", offer: "Favori çekirdeğini veya yeni bir kavrumu avantajlı fiyatla deneyebilirsin.", buttonLabel: "Kahveleri Keşfet", buttonUrl: site, note: "Stoklarla sınırlıdır.", heroImageUrl: "" } },
  { key: "new_collection", title: "Yeni Kahveler", category: "Koleksiyon", description: "Yeni çekirdek, harman ve ürün duyurusu.", fields: { subject: "Yeni kahveler ROSTA Coffee Co.’da", preheader: "Yeni eklenen çekirdek ve harmanları keşfet.", headline: "Yeni kahveler yayında", intro: "Merhaba {{customer_name}}, ROSTA Coffee Co. seçkisine yeni kahveler eklendi.", offer: "Farklı kavrum profilleri, çekirdekler ve demleme deneyimleri seni bekliyor.", buttonLabel: "Yeni Kahveleri Keşfet", buttonUrl: site, note: "Bazı lotlar sınırlı stokla sunulabilir.", heroImageUrl: "" } },
  { key: "last_chance", title: "Son Şans", category: "Fırsat", description: "Az kalan kahve stokları için hatırlatma.", fields: { subject: "Favori kahven tükenmeden", preheader: "Bazı ROSTA kahvelerinde stoklar azalıyor.", headline: "Tükenmeden önce son kez bak", intro: "Merhaba {{customer_name}}, bazı ROSTA kahvelerinde stoklar azalıyor.", offer: "Beğendiğin çekirdek veya harman varsa stok bitmeden siparişini tamamlayabilirsin.", buttonLabel: "Son Stokları Gör", buttonUrl: site, note: "Lot ve stok durumuna göre yeniden temin süresi değişebilir.", heroImageUrl: "" } },
  { key: "abandoned_cart", title: "Sepet Hatırlatma", category: "Otomasyon", description: "Sepette kalan kahve ürünlerini hatırlatır.", fields: { subject: "Sepetindeki kahveler seni bekliyor", preheader: "Ödemeye geldiğin sepet hâlâ duruyor.", headline: "Sepetin seni bekliyor", intro: "Merhaba {{customer_name}}, ödemeye kadar geldiğin ROSTA ürünleri hâlâ sepetinde.", offer: "Kaldığın yerden devam edip siparişini tamamlayabilirsin.", buttonLabel: "Ödemeye Devam Et", buttonUrl: "{{checkout_url}}", note: "Stok durumu sipariş tamamlanana kadar değişebilir.", heroImageUrl: "" } },
  { key: "review_request", title: "Değerlendirme İsteği", category: "Otomasyon", description: "Teslim edilen siparişten sonra kahve deneyimini sorar.", fields: { subject: "ROSTA deneyimini değerlendir", preheader: "Kahveni nasıl bulduğunu bizimle paylaş.", headline: "Kahve deneyimini paylaş", intro: "Merhaba {{customer_name}}, siparişindeki ROSTA kahvelerini nasıl bulduğunu merak ediyoruz.", offer: "Aroma, kavrum ve genel deneyiminle ilgili kısa bir değerlendirme bırakabilirsin.", buttonLabel: "Değerlendir", buttonUrl: "{{review_url}}", note: "Geri bildirimin ürün ve hizmet deneyimini geliştirmemize yardımcı olur.", heroImageUrl: "" } },
  { key: "order_thanks", title: "Sipariş Teşekkürü", category: "Müşteri", description: "Satın alan müşterilere teşekkür maili.", fields: { subject: "ROSTA Coffee Co.’dan teşekkür", preheader: "Bizi tercih ettiğin için teşekkür ederiz.", headline: "Kahven hazırlandığı için mutluyuz", intro: "Merhaba {{customer_name}}, ROSTA Coffee Co.’dan alışveriş yaptığın için teşekkür ederiz.", offer: "Yeni çekirdekleri, harmanları ve demleme önerilerini dilediğin zaman keşfedebilirsin.", buttonLabel: "ROSTA’yı Keşfet", buttonUrl: site, note: "Siparişin veya kahven hakkında desteğe ihtiyaç duyarsan bize yazabilirsin.", heroImageUrl: "" } },
  { key: "account_migrated", title: "Hesap Erişimi Yenilendi", category: "Hizmet", description: "Mevcut müşteri hesabının yeni ROSTA sitesine geçiş bilgilendirmesi.", fields: { subject: "ROSTA Coffee Co. hesabın yeni sitemizde hazır", preheader: "Yeni şifreni oluştur.", headline: "ROSTA hesabın hazır", intro: "Merhaba {{customer_name}}, mevcut müşteri kaydını yeni ROSTA hesabınla eşleştirdik.", offer: "Kişisel bağlantından yeni şifreni belirleyerek hesabına erişebilirsin.", buttonLabel: "Yeni Şifremi Oluştur", buttonUrl: "{{activation_url}}", note: "Bağlantı kişiye özeldir.", heroImageUrl: "" } },
  { key: "site_moved", title: "Yeni Site Duyurusu", category: "Hizmet", description: "ROSTA web sitesi duyurusu.", fields: { subject: "ROSTA Coffee Co. online", preheader: "ROSTA web sitesi yayında.", headline: "ROSTA online deneyimi yayında", intro: "Merhaba {{customer_name}}, ROSTA Coffee Co. web sitesi artık yayında.", offer: "Kahveleri inceleyebilir, ürün detaylarını görebilir ve siparişini online tamamlayabilirsin.", buttonLabel: "ROSTA’yı Aç", buttonUrl: site, note: "Güncel adresimiz rostacoffecompany.zeabur.app.", heroImageUrl: "" } },
];

export function getReadyEmailTemplate(key?: string | null) {
  return readyEmailTemplates.find((template) => template.key === key) || readyEmailTemplates[0];
}

function safeText(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

export function renderTextTemplate(value: unknown, variables: Record<string, string | number | null | undefined>) {
  return safeText(value).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const next = variables[key];
    return next === null || next === undefined || next === "" ? "" : String(next);
  });
}

function escapeHtml(value: unknown) {
  return safeText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeHttpsUrl(value: unknown, fallback = "") {
  const raw = safeText(value).trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

function safeImageUrl(value: unknown) {
  const raw = safeText(value).trim();
  if (raw.startsWith("cid:") && /^[a-z0-9._-]+$/i.test(raw.slice(4))) return raw;
  return safeHttpsUrl(raw, "");
}

export function buildMarketingEmailHtml(fields: Partial<EmailTemplateFields> | null | undefined, variables: Record<string, string | number | null | undefined> = {}) {
  const safeFields = fields || {};
  const subject = renderTextTemplate(safeFields.subject, variables);
  const preheader = renderTextTemplate(safeFields.preheader, variables);
  const headline = renderTextTemplate(safeFields.headline, variables);
  const intro = renderTextTemplate(safeFields.intro, variables);
  const offer = renderTextTemplate(safeFields.offer, variables);
  const buttonLabel = renderTextTemplate(safeFields.buttonLabel, variables);
  const buttonUrl = safeHttpsUrl(renderTextTemplate(safeFields.buttonUrl, variables), site);
  const note = renderTextTemplate(safeFields.note, variables);
  const heroImageUrl = safeImageUrl(renderTextTemplate(safeFields.heroImageUrl, variables));
  const logoUrl = safeImageUrl(renderTextTemplate(safeFields.logoUrl, variables));

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#F4F0E8;padding:0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F0E8;padding:28px 12px;font-family:Arial,sans-serif;color:#111111"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#F4F0E8;border:1px solid #e4ddd3;border-radius:24px;overflow:hidden"><tr><td style="padding:26px;text-align:center;border-bottom:1px solid #e4ddd3">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="ROSTA Coffee Co." width="260" style="max-width:260px;width:100%;height:auto;display:block;margin:0 auto 10px">` : `<div style="font:30px Arial,sans-serif;letter-spacing:.08em">ROSTA Coffee Co.</div>`}<div style="margin-top:8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#B9563D">Specialty Coffee · Roastery · Consulting</div></td></tr>${heroImageUrl ? `<tr><td><img src="${escapeHtml(heroImageUrl)}" alt="" style="display:block;width:100%;max-height:360px;object-fit:cover"></td></tr>` : ""}<tr><td style="padding:34px"><h1 style="margin:0 0 18px;font:34px/1.15 Arial,sans-serif;font-weight:400">${escapeHtml(headline)}</h1><p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#6F725B">${escapeHtml(intro)}</p>${offer ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.8">${escapeHtml(offer)}</p>` : ""}<a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#111111;color:#F4F0E8;text-decoration:none;font-size:13px;font-weight:700">${escapeHtml(buttonLabel)}</a>${note ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#6F725B">${escapeHtml(note)}</p>` : ""}</td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e4ddd3;text-align:center;color:#6F725B;font-size:11px">ROSTA Coffee Co. · İstanbul</td></tr></table></td></tr></table></body></html>`;
}

export function buildSubject(fields: Partial<EmailTemplateFields> | null | undefined, variables: Record<string, string | number | null | undefined> = {}) {
  return renderTextTemplate(fields?.subject, variables);
}
