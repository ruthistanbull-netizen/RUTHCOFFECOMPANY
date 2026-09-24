import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  buildMarketingEmailHtml,
  readyEmailTemplates,
  type EmailTemplateDefinition,
  type EmailTemplateFields,
} from "@/lib/emailTemplates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TemplateType = "campaign" | "service" | "automation";
type TemplateRow = {
  id: string;
  template_key: string;
  name: string;
  subject: string;
  html: string;
  is_active: boolean;
  updated_at: string | null;
};
type TemplatePayload = {
  id?: unknown;
  template_key?: unknown;
  name?: unknown;
  type?: unknown;
  subject?: unknown;
  preheader?: unknown;
  body?: unknown;
  html?: unknown;
  enabled?: unknown;
  fields?: unknown;
};

const fieldMarker = /^<!--(?:ROSTA|RUTH)_TEMPLATE_FIELDS:([A-Za-z0-9_-]+)-->/;
const emptyFields: EmailTemplateFields = {
  subject: "",
  preheader: "",
  headline: "",
  intro: "",
  offer: "",
  buttonLabel: "ROSTA Coffee Co.'yu Keşfet",
  buttonUrl: "https://rostacoffecompany.zeabur.app",
  note: "",
  heroImageUrl: "",
  logoUrl: "",
};

function clean(value: unknown, max = 20_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function slug(value: unknown) {
  return clean(value, 120)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value, 40));
}

function templateType(categoryOrKey: string): TemplateType {
  const value = categoryOrKey.toLocaleLowerCase("tr-TR");
  if (value.includes("otomasyon") || value.includes("abandoned") || value.includes("review")) return "automation";
  if (value.includes("hizmet") || value.includes("müşteri") || value.includes("order_")) return "service";
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
    buttonLabel: clean(source.buttonLabel, 120) || fallback?.buttonLabel || emptyFields.buttonLabel,
    buttonUrl: clean(source.buttonUrl, 2_000) || fallback?.buttonUrl || emptyFields.buttonUrl,
    note: clean(source.note, 4_000) || fallback?.note || "",
    heroImageUrl: clean(source.heroImageUrl, 4_000) || fallback?.heroImageUrl || "",
    logoUrl: clean(source.logoUrl, 4_000) || fallback?.logoUrl || "",
  };
}

function encodeFields(fields: EmailTemplateFields) {
  return Buffer.from(JSON.stringify(fields), "utf8").toString("base64url");
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

function readyToTemplate(definition: EmailTemplateDefinition) {
  const fields = normalizeFields(definition.fields);
  return {
    id: definition.key,
    template_key: definition.key,
    name: definition.title,
    type: templateType(definition.category),
    subject: fields.subject,
    preheader: fields.preheader,
    body: [fields.intro, fields.offer, fields.note].filter(Boolean).join("\n\n"),
    fields,
    html: buildMarketingEmailHtml(fields),
    enabled: true,
    updated_at: null,
    category: definition.category,
    description: definition.description,
  };
}

function rowToTemplate(row: TemplateRow) {
  const ready = readyEmailTemplates.find((definition) => definition.key === row.template_key);
  const fields = decodeFields(row.html)
    || normalizeFields(null, ready?.fields || {
      subject: row.subject,
      headline: row.name,
      intro: textFromHtml(row.html),
    });
  return {
    id: row.id,
    template_key: row.template_key,
    name: row.name,
    type: templateType(ready?.category || row.template_key),
    subject: row.subject || fields.subject,
    preheader: fields.preheader,
    body: [fields.intro, fields.offer, fields.note].filter(Boolean).join("\n\n"),
    fields,
    html: stripMarker(row.html),
    enabled: row.is_active,
    updated_at: row.updated_at,
    category: ready?.category || "Özel",
    description: ready?.description || "Panelden oluşturulan özel e-posta şablonu.",
  };
}

async function listTemplates(supabase: any) {
  const { data, error } = await supabase
    .from("email_templates")
    .select("id,template_key,name,subject,html,is_active,updated_at")
    .order("updated_at", { ascending: false });
  const rows = !error && Array.isArray(data) ? data as TemplateRow[] : [];
  const byKey = new Map(rows.map((row) => [row.template_key, rowToTemplate(row)]));
  for (const definition of readyEmailTemplates) {
    if (!byKey.has(definition.key)) byKey.set(definition.key, readyToTemplate(definition));
  }
  return [...byKey.values()];
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ ok: true, templates: await listTemplates(auth.supabase) }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

async function persist(request: Request, method: "POST" | "PUT") {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const payload = await request.json().catch(() => ({})) as TemplatePayload;
  const id = clean(payload.id, 80);
  const name = clean(payload.name, 160);
  const templateKey = slug(payload.template_key) || (!isUuid(id) ? slug(id) : "") || slug(name) || `custom_${Date.now()}`;
  const ready = readyEmailTemplates.find((definition) => definition.key === templateKey);
  const fields = normalizeFields(payload.fields, ready?.fields || {
    subject: clean(payload.subject, 300),
    preheader: clean(payload.preheader, 500),
    headline: name,
    intro: clean(payload.body, 20_000),
  });
  const subject = clean(payload.subject, 300) || fields.subject;
  const renderedHtml = payload.fields
    ? buildMarketingEmailHtml({ ...fields, subject })
    : clean(payload.html, 120_000) || buildMarketingEmailHtml({ ...fields, subject });
  const storedHtml = `<!--ROSTA_TEMPLATE_FIELDS:${encodeFields({ ...fields, subject })}-->\n${renderedHtml}`;

  if (!name || !subject || !renderedHtml) {
    return NextResponse.json({ ok: false, error: "Şablon adı, konu ve içerik zorunlu." }, { status: 400 });
  }

  const record = {
    template_key: templateKey,
    name,
    subject,
    html: storedHtml,
    is_active: payload.enabled !== false,
    updated_at: new Date().toISOString(),
  };

  const query = method === "PUT" && isUuid(id)
    ? auth.supabase
        .from("email_templates")
        .update(record)
        .eq("id", id)
        .select("id,template_key,name,subject,html,is_active,updated_at")
        .single()
    : auth.supabase
        .from("email_templates")
        .upsert(record, { onConflict: "template_key" })
        .select("id,template_key,name,subject,html,is_active,updated_at")
        .single();

  const { data, error } = await query;
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || "E-posta şablonu kaydedilemedi." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, template: rowToTemplate(data as TemplateRow) });
}

export async function POST(request: Request) {
  return persist(request, "POST");
}

export async function PUT(request: Request) {
  return persist(request, "PUT");
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id"), 80);
  if (!id) return NextResponse.json({ ok: false, error: "Şablon kimliği gerekli." }, { status: 400 });
  let query = auth.supabase.from("email_templates").delete();
  query = isUuid(id) ? query.eq("id", id) : query.eq("template_key", slug(id));
  const { error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
