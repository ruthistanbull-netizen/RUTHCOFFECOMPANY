import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const KEY = "product_field_options_v1";
const DEFAULT_OPTIONS = ["Arabica", "Robusta", "Arabica + Robusta Blend", "Kafeinsiz"];

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeId(value: string, index: number) {
  const normalized = value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `material-${index + 1}`;
}

function normalizeOptions(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const options = [...new Set(source.map((item) => clean(item)).filter(Boolean))].slice(0, 30);
  return options.length ? options : DEFAULT_OPTIONS;
}

function readGroups(value: unknown) {
  if (!value || typeof value !== "object") return [] as Array<Record<string, unknown>>;
  const groups = (value as { groups?: unknown }).groups;
  return Array.isArray(groups)
    ? groups.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
}

function materialOptionsFromGroups(groups: Array<Record<string, unknown>>) {
  const material = groups.find((group) => group.field === "material");
  const options = Array.isArray(material?.options) ? material?.options : [];
  const values = options
    .map((item) => item && typeof item === "object" ? clean((item as Record<string, unknown>).value) : "")
    .filter(Boolean);
  return values.length ? values : DEFAULT_OPTIONS;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  return NextResponse.json(
    { ok: true, options: materialOptionsFromGroups(readGroups(data?.setting_value)) },
    { headers: noStoreHeaders() },
  );
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const options = normalizeOptions(body?.options);
  const rawRenames = body?.renames && typeof body.renames === "object" ? body.renames : {};
  const renames = Object.entries(rawRenames)
    .map(([from, to]) => [clean(from), clean(to)] as const)
    .filter(([from, to]) => from && to && from !== to);

  const now = new Date().toISOString();
  for (const [from, to] of renames) {
    const { error: renameError } = await auth.supabase
      .from("products")
      .update({ material: to, updated_at: now })
      .eq("material", from);

    if (renameError) {
      return NextResponse.json({ ok: false, error: renameError.message }, { status: 400, headers: noStoreHeaders() });
    }
  }

  const { data: existing, error: readError } = await auth.supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", KEY)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 400, headers: noStoreHeaders() });
  }

  const groups = readGroups(existing?.setting_value).filter((group) => group.field !== "material");
  groups.unshift({
    field: "material",
    title: "Kahve Türü",
    template: false,
    options: options.map((value, index) => ({
      id: safeId(value, index),
      label: value,
      value,
    })),
  });

  const { error } = await auth.supabase
    .from("site_settings")
    .upsert({
      setting_key: KEY,
      setting_value: { version: 1, groups },
      is_public: false,
      updated_at: now,
    }, { onConflict: "setting_key" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const revalidate = await revalidateWebsite({ source: "admin-material-options-compat" });
  return NextResponse.json({
    ok: true,
    options,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message,
  }, { headers: noStoreHeaders() });
}
