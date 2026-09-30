import { NextResponse } from "next/server";
import { resolveInformationSections } from "@ruth-commerce/commerce-core/product-information";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const KEY = "product_field_options_v1";
const FIELDS = ["material", "finish_color", "size_usage", "care_advice"] as const;
type FieldKey = (typeof FIELDS)[number];

type FieldOption = {
  id: string;
  label: string;
  value: string;
  originalValue?: string;
};

type FieldGroup = {
  field: FieldKey;
  title: string;
  template: boolean;
  options: FieldOption[];
};

type MainOptionValue = {
  id: string;
  label: string;
  color?: string;
};

type MainOptionGroup = {
  id: string;
  name: string;
  displayType: "list" | "color";
  values: MainOptionValue[];
};

const DEFAULT_GROUPS: FieldGroup[] = [
  {
    field: "material",
    title: "Kahve Türü",
    template: false,
    options: [
      { id: "arabica", label: "Arabica", value: "Arabica" },
      { id: "robusta", label: "Robusta", value: "Robusta" },
      { id: "blend", label: "Arabica + Robusta Blend", value: "Arabica + Robusta Blend" },
      { id: "decaf", label: "Kafeinsiz", value: "Kafeinsiz" },
    ],
  },
  {
    field: "finish_color",
    title: "Kavrum Profili",
    template: false,
    options: [
      { id: "acik", label: "Açık Kavrum", value: "Açık Kavrum" },
      { id: "orta", label: "Orta Kavrum", value: "Orta Kavrum" },
      { id: "koyu", label: "Koyu Kavrum", value: "Koyu Kavrum" },
      { id: "espresso", label: "Espresso Kavrum", value: "Espresso Kavrum" },
    ],
  },
  {
    field: "size_usage",
    title: "Paket / Gramaj",
    template: false,
    options: [
      { id: "250g", label: "250 g", value: "250 g" },
      { id: "500g", label: "500 g", value: "500 g" },
      { id: "1kg", label: "1 kg", value: "1 kg" },
    ],
  },
  {
    field: "care_advice",
    title: "Bakım Önerisi Şablonu",
    template: true,
    options: [
      {
        id: "standart-saklama",
        label: "Standart kahve saklama önerisi",
        value: "Serin, kuru ve güneş almayan bir yerde; paketi hava almayacak şekilde kapalı saklayın.",
      },
      {
        id: "tazelik",
        label: "Tazelik önerisi",
        value: "En iyi aroma için açıldıktan sonra kısa sürede tüketin ve nemden uzak tutun.",
      },
      {
        id: "ogutme",
        label: "Öğütme önerisi",
        value: "Demlemeden hemen önce öğütmek aromayı daha iyi korur.",
      },
    ],
  },
];

function clean(value: unknown, max = 2400) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeId(value: unknown, fallback: string) {
  const raw = clean(value, 100)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || fallback;
}

function normalizeGroups(input: unknown): FieldGroup[] {
  const source = input && typeof input === "object" && Array.isArray((input as { groups?: unknown }).groups)
    ? (input as { groups: unknown[] }).groups
    : [];

  return DEFAULT_GROUPS.map((fallback) => {
    const candidate = source.find((item) =>
      item && typeof item === "object" && (item as Record<string, unknown>).field === fallback.field
    ) as Record<string, unknown> | undefined;

    if (!candidate || !Array.isArray(candidate.options)) {
      return {
        ...fallback,
        options: fallback.options.map((option) => ({ ...option, originalValue: option.value })),
      };
    }

    const seen = new Set<string>();
    const options = candidate.options.flatMap((item, index) => {
      const row: Record<string, unknown> = item && typeof item === "object"
        ? item as Record<string, unknown>
        : {};
      const value = clean(row.value, fallback.template ? 2400 : 180);
      const label = clean(row.label, 100) || value;
      if (!value) return [];
      const key = value.toLocaleLowerCase("tr-TR");
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        id: clean(row.id, 100) || safeId(label, `${fallback.field}-${index + 1}`),
        label,
        value,
        originalValue: clean(row.originalValue, fallback.template ? 2400 : 180) || value,
      }];
    });

    return {
      field: fallback.field,
      title: fallback.title,
      template: fallback.template,
      options,
    };
  });
}

