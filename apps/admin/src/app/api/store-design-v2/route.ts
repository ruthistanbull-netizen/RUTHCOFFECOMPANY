import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import {
  createEmptyThemeDocument,
  normalizeThemeDocument,
  STORE_DESIGN_SCHEMA_VERSION,
  validateThemeDocument,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRAFT_KEY = "store_design_v2_draft";
const PUBLISHED_KEY = "store_design_v2_published";
const PREVIEW_PREFIX = "store_design_v2_preview_";

function cleanPreviewToken(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120)
    : "";
}

function nextRevision(document: ThemeDocument, current: ThemeDocument | null) {
  return Math.max(document.revision, current?.revision || 0) + 1;
}

async function readDocument(supabase: SupabaseClient, key: string) {
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_value,updated_at")
    .eq("setting_key", key)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return {
    document: data?.setting_value ? normalizeThemeDocument(data.setting_value) : null,
    updatedAt: data?.updated_at || null,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const [draft, published] = await Promise.all([
      readDocument(auth.supabase, DRAFT_KEY),
      readDocument(auth.supabase, PUBLISHED_KEY),
    ]);

    const fallback = published.document || createEmptyThemeDocument();
    return NextResponse.json({
      ok: true,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      draft: draft.document || fallback,
      published: published.document || fallback,
      draftUpdatedAt: draft.updatedAt,
      publishedUpdatedAt: published.updatedAt,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Mağaza tasarımı okunamadı." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const token = cleanPreviewToken(body?.token);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Önizleme tokenı gerekli." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const document = normalizeThemeDocument(body?.document);
  const validation = validateThemeDocument(document);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.errors[0] || "Önizleme dokümanı geçersiz.", errors: validation.errors },
      { status: 422, headers: noStoreHeaders() },
    );
  }
  const now = new Date().toISOString();

  try {
    const { data, error } = await auth.supabase.from("site_settings").upsert({
      setting_key: `${PREVIEW_PREFIX}${token}`,
      setting_value: document,
      is_public: false,
      updated_at: now,
    }, { onConflict: "setting_key" })
      .select("setting_key,updated_at")
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Önizleme taslağı doğrulanamadı.");

    return NextResponse.json({
      ok: true,
      token,
      revision: document.revision,
      persistedAt: data.updated_at || now,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Önizleme taslağı kaydedilemedi." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "publish" ? "publish" : "draft";
  const incoming = normalizeThemeDocument(body?.document);
  const validation = validateThemeDocument(incoming);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.errors[0] || "Mağaza tasarımı doğrulanamadı.", errors: validation.errors },
      { status: 422, headers: noStoreHeaders() },
    );
  }
  const key = mode === "publish" ? PUBLISHED_KEY : DRAFT_KEY;

  try {
    const current = await readDocument(auth.supabase, key);
    const now = new Date().toISOString();
    const pages = mode === "publish"
      ? Object.fromEntries(Object.entries(incoming.pages).map(([route, page]) => [
          route,
          page.status === "published"
            ? { ...page, publishedAt: page.publishedAt || now, updatedAt: now }
            : page,
        ]))
      : incoming.pages;

    const document: ThemeDocument = {
      ...incoming,
      pages,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      revision: nextRevision(incoming, current.document),
      publishedAt: mode === "publish" ? now : incoming.publishedAt,
    };

    const { data, error } = await auth.supabase.from("site_settings").upsert({
      setting_key: key,
      setting_value: document,
      is_public: mode === "publish",
      updated_at: now,
    }, { onConflict: "setting_key" })
      .select("setting_value,updated_at")
      .single();

    if (error) throw new Error(error.message);
    const persisted = normalizeThemeDocument(data?.setting_value || document);

    if (mode === "publish") {
      await auth.supabase.from("site_settings").upsert({
        setting_key: DRAFT_KEY,
        setting_value: persisted,
        is_public: false,
        updated_at: now,
      }, { onConflict: "setting_key" });

      const revalidate = await revalidateWebsite({
        source: "admin-store-design-v2",
        scope: "theme",
        paths: ["/", "/products", "/collections", "/categories", "/search"],
        tags: ["ruth-theme"],
      });

      return NextResponse.json({
        ok: true,
        mode,
        document: persisted,
        persistedAt: data?.updated_at || now,
        revalidate,
      }, { headers: noStoreHeaders() });
    }

    return NextResponse.json({
      ok: true,
      mode,
      document: persisted,
      persistedAt: data?.updated_at || now,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Mağaza tasarımı kaydedilemedi." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}
