import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const KEY = "product_option_definitions_v1";

type OptionValue = {
  id: string;
  label: string;
  color?: string;
};

type OptionDefinition = {
  id: string;
  name: string;
  displayType: "list" | "color";
  active: boolean;
  values: OptionValue[];
};

const DEFAULT_DEFINITIONS: OptionDefinition[] = [
  {
    id: "gramaj",
    name: "Gramaj",
    displayType: "list",
    active: true,
    values: ["100 g", "250 g", "500 g", "1 kg"].map((label, index) => ({ id: `gramaj-${index + 1}`, label })),
  },
  {
    id: "ogutme-tipi",
    name: "Öğütme Tipi",
    displayType: "list",
    active: true,
    values: ["Çekirdek", "Espresso", "Moka Pot", "Filtre", "V60", "Chemex", "French Press"].map((label, index) => ({ id: `ogutme-${index + 1}`, label })),
  },
  {
    id: "kavrum",
    name: "Kavrum",
    displayType: "list",
    active: true,
    values: ["Açık", "Orta", "Koyu"].map((label, index) => ({ id: `kavrum-${index + 1}`, label })),
  },
];

function clean(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeId(value: unknown, fallback: string) {
  const raw = clean(value, 100)
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || fallback;
}

function color(value: unknown) {
  const raw = clean(value, 20);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : undefined;
}

function normalizeDefinitions(input: unknown): OptionDefinition[] {
  const raw = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { definitions?: unknown }).definitions)
      ? (input as { definitions: unknown[] }).definitions
      : [];

  const source = raw.length ? raw : DEFAULT_DEFINITIONS;
  const usedGroupIds = new Set<string>();

  return source.slice(0, 30).map((item, groupIndex) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const name = clean(row.name, 80) || `Seçenek ${groupIndex + 1}`;
    let id = safeId(row.id || name, `option-${groupIndex + 1}`);
    if (usedGroupIds.has(id)) id = `${id}-${groupIndex + 1}`;
    usedGroupIds.add(id);

    const displayType = row.displayType === "color" ? "color" : "list";
    const rawValues = Array.isArray(row.values) ? row.values : [];
    const usedValueIds = new Set<string>();
    const seenLabels = new Set<string>();
    const values: OptionValue[] = [];

    rawValues.slice(0, 80).forEach((candidate, valueIndex) => {
      const valueRow = candidate && typeof candidate === "object"
        ? candidate as Record<string, unknown>
        : { label: candidate };
      const label = clean(valueRow.label, 100);
      if (!label) return;
      const normalizedLabel = label.toLocaleLowerCase("tr-TR");
      if (seenLabels.has(normalizedLabel)) return;
      seenLabels.add(normalizedLabel);

      let valueId = safeId(valueRow.id || label, `${id}-value-${valueIndex + 1}`);
      if (usedValueIds.has(valueId)) valueId = `${valueId}-${valueIndex + 1}`;
      usedValueIds.add(valueId);
      const valueColor = displayType === "color" ? color(valueRow.color) || "#111111" : undefined;
      values.push({ id: valueId, label, ...(valueColor ? { color: valueColor } : {}) });
    });

    return {
      id,
      name,
      displayType,
      active: row.active !== false,
      values,
    };
  });
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_value,updated_at")
    .eq("setting_key", KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  return NextResponse.json({
    ok: true,
    definitions: normalizeDefinitions(data?.setting_value),
    updatedAt: data?.updated_at || null,
  }, { headers: noStoreHeaders() });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const definitions = normalizeDefinitions(body?.definitions);
  if (!definitions.length) {
    return NextResponse.json({ ok: false, error: "En az bir ürün seçeneği bırakmalısın." }, { status: 400, headers: noStoreHeaders() });
  }

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("site_settings")
    .upsert({
      setting_key: KEY,
      setting_value: { version: 1, definitions },
      is_public: false,
      updated_at: now,
    }, { onConflict: "setting_key" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const revalidate = await revalidateWebsite({ source: "admin-product-option-definitions" });
  return NextResponse.json({
    ok: true,
    definitions,
    updatedAt: now,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message,
  }, { headers: noStoreHeaders() });
}
