import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getStoreDesignV2Published } from "@/data/site";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function rateLimited(kind: "newsletter", hash: string) {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("storefront_public_submission_attempts")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("ip_hash", hash)
    .gte("created_at", since);

  if (error) throw error;
  if ((count || 0) >= 8) return true;

  const { error: insertError } = await supabase
    .from("storefront_public_submission_attempts")
    .insert({ kind, ip_hash: hash });
  if (insertError) throw insertError;
  return false;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 10_000) {
    return NextResponse.json({ ok: false, error: "İstek çok büyük." }, { status: 413 });
  }

  const body = await request.json().catch(() => ({}));
  if (clean(body.company, 120)) {
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }

  const sectionId = clean(body.sectionId, 160);
  const email = clean(body.email, 180).toLowerCase();
  const consent = body.consent === true;

  if (!sectionId) {
    return NextResponse.json({ ok: false, error: "Newsletter bölümü bulunamadı." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Geçerli bir e-posta adresi gerekli." }, { status: 400 });
  }
  if (!consent) {
    return NextResponse.json({ ok: false, error: "E-posta iletişimi onayı gerekli." }, { status: 400 });
  }

  const document = await getStoreDesignV2Published();
  const section = document.sections[sectionId];
  if (!section || section.type !== "newsletter" || !section.enabled) {
    return NextResponse.json({ ok: false, error: "Newsletter bölümü aktif değil." }, { status: 404 });
  }

  const consentCopy = clean(section.settings?.consent, 1000);
  if (!consentCopy) {
    return NextResponse.json({ ok: false, error: "Newsletter consent metni yapılandırılmamış." }, { status: 409 });
  }

  try {
    const hash = ipHash(request);
    if (await rateLimited("newsletter", hash)) {
      return NextResponse.json({ ok: false, error: "Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin." }, { status: 429 });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("newsletter_subscribers")
      .upsert({
        email,
        status: "subscribed",
        consent_granted: true,
        consent_copy: consentCopy,
        consent_at: now,
        source: "store-design-newsletter",
        source_section_id: sectionId,
        ip_hash: hash,
        user_agent: clean(request.headers.get("user-agent"), 500),
        updated_at: now,
      }, { onConflict: "email" });

    if (error) throw error;
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Newsletter subscription could not be saved", error);
    return NextResponse.json({ ok: false, error: "Kaydınız şu anda tamamlanamadı. Lütfen daha sonra tekrar deneyin." }, { status: 500 });
  }
}
