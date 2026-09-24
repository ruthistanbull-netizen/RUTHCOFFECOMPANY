import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const KEY = "product_material_options";
const DEFAULT_OPTIONS = ["Arabica", "Robusta", "Arabica + Robusta Blend", "Kafeinsiz"];
const REQUIRED_OPTIONS = ["Arabica", "Robusta"];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMaterialName(value: unknown) {
  const text = clean(value);
  if (!text) return "";
  const normalized = text
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
  if (normalized === "arabica") return "Arabica";
  if (normalized === "robusta") return "Robusta";
  if (["arabica + robusta blend", "arabica robusta blend", "blend", "harman"].includes(normalized)) return "Arabica + Robusta Blend";
  if (["kafeinsiz", "decaf", "decaffeinated"].includes(normalized)) return "Kafeinsiz";
  return text;
}

function normalizeOptions(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as any).options)
      ? (value as any).options
      : [];

  const source = raw.length ? raw : DEFAULT_OPTIONS;
  const options: string[] = Array.from(
    new Set<string>(
      [...(source as unknown[]), ...REQUIRED_OPTIONS]
        .map((item: unknown) => normalizeMaterialName(item))
        .filter((item: string): item is string => item.length > 0),
    ),
  ).slice(0, 30);
  return options.length ? options : DEFAULT_OPTIONS;
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

  return NextResponse.json({ ok: true, options: normalizeOptions(data?.setting_value) }, { headers: noStoreHeaders() });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const options = normalizeOptions(body.options);
  const rawRenames = body.renames && typeof body.renames === "object" ? body.renames : {};
  const renames = Object.entries(rawRenames)
    .map(([from, to]) => [clean(from), normalizeMaterialName(to)] as const)
    .filter(([from, to]) => from && to && from !== to);

  for (const [from, to] of renames) {
    const { error: renameError } = await auth.supabase
      .from("products")
      .update({ material: to, updated_at: new Date().toISOString() })
      .eq("material", from);

    if (renameError) {
      return NextResponse.json({ ok: false, error: renameError.message }, { status: 400, headers: noStoreHeaders() });
    }
  }

  const { error } = await auth.supabase
    .from("site_settings")
    .upsert({
      setting_key: KEY,
      setting_value: { options },
      is_public: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const revalidate = await revalidateWebsite({ source: "admin-material-options" });
  return NextResponse.json({
    ok: true,
    options,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message,
  }, { headers: noStoreHeaders() });
}
