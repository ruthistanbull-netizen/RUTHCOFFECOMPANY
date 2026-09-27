import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getStoreDesignV2Published } from "@/data/site";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELD_TYPES = new Set(["text", "email", "tel", "textarea", "select", "checkbox"]);
const ACTIONS = new Set(["store"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function ipHash(request: Request) {
  const salt = process.env.STOREFRONT_PUBLIC_FORM_IP_HASH_SALT
    || process.env.CONTACT_IP_HASH_SALT
    || "storefront-public-form-rate-v1";
  return crypto.createHash("sha256").update(`${salt}|${clientIp(request)}`).digest("hex");
}

function selectOptions(value: unknown) {
  return clean(value, 3000)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

async function rateLimited(hash: string) {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("storefront_public_submission_attempts")
    .select("id", { count: "exact", head: true })
    .eq("kind", "custom-form")
    .eq("ip_hash", hash)
    .gte("created_at", since);

  if (error) throw error;
  if ((count || 0) >= 12) return true;

  const { error: insertError } = await supabase
    .from("storefront_public_submission_attempts")
    .insert({ kind: "custom-form", ip_hash: hash });
  if (insertError) throw insertError;
  return false;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 30_000) {
    return NextResponse.json({ ok: false, error: "Form verisi çok büyük." }, { status: 413 });
  }

  const body = await request.json().catch(() => ({}));
  if (clean(body.company, 120)) {
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }

  const sectionId = clean(body.sectionId, 160);
  const action = clean(body.action, 40) || "store";
  const rawValues = body.values && typeof body.values === "object" && !Array.isArray(body.values)
    ? body.values as Record<string, unknown>
    : {};

  if (!sectionId) {
    return NextResponse.json({ ok: false, error: "Form bölümü bulunamadı." }, { status: 400 });
  }
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "Bu form action'ı desteklenmiyor." }, { status: 400 });
  }

  const document = await getStoreDesignV2Published();
  const section = document.sections[sectionId];
  if (!section || section.type !== "custom-form" || !section.enabled) {
    return NextResponse.json({ ok: false, error: "Form bölümü aktif değil." }, { status: 404 });
  }
  if (String(section.settings?.action || "store") !== action) {
    return NextResponse.json({ ok: false, error: "Form action eşleşmedi." }, { status: 400 });
  }

  const schema = (section.blockIds || [])
    .map((id) => document.blocks[id])
    .filter((block) => block?.type === "field")
    .slice(0, 20)
    .map((block) => ({
      id: block!.id,
      name: clean(block!.settings?.name, 40),
      label: clean(block!.settings?.label, 120),
      type: clean(block!.settings?.type, 30) || "text",
      required: block!.settings?.required === true,
      options: selectOptions(block!.settings?.options),
    }));

  if (!schema.length) {
    return NextResponse.json({ ok: false, error: "Form şeması boş." }, { status: 409 });
  }

  const known = new Set<string>();
  for (const field of schema) {
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(field.name) || !field.label || !FIELD_TYPES.has(field.type) || known.has(field.name)) {
      return NextResponse.json({ ok: false, error: "Form şeması geçersiz." }, { status: 409 });
    }
    known.add(field.name);
    if (field.type === "select" && !field.options.length) {
      return NextResponse.json({ ok: false, error: "Form seçim alanı yapılandırılmamış." }, { status: 409 });
    }
  }

  for (const key of Object.keys(rawValues)) {
    if (!known.has(key)) {
      return NextResponse.json({ ok: false, error: "Formda tanımlı olmayan bir alan gönderildi." }, { status: 400 });
    }
  }

  const normalized: Record<string, string | boolean> = {};
  for (const field of schema) {
    const raw = rawValues[field.name];
    if (field.type === "checkbox") {
      const value = raw === true;
      if (field.required && !value) {
        return NextResponse.json({ ok: false, error: `${field.label} alanı zorunludur.` }, { status: 400 });
      }
      normalized[field.name] = value;
      continue;
    }

    const max = field.type === "textarea" ? 4000 : field.type === "tel" ? 40 : 500;
    const value = clean(raw, max);
    if (field.required && !value) {
      return NextResponse.json({ ok: false, error: `${field.label} alanı zorunludur.` }, { status: 400 });
    }
    if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return NextResponse.json({ ok: false, error: `${field.label} için geçerli bir e-posta adresi gerekli.` }, { status: 400 });
    }
    if (field.type === "select" && value && !field.options.includes(value)) {
      return NextResponse.json({ ok: false, error: `${field.label} için geçersiz seçim.` }, { status: 400 });
    }
    normalized[field.name] = value;
  }

  try {
    const hash = ipHash(request);
    if (await rateLimited(hash)) {
      return NextResponse.json({ ok: false, error: "Çok fazla form gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin." }, { status: 429 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("storefront_form_submissions")
      .insert({
        section_id: sectionId,
        action,
        payload: normalized,
        schema_snapshot: schema.map(({ id, name, label, type, required, options }) => ({ id, name, label, type, required, options })),
        ip_hash: hash,
        user_agent: clean(request.headers.get("user-agent"), 500),
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, submissionId: data?.id || null }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Store Design custom form could not be saved", error);
    return NextResponse.json({ ok: false, error: "Formunuz şu anda gönderilemedi. Lütfen daha sonra tekrar deneyin." }, { status: 500 });
  }
}
