import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/websiteRevalidate";
import {
  normalizeThemeDocument,
  validateThemeDocument,
  withThemeMediaUsageCounts,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DRAFT_KEY = "store_design_v2_draft";
const PUBLISHED_KEY = "store_design_v2_published";
const SNAPSHOT_PREFIX = "store_design_v2_snapshot_";
const MAX_SNAPSHOTS = 30;

function cleanSnapshotKey(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  return /^store_design_v2_snapshot_\d{1,20}$/.test(raw) ? raw : "";
}

function summary(key: string, value: unknown, updatedAt: string | null) {
  const document = normalizeThemeDocument(value);
  return {
    key,
    revision: document.revision,
    schemaVersion: document.schemaVersion,
    publishedAt: document.publishedAt,
    updatedAt,
    pageCount: Object.keys(document.pages).length,
    templateCount: Object.keys(document.templates).length,
    sectionCount: Object.keys(document.sections).length,
    mediaCount: Object.keys(document.media).length,
    redirectCount: document.redirects.length,
  };
}

async function readDocument(supabase: any, key: string): Promise<ThemeDocument | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.setting_value ? normalizeThemeDocument(data.setting_value) : null;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { data, error } = await auth.supabase
      .from("site_settings")
      .select("setting_key,setting_value,updated_at")
      .like("setting_key", `${SNAPSHOT_PREFIX}%`)
      .order("updated_at", { ascending: false })
      .limit(MAX_SNAPSHOTS);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      snapshots: (data || []).map((row) => summary(row.setting_key, row.setting_value, row.updated_at || null)),
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Tema snapshot geçmişi okunamadı." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const key = cleanSnapshotKey(body?.key);
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Geçerli snapshot anahtarı gerekli." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const [snapshot, draft, published] = await Promise.all([
      readDocument(auth.supabase, key),
      readDocument(auth.supabase, DRAFT_KEY),
      readDocument(auth.supabase, PUBLISHED_KEY),
    ]);

    if (!snapshot) {
      return NextResponse.json(
        { ok: false, error: "Snapshot bulunamadı." },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    const normalized = withThemeMediaUsageCounts(snapshot);
    const validation = validateThemeDocument(normalized);
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, error: validation.errors[0] || "Snapshot doğrulanamadı.", errors: validation.errors },
        { status: 422, headers: noStoreHeaders() },
      );
    }

    const now = new Date().toISOString();
    const restored: ThemeDocument = {
      ...normalized,
      revision: Math.max(normalized.revision, draft?.revision || 0, published?.revision || 0) + 1,
    };

    const { data, error } = await auth.supabase.from("site_settings").upsert({
      setting_key: DRAFT_KEY,
      setting_value: restored,
      is_public: false,
      updated_at: now,
    }, { onConflict: "setting_key" })
      .select("setting_value,updated_at")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      key,
      document: normalizeThemeDocument(data?.setting_value || restored),
      restoredAt: data?.updated_at || now,
      liveSiteChanged: false,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Snapshot taslağa geri yüklenemedi." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}
