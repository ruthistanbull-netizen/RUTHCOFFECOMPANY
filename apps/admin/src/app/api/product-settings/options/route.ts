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

function normalizedKey(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "");
}

function color(value: unknown) {
  const raw = clean(value, 20);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : undefined;
}

function definitionsFromVariants(rows: Array<{ options?: unknown }>): OptionDefinition[] {
  const groups = new Map<string, OptionDefinition>();

  for (const row of rows) {
    const options = row?.options && typeof row.options === "object"
      ? row.options as Record<string, unknown>
      : {};
    const displayType = options.__displayType === "color" ? "color" : "list";
    const fallbackColor = color(options.__colorValue);

    for (const [rawName, rawValue] of Object.entries(options)) {
      if (rawName.startsWith("__")) continue;
      const name = clean(rawName, 80);
      const label = clean(rawValue, 100);
      if (!name || !label) continue;

      const groupId = safeId(name, `option-${groups.size + 1}`);
      const key = normalizedKey(name);
      const existing = groups.get(key) || {
        id: groupId,
        name,
        displayType,
        active: true,
        values: [],
      };
      if (displayType === "color") existing.displayType = "color";

      const valueId = safeId(`${groupId}-${label}`, `${groupId}-value-${existing.values.length + 1}`);
      if (!existing.values.some((item) => normalizedKey(item.label) === normalizedKey(label))) {
        existing.values.push({
          id: valueId,
          label,
          ...(existing.displayType === "color" ? { color: fallbackColor || "#111111" } : {}),
        });
      }
      groups.set(key, existing);
    }
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

function storedDefinitions(input: unknown): OptionDefinition[] {
  const raw = input && typeof input === "object" && Array.isArray((input as { definitions?: unknown }).definitions)
    ? (input as { definitions: unknown[] }).definitions
    : [];
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = clean(row.id, 100) || `option-${index + 1}`;
    const name = clean(row.name, 80);
    const displayType = row.displayType === "color" ? "color" : "list";
    const values = Array.isArray(row.values)
      ? row.values.flatMap((candidate, valueIndex) => {
          const valueRow: Record<string, unknown> = candidate && typeof candidate === "object"
            ? candidate as Record<string, unknown>
            : { label: candidate };
          const label = clean(valueRow.label, 100);
          if (!label) return [];
          return [{
            id: clean(valueRow.id, 100) || `${id}-value-${valueIndex + 1}`,
            label,
            ...(displayType === "color" ? { color: color(valueRow.color) || "#111111" } : {}),
          }];
        })
      : [];
    return [{ id, name, displayType, active: row.active !== false, values }];
  });
}

function overlaySavedPresentation(
  actual: OptionDefinition[],
  stored: OptionDefinition[],
): OptionDefinition[] {
  const byId = new Map(stored.map((group) => [group.id, group]));
  return actual.map((group) => {
    const saved = byId.get(group.id);
    if (!saved) return group;
    const savedValues = new Map(saved.values.map((value) => [value.id, value]));
    return {
      ...group,
      name: saved.name || group.name,
      displayType: saved.displayType || group.displayType,
      values: group.values.map((value) => {
        const savedValue = savedValues.get(value.id);
        return savedValue
          ? {
              ...value,
              label: savedValue.label || value.label,
              ...(saved.displayType === "color"
                ? { color: savedValue.color || value.color || "#111111" }
                : {}),
            }
          : value;
      }),
    };
  });
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const [{ data: variantRows, error: variantError }, { data: savedRow, error: savedError }] =
    await Promise.all([
      auth.supabase.from("product_variants").select("options").limit(5000),
      auth.supabase
        .from("site_settings")
        .select("setting_value,updated_at")
        .eq("setting_key", KEY)
        .maybeSingle(),
    ]);

  if (variantError) {
    return NextResponse.json(
      { ok: false, error: variantError.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }
  if (savedError) {
    return NextResponse.json(
      { ok: false, error: savedError.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const actual = definitionsFromVariants((variantRows || []) as Array<{ options?: unknown }>);
  const definitions = overlaySavedPresentation(
    actual,
    storedDefinitions(savedRow?.setting_value),
  );

  return NextResponse.json(
    {
      ok: true,
      definitions,
      updatedAt: savedRow?.updated_at || null,
      source: "product_variants",
    },
    { headers: noStoreHeaders() },
  );
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const requested = storedDefinitions({ definitions: body?.definitions });

  const { data: variantRows, error: variantError } = await auth.supabase
    .from("product_variants")
    .select("options")
    .limit(5000);

  if (variantError) {
    return NextResponse.json(
      { ok: false, error: variantError.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const actual = definitionsFromVariants((variantRows || []) as Array<{ options?: unknown }>);
  const actualIds = new Set(actual.map((group) => group.id));
  const definitions = requested.filter((group) => actualIds.has(group.id));

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("site_settings")
    .upsert(
      {
        setting_key: KEY,
        setting_value: { version: 3, definitions },
        is_public: false,
        updated_at: now,
      },
      { onConflict: "setting_key" },
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const revalidate = await revalidateWebsite({ source: "admin-product-option-definitions" });
  return NextResponse.json(
    {
      ok: true,
      definitions: overlaySavedPresentation(actual, definitions),
      updatedAt: now,
      revalidate,
      warning: revalidate.ok ? null : revalidate.message,
    },
    { headers: noStoreHeaders() },
  );
}
