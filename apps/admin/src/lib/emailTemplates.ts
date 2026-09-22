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

const site = "https://www.ruthistanbul.com";

export const readyEmailTemplates: EmailTemplateDefinition[] = [
  { key: "soft_discount", title: "Sade İndirim Duyurusu", category: "İndirim", description: "Yakın hissettiren, sade kampanya maili.", fields: { subject: "Ruth Istanbul’dan küçük bir sürpriz", preheader: "Seçili parçalarda kısa süreli fırsat.", headline: "Seçili parçalarda küçük bir Ruth fırsatı", intro: "Merhaba {{customer_name}}, günlük stiline kolayca eşlik edecek seçili Ruth parçalarında kısa süreli bir fırsat hazırladık.", offer: "Sepetinde seçili ürünlerde avantajlı fiyatları görebilirsin.", buttonLabel: "Alışverişe Başla", buttonUrl: site, note: "Stoklarla sınırlıdır.", heroImageUrl: "" } },
  { key: "new_collection", title: "Yeni Koleksiyon", category: "Koleksiyon", description: "Yeni koleksiyon ve ürün duyurusu.", fields: { subject: "Yeni parçalar Ruth Istanbul’da", preheader: "Yeni eklenen takıları ilk keşfedenlerden ol.", headline: "Yeni parçalar yayında", intro: "Merhaba {{customer_name}}, Ruth Istanbul’da yeni eklenen parçalar yayına alındı.", offer: "Kolye, yüzük, bileklik ve setlerde yeni kombin seçenekleri seni bekliyor.", buttonLabel: "Yeni Ürünleri Keşfet", buttonUrl: site, note: "Her parça sınırlı stokla hazırlanır.", heroImageUrl: "" } },
  { key: "last_chance", title: "Son Şans", category: "Fırsat", description: "Az kalan stoklar için güçlü hatırlatma.", fields: { subject: "Beğendiğin parçalar tükenmeden", preheader: "Bazı Ruth parçalarında stoklar azalıyor.", headline: "Tükenmeden önce son kez bak", intro: "Merhaba {{customer_name}}, bazı Ruth parçalarında stoklar azalıyor.", offer: "Beğendiğin bir model varsa kaçırmadan tamamlayabilirsin.", buttonLabel: "Son Şans Ürünleri", buttonUrl: site, note: "Ürünler tekrar stoğa girmeyebilir.", heroImageUrl: "" } },
  { key: "abandoned_cart", title: "Sepet Hatırlatma", category: "Otomasyon", description: "Sepette kalan ürünleri hatırlatır.", fields: { subject: "Sepetindeki parçalar seni bekliyor", preheader: "Ödemeye geldiğin sepet hâlâ duruyor.", headline: "Sepetin seni bekliyor", intro: "Merhaba {{customer_name}}, ödemeye kadar geldiğin Ruth parçaları hâlâ seni bekliyor.", offer: "Kaldığın yerden devam edebilirsin.", buttonLabel: "Ödemeye Devam Et", buttonUrl: "{{checkout_url}}", note: "Stoklar sınırlıdır.", heroImageUrl: "" } },
  { key: "review_request", title: "Değerlendirme İsteği", category: "Otomasyon", description: "Teslim edilen siparişten sonra yorum ister.", fields: { subject: "Ürünü değerlendir, indirim kazan", preheader: "Deneyimini paylaş.", headline: "Deneyimini paylaş", intro: "Merhaba {{customer_name}}, siparişindeki parçaları değerlendirmek ister misin?", offer: "Yorumunu gönderdiğinde hesabına avantaj tanımlanır.", buttonLabel: "Değerlendir", buttonUrl: "{{review_url}}", note: "Yorumlar yayınlanmadan önce panelden onaylanır.", heroImageUrl: "" } },
  { key: "order_thanks", title: "Satın Alanlara Teşekkür", category: "Müşteri", description: "Satın alan müşterilere teşekkür maili.", fields: { subject: "Ruth Istanbul’dan teşekkür", preheader: "Bizi tercih ettiğin için teşekkür ederiz.", headline: "Bizi tercih ettiğin için teşekkür ederiz", intro: "Merhaba {{customer_name}}, Ruth Istanbul’dan alışveriş yaptığın için teşekkür ederiz.", offer: "Yeni kombin tamamlayıcılarını keşfedebilirsin.", buttonLabel: "Ruth’u Keşfet", buttonUrl: site, note: "Destek için her zaman bize yazabilirsin.", heroImageUrl: "" } },
  { key: "account_migrated", title: "Hesabın Taşındı", category: "Hizmet", description: "İkas üyelik geçiş bilgilendirmesi.", fields: { subject: "Ruth Istanbul hesabın yeni sitemize taşındı", preheader: "Yeni şifreni oluştur.", headline: "Hesabın yeni Ruth Istanbul’a taşındı", intro: "Merhaba {{customer_name}}, önceki üyelik kaydını yeni sitemizde hesabınla eşleştirdik.", offer: "Kişisel bağlantından yeni şifreni belirleyebilirsin.", buttonLabel: "Yeni Şifremi Oluştur", buttonUrl: "{{activation_url}}", note: "Bağlantı kişiye özeldir.", heroImageUrl: "" } },
  { key: "site_moved", title: "Yeni Siteye Taşındık", category: "Hizmet", description: "Yeni site duyurusu.", fields: { subject: "Ruth Istanbul yeni adresinde", preheader: "Yeni sitemiz yayında.", headline: "Yeni sitemize taşındık", intro: "Merhaba {{customer_name}}, Ruth Istanbul’un yeni sitesi artık yayında.", offer: "Yeni alışveriş deneyimini keşfedebilirsin.", buttonLabel: "Yeni Siteyi Aç", buttonUrl: site, note: "Bundan sonra www.ruthistanbul.com adresini kullanabilirsin.", heroImageUrl: "" } },
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

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f6f3ee;padding:0"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f3ee;padding:28px 12px;font-family:Arial,sans-serif;color:#211d19"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e4ddd3;border-radius:24px;overflow:hidden"><tr><td style="padding:26px;text-align:center;border-bottom:1px solid #e4ddd3">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Ruth Istanbul" width="260" style="max-width:260px;width:100%;height:auto;display:block;margin:0 auto 10px">` : `<div style="font:30px Georgia,serif;letter-spacing:.08em">Ruth Istanbul</div>`}<div style="margin-top:8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#76552f">Zamansız Takı Tasarımları</div></td></tr>${heroImageUrl ? `<tr><td><img src="${escapeHtml(heroImageUrl)}" alt="" style="display:block;width:100%;max-height:360px;object-fit:cover"></td></tr>` : ""}<tr><td style="padding:34px"><h1 style="margin:0 0 18px;font:34px/1.15 Georgia,serif;font-weight:400">${escapeHtml(headline)}</h1><p style="margin:0 0 18px;font-size:15px;line-height:1.8;color:#5f574e">${escapeHtml(intro)}</p>${offer ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.8">${escapeHtml(offer)}</p>` : ""}<a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#171717;color:#fff;text-decoration:none;font-size:13px;font-weight:700">${escapeHtml(buttonLabel)}</a>${note ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#655d55">${escapeHtml(note)}</p>` : ""}</td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e4ddd3;text-align:center;color:#655d55;font-size:11px">Ruth Istanbul · İstanbul</td></tr></table></td></tr></table></body></html>`;
}

export function buildSubject(fields: Partial<EmailTemplateFields> | null | undefined, variables: Record<string, string | number | null | undefined> = {}) {
  return renderTextTemplate(fields?.subject, variables);
}
