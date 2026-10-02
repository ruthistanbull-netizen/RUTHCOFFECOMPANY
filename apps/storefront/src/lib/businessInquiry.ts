export const BUSINESS_TYPES = ["Kafe", "Restoran", "Otel", "Ofis", "Diğer"] as const;
export const STUDIO_SERVICES = [
  "Menü Geliştirme & Kurgu", "Reçete & Ürün Geliştirme",
  "Maliyetlendirme & Fiyatlandırma", "Bar Kurulumu", "Kahve Programı",
  "Operasyon & İş Akışı", "Personel Eğitimi", "Ekipman Danışmanlığı",
  "Marka & Konsept Geliştirme", "Açılış & Yeniden Yapılandırma",
] as const;
export const USAGE_AREAS = ["Espresso", "Filtre", "Her ikisi"] as const;
export const TIME_SLOTS = ["09:00 - 10:00", "11:00 - 12:00", "13:00 - 14:00", "15:00 - 16:00", "17:00 - 18:00"] as const;
export const MEETING_PREFERENCES = [
  { value: "phone", label: "Telefon" },
  { value: "online", label: "Online görüşme" },
  { value: "in_person", label: "Yüz yüze" },
] as const;
export type BusinessContext = "studio" | "wholesale";
export type BusinessInquiry = {
  context: BusinessContext;
  businessName: string; contactName: string; email: string; phone: string;
  businessType: string; city: string; website: string; needs: string;
  services: string[]; monthlyKg: string; usage: string; cupping: boolean;
  date: string; time: string; meeting: string; address: string;
};
export type InquiryErrors = Partial<Record<keyof BusinessInquiry, string>>;

export function initialBusinessInquiry(context: BusinessContext): BusinessInquiry {
  return { context, businessName: "", contactName: "", email: "", phone: "", businessType: "", city: "", website: "", needs: "", services: [], monthlyKg: "", usage: "", cupping: false, date: "", time: "", meeting: "", address: "" };
}

/** Appointment preferences are interpreted in the business's Istanbul timezone. */
export function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parseBusinessDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function formatBusinessDate(value: string) {
  const date = parseBusinessDate(value);
  return date ? new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric", weekday: "long" }).format(date) : "";
}

export function slotIsPast(date: string, slot: string, now = new Date()) {
  const today = businessToday(now);
  if (!date || date > today) return false;
  if (date < today) return true;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find(p => p.type === "hour")?.value);
  const minute = Number(parts.find(p => p.type === "minute")?.value);
  const [slotHour, slotMinute] = slot.slice(0, 5).split(":").map(Number);
  return slotHour * 60 + slotMinute <= hour * 60 + minute;
}

export function normalizeBusinessInquiry(input: unknown): BusinessInquiry {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const text = (key: string) => typeof source[key] === "string" ? source[key].trim() : "";
  const line = (key: string) => text(key).replace(/[\r\n\t]+/g, " ");
  return {
    context: source.context as BusinessContext,
    businessName: line("businessName"), contactName: line("contactName"),
    email: line("email").toLowerCase(), phone: line("phone"),
    businessType: line("businessType"), city: line("city"), website: line("website"),
    needs: text("needs"), services: Array.isArray(source.services) ? [...new Set(source.services.filter((s): s is string => typeof s === "string"))] : [],
    monthlyKg: line("monthlyKg"), usage: line("usage"), cupping: source.cupping === true,
    date: line("date"), time: line("time"), meeting: line("meeting"), address: text("address"),
  };
}

export function validateBusinessInquiry(form: BusinessInquiry, now = new Date()): InquiryErrors {
  const errors: InquiryErrors = {};
  if (!["studio", "wholesale"].includes(form.context)) errors.context = "Talep türü geçerli değil.";
  for (const key of ["businessName", "contactName", "city"] as const) {
    if (form[key].trim().length < 2) errors[key] = "Bu alanı en az 2 karakterle doldur.";
    else if (form[key].length > 120) errors[key] = "En fazla 120 karakter yazabilirsin.";
  }
  if (form.email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Geçerli bir e-posta adresi yaz.";
  const phoneDigits = form.phone.replace(/\D/g, "");
  if (form.phone.length > 40 || !/^[+\d\s().-]+$/.test(form.phone) || phoneDigits.length < 7 || phoneDigits.length > 15) errors.phone = "Geçerli bir telefon numarası yaz.";
  if (!(BUSINESS_TYPES as readonly string[]).includes(form.businessType)) errors.businessType = "İşletme türünü seç.";
  if (form.website.length > 240) errors.website = "En fazla 240 karakter yazabilirsin.";
  if (form.needs.trim().length < 10) errors.needs = "İhtiyaçlarını en az 10 karakterle anlat.";
  else if (form.needs.length > 1800) errors.needs = "En fazla 1800 karakter yazabilirsin.";
  if (form.context === "studio" && (!form.services.length || form.services.some(s => !(STUDIO_SERVICES as readonly string[]).includes(s)))) errors.services = "En az bir hizmet seç.";
  if (form.context === "wholesale") {
    if (!form.monthlyKg || !Number.isFinite(Number(form.monthlyKg)) || Number(form.monthlyKg) <= 0 || form.monthlyKg.length > 12) errors.monthlyKg = "Sıfırdan büyük bir miktar yaz.";
    if (!(USAGE_AREAS as readonly string[]).includes(form.usage)) errors.usage = "Kullanım alanını seç.";
  }
  if (!parseBusinessDate(form.date) || form.date < businessToday(now)) errors.date = "Bugün veya ileri bir tarih seç.";
  if (!(TIME_SLOTS as readonly string[]).includes(form.time) || slotIsPast(form.date, form.time, now)) errors.time = "Gelecek bir saat aralığı seç.";
  if (!MEETING_PREFERENCES.some(p => p.value === form.meeting)) errors.meeting = "Görüşme tercihini seç.";
  if (form.meeting === "in_person") {
    if (form.address.trim().length < 10) errors.address = "İlçe ve şehir bilgileriyle açık adresini yaz.";
    else if (form.address.length > 600) errors.address = "En fazla 600 karakter yazabilirsin.";
  }
  return errors;
}

export function businessInquiryMessage(form: BusinessInquiry) {
  const lines = [
    `${form.context === "studio" ? "ROSTA.Studio" : "Toptan Kahve"} — Görüşme talebi`, "",
    `İşletme: ${form.businessName}`, `İşletme türü: ${form.businessType}`, `Şehir / İlçe: ${form.city}`,
  ];
  if (form.website) lines.push(`Website / Instagram: ${form.website}`);
  lines.push("", "İHTİYAÇLAR", form.needs);
  if (form.context === "studio") lines.push("", `Hizmetler: ${form.services.join("; ")}`);
  else lines.push("", `Tahmini aylık kahve ihtiyacı: ${form.monthlyKg} kg`, `Kullanım alanı: ${form.usage}`, `Cupping talebi: ${form.cupping ? "Evet" : "Hayır"}`);
  lines.push("", "GÖRÜŞME TALEBİ", `Tercih edilen tarih: ${formatBusinessDate(form.date)}`, `Saat: ${form.time} (Türkiye saati)`, `Görüşme tercihi: ${MEETING_PREFERENCES.find(p => p.value === form.meeting)?.label}`);
  if (form.meeting === "in_person") lines.push(`Görüşme adresi: ${form.address}`);
  lines.push("", "Görüşme tarihi ve saati müşteriyle iletişime geçilerek netleştirilecek.");
  return lines.join("\n");
}
