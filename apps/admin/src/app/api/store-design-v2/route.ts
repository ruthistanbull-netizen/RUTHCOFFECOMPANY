import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import {
  createEmptyThemeDocument,
  flattenThemeRedirects,
  migrateThemeDocument,
  normalizeThemeDocument,
  STORE_DESIGN_SCHEMA_VERSION,
  validateThemeDocument,
  withThemeMediaUsageCounts,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRAFT_KEY = "store_design_v2_draft";
const PUBLISHED_KEY = "store_design_v2_published";
const PREVIEW_PREFIX = "store_design_v2_preview_";
const SNAPSHOT_PREFIX = "store_design_v2_snapshot_";
const MAX_PUBLISH_SNAPSHOTS = 30;

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
    document: data?.setting_value ? migrateThemeDocument(data.setting_value).document : null,
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

  const migration = migrateThemeDocument(body?.document);
  const normalizedDocument = withThemeMediaUsageCounts(migration.document);
  const validation = validateThemeDocument(normalizedDocument);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.errors[0] || "Önizleme dokümanı geçersiz.", errors: validation.errors },
      { status: 422, headers: noStoreHeaders() },
    );
  }
  const document: ThemeDocument = {
    ...normalizedDocument,
    redirects: flattenThemeRedirects(normalizedDocument.redirects),
  };
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
      migration: {
        fromVersion: migration.fromVersion,
        toVersion: migration.toVersion,
        changed: migration.changed,
        notes: migration.notes,
      },
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
  const migration = migrateThemeDocument(body?.document);
  const incoming = withThemeMediaUsageCounts(migration.document);
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
      redirects: flattenThemeRedirects(incoming.redirects),
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      revision: nextRevision(incoming, current.document),
      publishedAt: mode === "publish" ? now : incoming.publishedAt,
    };

    if (mode === "publish") {
      const snapshotKey = `${SNAPSHOT_PREFIX}${String(document.revision).padStart(12, "0")}`;
      const { data, error } = await auth.supabase.from("site_settings").upsert([
        {
          setting_key: PUBLISHED_KEY,
          setting_value: document,
          is_public: true,
          updated_at: now,
        },
        {
          setting_key: DRAFT_KEY,
          setting_value: document,
          is_public: false,
          updated_at: now,
        },
        {
          setting_key: snapshotKey,
          setting_value: document,
          is_public: false,
          updated_at: now,
        },
      ], { onConflict: "setting_key" })
        .select("setting_key,setting_value,updated_at");

      if (error) throw new Error(error.message);
      const publishedRow = data?.find((row) => row.setting_key === PUBLISHED_KEY);
      if (!publishedRow?.setting_value) {
        throw new Error("Yayın kaydı veritabanından doğrulanamadı; canlıya geçti bilgisi verilmiyor.");
      }

      // Verify an authoritative post-write read, not only the request payload.
      // A successful Storage upload alone does not mean the new section/slide
      // reference made it into the document the storefront actually reads.
      const verification = await auth.supabase.from("site_settings")
        .select("setting_value,is_public,updated_at")
        .eq("setting_key", PUBLISHED_KEY)
        .single();
      if (verification.error || !verification.data?.is_public) {
        throw new Error(verification.error?.message || "Yayınlanmış tema veritabanından okunamadı.");
      }
      const persisted = normalizeThemeDocument(verification.data.setting_value);
      const missingMedia = Object.entries(document.media)
        .filter(([id, asset]) => persisted.media[id]?.url !== asset.url)
        .map(([id]) => id);
      const missingSections = Object.entries(document.sections)
        .filter(([id, section]) => {
          const saved = persisted.sections[id];
          if (!saved) return true;
          const mediaFields = ["imageAssetId", "posterAssetId", "beforeAssetId", "afterAssetId"];
          return mediaFields.some((key) => section.settings?.[key] !== saved.settings?.[key]);
        })
        .map(([id]) => id);
      if (persisted.revision !== document.revision || missingMedia.length || missingSections.length) {
        throw new Error("Tema yayını doğrulanamadı: medya veya bölüm bağlantıları eksik. Lütfen yeniden dene.");
      }

      const revalidate = await revalidateWebsite({
        source: "admin-store-design-v2",
        scope: "theme",
        immediate: true,
        paths: ["/", "/studio", "/toptan-kahve", "/products", "/collections", "/categories", "/search"],
        tags: ["rosta-theme"],
      });

      // Snapshot retention is deliberately best-effort: a cleanup problem must
      // never turn a successful atomic publish into a failed publish response.
      try {
        const { data: staleSnapshots } = await auth.supabase
          .from("site_settings")
          .select("setting_key")
          .like("setting_key", `${SNAPSHOT_PREFIX}%`)
          .order("updated_at", { ascending: false })
          .range(MAX_PUBLISH_SNAPSHOTS, MAX_PUBLISH_SNAPSHOTS + 199);
        const staleKeys = (staleSnapshots || []).map((row) => row.setting_key).filter(Boolean);
        if (staleKeys.length) {
          await auth.supabase.from("site_settings").delete().in("setting_key", staleKeys);
        }
      } catch {
        // Retention cleanup is non-critical; the published snapshot is already durable.
      }

      return NextResponse.json({
        ok: true,
        mode,
        document: persisted,
        snapshotKey,
        persistedAt: verification.data.updated_at || publishedRow.updated_at || now,
        mediaVerified: {
          storedAssets: Object.keys(persisted.media).length,
          sectionCount: Object.keys(persisted.sections).length,
          referencesPersisted: true,
        },
        revalidate,
        migration: {
          fromVersion: migration.fromVersion,
          toVersion: migration.toVersion,
          changed: migration.changed,
          notes: migration.notes,
        },
      }, { headers: noStoreHeaders() });
    }

    const { data, error } = await auth.supabase.from("site_settings").upsert({
      setting_key: key,
      setting_value: document,
      is_public: false,
      updated_at: now,
    }, { onConflict: "setting_key" })
      .select("setting_value,updated_at")
      .single();

    if (error) throw new Error(error.message);
    const persisted = normalizeThemeDocument(data?.setting_value || document);

    return NextResponse.json({
      ok: true,
      mode,
      document: persisted,
      persistedAt: data?.updated_at || now,
      migration: {
        fromVersion: migration.fromVersion,
        toVersion: migration.toVersion,
        changed: migration.changed,
        notes: migration.notes,
      },
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Mağaza tasarımı kaydedilemedi." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}
