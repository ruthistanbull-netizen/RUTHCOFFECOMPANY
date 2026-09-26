import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import {
  createEmptyThemeDocument,
  normalizeThemeDocument,
  STORE_DESIGN_SCHEMA_VERSION,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRAFT_KEY = "store_design_v2_draft";
const PUBLISHED_KEY = "store_design_v2_published";

function nextRevision(document: ThemeDocument, current: ThemeDocument | null) {
  return Math.max(document.revision, current?.revision || 0) + 1;
}

async function readDocument(
  supabase: Awaited<ReturnType<typeof requireAdmin>> extends { supabase: infer T } ? T : never,
  key: string,
) {
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

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const mode = body?.mode === "publish" ? "publish" : "draft";
  const incoming = normalizeThemeDocument(body?.document);
  const key = mode === "publish" ? PUBLISHED_KEY : DRAFT_KEY;

  try {
    const current = await readDocument(auth.supabase, key);
    const now = new Date().toISOString();
    const document: ThemeDocument = {
      ...incoming,
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