function normalizeMainGroups(input: unknown): MainOptionGroup[] {
  const source = input && typeof input === "object" && Array.isArray((input as { mainGroups?: unknown }).mainGroups)
    ? (input as { mainGroups: unknown[] }).mainGroups
    : [];

  const seenGroups = new Set<string>();
  return source.flatMap((item, groupIndex) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const name = clean(row.name, 100);
    if (!name) return [];
    const groupKey = name.toLocaleLowerCase("tr-TR");
    if (seenGroups.has(groupKey)) return [];
    seenGroups.add(groupKey);

    const displayType = clean(row.displayType, 20) === "color" ? "color" : "list";
    const sourceValues = Array.isArray(row.values) ? row.values : [];
    const seenValues = new Set<string>();
    const values = sourceValues.flatMap((valueItem, valueIndex) => {
      const valueRow = valueItem && typeof valueItem === "object" ? valueItem as Record<string, unknown> : {};
      const label = clean(valueRow.label, 100);
      if (!label) return [];
      const valueKey = label.toLocaleLowerCase("tr-TR");
      if (seenValues.has(valueKey)) return [];
      seenValues.add(valueKey);
      const rawColor = clean(valueRow.color, 16);
      const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : undefined;
      return [{
        id: clean(valueRow.id, 100) || safeId(label, `main-value-${groupIndex + 1}-${valueIndex + 1}`),
        label,
        ...(displayType === "color" && color ? { color } : {}),
      }];
    });

    return [{
      id: clean(row.id, 100) || safeId(name, `main-group-${groupIndex + 1}`),
      name,
      displayType,
      values,
    }];
  });
}

function bootstrapMainGroups(variants: Array<Record<string, unknown>>): MainOptionGroup[] {
  const groups = new Map<string, MainOptionGroup>();

  for (const variant of variants) {
    const options = variant.options && typeof variant.options === "object"
      ? variant.options as Record<string, unknown>
      : {};
    const displayType = clean(options.__displayType, 20) === "color" ? "color" : "list";
    const rawColor = clean(options.__colorValue, 16);
    const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : undefined;

    for (const [nameKey, rawValue] of Object.entries(options)) {
      if (nameKey.startsWith("__")) continue;
      const name = clean(nameKey, 100);
      const label = clean(rawValue, 100);
      if (!name || !label) continue;

      const mapKey = name.toLocaleLowerCase("tr-TR");
      let group = groups.get(mapKey);
      if (!group) {
        group = {
          id: safeId(name, `main-group-${groups.size + 1}`),
          name,
          displayType,
          values: [],
        };
        groups.set(mapKey, group);
      } else if (displayType === "color") {
        group.displayType = "color";
      }

      const valueKey = label.toLocaleLowerCase("tr-TR");
      if (group.values.some((value) => value.label.toLocaleLowerCase("tr-TR") === valueKey)) continue;
      group.values.push({
        id: safeId(label, `${group.id}-value-${group.values.length + 1}`),
        label,
        ...(group.displayType === "color" && color ? { color } : {}),
      });
    }
  }

  return [...groups.values()];
}

function mergeCurrentProductValues(groups: FieldGroup[], products: Array<Record<string, unknown>>) {
  return groups.map((group) => {
    const next = group.options.map((option) => ({ ...option }));
    const seen = new Set(next.map((option) => option.value.toLocaleLowerCase("tr-TR")));

    for (const product of products) {
      const value = clean(product[group.field], group.template ? 2400 : 180);
      if (!value) continue;
      const key = value.toLocaleLowerCase("tr-TR");
      if (seen.has(key)) continue;
      seen.add(key);
      next.push({
        id: safeId(value, `${group.field}-${next.length + 1}`),
        label: group.template && value.length > 64 ? `Mevcut şablon ${next.length + 1}` : value,
        value,
        originalValue: value,
      });
    }

    return { ...group, options: next };
  });
}

