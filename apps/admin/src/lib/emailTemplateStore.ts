import { Buffer } from "node:buffer";
import {
  buildMarketingEmailHtml,
  readyEmailTemplates,
  type EmailTemplateFields,
} from "@/lib/emailTemplates";

export type ResolvedEmailTemplate = {
  key: string;
  title: string;
  type: "campaign" | "service" | "automation";
  category: string;
  description: string;
  fields: EmailTemplateFields;
  enabled: boolean;
};

type StoredTemplateRow = {
  template_key: string;
  name: string;
  subject: string;
  html: string;
  is_active: boolean;
};

const fieldMarker = /^<!--(?:ROSTA|RUTH)_TEMPLATE_FIELDS:([A-Za-z0-9_-]+)-->/;
const defaultSite = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_STORE_URL || "https://rostacoffecompany.zeabur.app";

function clean(value: unknown, max = 20_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function typeFromCategory(categoryOrKey: string): ResolvedEmailTemplate["type"] {
  const value = categoryOrKey.toLocaleLowerCase("tr-TR");
  if (value.includes("otomasyon") || value.includes("abandoned") || value.includes("review")) return "automation";
  if (value.includes("hizmet") || value.includes("müşteri") || value.includes("order_") || value.includes("account_") || value.includes("site_")) return "service";
  return "campaign";
}

function normalizeFields(value: unknown, fallback?: Partial<EmailTemplateFields>): EmailTemplateFields {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    subject: clean(source.subject, 300) || fallback?.subject || "",
    preheader: clean(source.preheader, 500) || fallback?.preheader || "",
    headline: clean(source.headline, 500) || fallback?.headline || "",
    intro: clean(source.intro, 8_000) || fallback?.intro || "",
    offer: clean(source.offer, 8_000) || fallback?.offer || "",
    buttonLabel: clean(source.buttonLabel, 120) || fallback?.buttonLabel || "ROSTA Coffee Co.'yu Keşfet",
    buttonUrl: clean(source.buttonUrl, 2_000) || fallback?.buttonUrl || defaultSite,
    note: clean(source.note, 4_000) || fallback?.note || "",
    heroImageUrl: clean(source.heroImageUrl, 4_000) || fallback?.heroImageUrl || "",
    logoUrl: clean(source.logoUrl, 4_000) || fallback?.logoUrl || "",
  };
}

function decodeFields(html: string) {
  const match = html.match(fieldMarker);
  if (!match?.[1]) return null;
  try {
    return normalizeFields(JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

function stripMarker(html: string) {
  return html.replace(fieldMarker, "").trimStart();
}

function textFromHtml(value: string) {
  return stripMarker(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12_000);
}

export async function resolveEmailTemplate(supabase: any, templateKey: string): Promise<ResolvedEmailTemplate | null> {
  const key = clean(templateKey, 100);
  if (!key) return null;

  const ready = readyEmailTemplates.find((definition) => definition.key === key);
  const { data, error } = await supabase
    .from("email_templates")
    .select("template_key,name,subject,html,is_active")
    .eq("template_key", key)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (data) {
    const row = data as StoredTemplateRow;
    const fields = decodeFields(row.html)
      || normalizeFields(null, ready?.fields || {
        subject: row.subject,
        headline: row.name,
        intro: textFromHtml(row.html),
      });
    fields.subject = row.subject || fields.subject;
    return {
      key: row.template_key,
      title: row.name,
      type: typeFromCategory(ready?.category || row.template_key),
      category: ready?.category || "Özel",
      description: ready?.description || "Şablonlar sayfasından yönetilen özel e-posta şablonu.",
      fields,
      enabled: row.is_active !== false,
    };
  }

  if (!ready) return null;
  return {
    key: ready.key,
    title: ready.title,
    type: typeFromCategory(ready.category),
    category: ready.category,
    description: ready.description,
    fields: normalizeFields(ready.fields),
    enabled: true,
  };
}

export function renderedTemplateHtml(template: ResolvedEmailTemplate) {
  return buildMarketingEmailHtml(template.fields);
}
