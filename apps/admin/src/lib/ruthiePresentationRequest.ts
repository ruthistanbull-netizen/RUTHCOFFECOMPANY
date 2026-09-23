export type RuthiePresentationRequest = {
  action: string;
  query: Record<string, string | number | boolean>;
  reason: string;
};

export function resolveRuthiePresentationRequest(input: string): RuthiePresentationRequest {
  const text = input.trim();
  const normalized = normalize(text);
  const limit = requestedLimit(normalized);
  const common = {
    limit,
    pageSize: limit,
    sort: wantsOldest(normalized) ? "oldest" : "recent",
  };

  if (hasAny(normalized, ["kargo", "gönderi", "gonderi", "takip no", "tracking", "shipment"])) {
    return read("shipping.orders", { ...common, view: "orders", q: searchTerm(text, ["kargo", "gönderi", "gonderi", "takip no", "tracking", "shipment"]) }, text);
  }
  if (hasAny(normalized, ["iade", "değişim", "degisim", "return"])) {
    return read("returns.search", { ...common, q: searchTerm(text, ["iade", "değişim", "degisim", "return"]) }, text);
  }
  if (hasAny(normalized, ["ödeme", "odeme", "paytr", "tahsilat", "payment"])) {
    return read("orders.search", { ...common, view: "payments", q: searchTerm(text, ["ödeme", "odeme", "paytr", "tahsilat", "payment"]) }, text);
  }
  if (hasAny(normalized, ["sipariş", "siparis", "order"])) {
    return read("orders.search", { ...common, q: searchTerm(text, ["sipariş", "siparis", "order"]) }, text);
  }
  if (hasAny(normalized, ["stok", "ürün", "urun", "varyant", "sku", "product"])) {
    const view = hasAny(normalized, ["stok", "azalan", "tükenen", "tukenen"]) ? "inventory" : "products";
    return read("products.search", { ...common, view, q: searchTerm(text, ["stok", "ürün", "urun", "varyant", "sku", "product"]) }, text);
  }
  if (hasAny(normalized, ["müşteri", "musteri", "customer", "üyeler", "uyeler"])) {
    return read("customers.search", { ...common, q: searchTerm(text, ["müşteri", "musteri", "customer", "üye", "uye"]) }, text);
  }
  if (hasAny(normalized, ["kampanya", "indirim", "kupon", "campaign", "discount"])) {
    return read("campaigns.search", { ...common, q: searchTerm(text, ["kampanya", "indirim", "kupon", "campaign", "discount"]) }, text);
  }
  if (hasAny(normalized, ["yorum", "review", "değerlendirme", "degerlendirme"])) {
    return read("reviews.search", { ...common, q: searchTerm(text, ["yorum", "review", "değerlendirme", "degerlendirme"]) }, text);
  }
  if (hasAny(normalized, ["puan", "rosta points", "ruthie points", "points", "sadakat"])) {
    return read("points.search", { ...common, q: searchTerm(text, ["puan", "rosta points", "ruthie points", "points", "sadakat"]) }, text);
  }
  if (hasAny(normalized, ["kategori", "koleksiyon", "catalog", "collection"])) {
    return read("catalog.groups.read", { ...common, type: normalized.includes("koleksiyon") ? "collection" : "category" }, text);
  }
  if (hasAny(normalized, ["terk sepet", "terk edilmiş sepet", "terk edilmis sepet", "abandoned cart"])) {
    return read("abandoned_carts.search", { ...common }, text);
  }
  if (hasAny(normalized, ["e-posta", "eposta", "email", "mail", "iletişim mesaj", "iletisim mesaj"])) {
    return read("email.status", { ...common, operation: "messages" }, text);
  }
  if (hasAny(normalized, ["servis", "sağlık", "saglik", "entegrasyon", "health", "sistem durumu"])) {
    return read("panel.health", { ...common }, text);
  }
  if (hasAny(normalized, ["dashboard", "panel", "özet", "ozet", "rapor", "bildirim"])) {
    return read("panel.summary", { ...common, view: "dashboard" }, text);
  }

  return read("panel.summary", { ...common, view: "search", q: text.slice(0, 180) }, text);
}

function read(action: string, query: Record<string, string | number | boolean>, reason: string): RuthiePresentationRequest {
  return {
    action,
    query: Object.fromEntries(Object.entries(query).filter(([, value]) => value !== "" && value !== undefined)),
    reason: `Kullanıcının ekranda görsel sonuç isteği: ${reason.slice(0, 240)}`,
  };
}

function requestedLimit(text: string) {
  const matches = [
    /\b(?:son|ilk|en son)\s+(\d{1,3})\b/,
    /\b(\d{1,3})\s+(?:tane|adet|sipariş|siparis|ürün|urun|kargo|müşteri|musteri|kayıt|kayit)\b/,
  ];
  for (const pattern of matches) {
    const match = pattern.exec(text);
    if (match) return Math.max(1, Math.min(100, Number(match[1]) || 10));
  }
  return 10;
}

function wantsOldest(text: string) {
  return hasAny(text, ["en eski", "ilk sipariş", "ilk siparis", "eskiden yeniye"]);
}

function searchTerm(text: string, ignored: string[]) {
  const quoted = text.match(/[“"]([^”"]{2,120})[”"]/u)?.[1]?.trim();
  if (quoted) return quoted;
  const email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
  if (email) return email;
  const reference = text.match(/\b(?=[a-z0-9-]*\d)[a-z0-9-]{4,}\b/i)?.[0];
  if (reference && !/^\d{1,3}$/.test(reference)) return reference;

  const withoutDomain = ignored.reduce((value, term) => value.replace(
    new RegExp(`${escapeRegExp(term)}[a-zçğıöşü]*`, "giu"),
    " ",
  ), text);
  const cleaned = withoutDomain
    .replace(/\b(?:son|ilk|en|tane|adet|kayıt|kayit|göster|goster|getir|listele|tablo|kart|popup|pop up|ekrana|aç|ac|olan|olanlar|ver|çıkar|cikar|bak)\b/giu, " ")
    .replace(/\b\d{1,3}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const residue = new Set(["i", "ı", "u", "ü", "yi", "yı", "yu", "yü", "leri", "ları"]);
  const useful = cleaned.split(" ").filter((word) => word.length >= 2 && !residue.has(normalize(word))).join(" ");
  return useful.length >= 2 ? useful.slice(0, 120) : "";
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function normalize(text: string) {
  return text.toLocaleLowerCase("tr-TR").replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