async function migrateProductField(
  supabase: any,
  field: FieldKey,
  from: string,
  to: string,
  updatedAt: string,
) {
  if (field === "material") {
    return supabase.from("products").update({ material: to, updated_at: updatedAt }).eq("material", from);
  }
  if (field === "finish_color") {
    return supabase.from("products").update({ finish_color: to, updated_at: updatedAt }).eq("finish_color", from);
  }
  if (field === "size_usage") {
    return supabase.from("products").update({ size_usage: to, updated_at: updatedAt }).eq("size_usage", from);
  }
  return supabase.from("products").update({ care_advice: to, updated_at: updatedAt }).eq("care_advice", from);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const [
    { data: saved, error: savedError },
    { data: products, error: productsError },
    { data: variantRows, error: variantsError },
  ] = await Promise.all([
    auth.supabase
      .from("site_settings")
      .select("setting_value,updated_at")
      .eq("setting_key", KEY)
      .maybeSingle(),
    auth.supabase
      .from("products")
      .select("material,finish_color,size_usage,care_advice")
      .limit(5000),
    auth.supabase
      .from("product_variants")
      .select("options")
      .limit(10000),
  ]);

  if (savedError || productsError || variantsError) {
    return NextResponse.json(
      {
        ok: false,
        error: savedError?.message || productsError?.message || variantsError?.message || "Ürün seçenekleri okunamadı.",
      },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const baseGroups = normalizeGroups(saved?.setting_value);
  const groups = saved?.setting_value
    ? baseGroups
    : mergeCurrentProductValues(
        baseGroups,
        (products || []) as Array<Record<string, unknown>>,
      );

  const savedValue = saved?.setting_value && typeof saved.setting_value === "object"
    ? saved.setting_value as Record<string, unknown>
    : null;
  const hasSavedMainGroups = Boolean(savedValue && Array.isArray(savedValue.mainGroups));
  const mainGroups = hasSavedMainGroups
    ? normalizeMainGroups(savedValue)
    : bootstrapMainGroups((variantRows || []) as Array<Record<string, unknown>>);

  const sections = resolveInformationSections(savedValue?.sections, groups);

  return NextResponse.json(
    {
      ok: true,
      groups,
      mainGroups,
      sections,
      updatedAt: saved?.updated_at || null,
      source: saved?.setting_value ? "saved-library" : "bootstrap-from-products",
    },
    { headers: noStoreHeaders() },
  );
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const { data: previous, error: previousError } = await auth.supabase.from("site_settings").select("setting_value").eq("setting_key", KEY).maybeSingle();
  if (previousError) return NextResponse.json({ ok: false, error: previousError.message }, { status: 400, headers: noStoreHeaders() });
  const groups = normalizeGroups({ groups: body?.groups });
  const sections = resolveInformationSections(body?.sections ?? previous?.setting_value?.sections, groups);
  const mainGroups = normalizeMainGroups({ mainGroups: body?.mainGroups || previous?.setting_value?.mainGroups });
  const now = new Date().toISOString();

  for (const group of groups) {
    for (const option of group.options) {
      const from = clean(option.originalValue, group.template ? 2400 : 180);
      const to = clean(option.value, group.template ? 2400 : 180);
      if (!from || !to || from === to) continue;

      const { error: migrateError } = await migrateProductField(
        auth.supabase,
        group.field,
        from,
        to,
        now,
      );

      if (migrateError) {
        return NextResponse.json(
          { ok: false, error: `${group.title} güncellenemedi: ${migrateError.message}` },
          { status: 400, headers: noStoreHeaders() },
        );
      }
      option.originalValue = to;
    }
  }

  const storedGroups = groups.map((group) => ({
    ...group,
    options: group.options.map(({ originalValue: _originalValue, ...option }) => option),
  }));

  const { error } = await auth.supabase
    .from("site_settings")
    .upsert(
      {
        setting_key: KEY,
        setting_value: { version: 3, groups: storedGroups, ...(Array.isArray(body?.mainGroups) || Array.isArray(previous?.setting_value?.mainGroups) ? { mainGroups } : {}), sections },
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

  const revalidate = await revalidateWebsite({ source: "admin-product-field-options" });
  return NextResponse.json(
    {
      ok: true,
      groups: groups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({ ...option, originalValue: option.value })),
      })),
      mainGroups,
      sections,
      updatedAt: now,
      revalidate,
      warning: revalidate.ok ? null : revalidate.message,
    },
    { headers: noStoreHeaders() },
  );
}
