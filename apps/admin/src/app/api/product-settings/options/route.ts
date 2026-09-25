import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const OPTION_KEY = "product_option_definitions_v1";
const PRODUCT_PAGE_KEY = "product_page_content_v1";

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

type ProductPageContent = {
  materialTitle: string;
  materialFallback: string;
  careTitle: string;
  careFallback: string;
  sizeUsageTitle: string;
  sizeUsageFallback: string;
  shippingTitle: string;
  shippingText: string;
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

const DEFAULT_PRODUCT_PAGE: ProductPageContent = {
  materialTitle: "Ürün Bilgisi",
  materialFallback: "Çekirdek, içerik ve ürün bilgileri ürün bazında değişebilir.",
  careTitle: "Saklama / Kullanım",
  careFallback: "Paketi serin, kuru ve doğrudan güneş almayan yerde saklayın. Açıldıktan sonra aromasını korumak için ağzını sıkıca kapatın.",
  sizeUsageTitle: "Paket / Kullanım",
  sizeUsageFallback: "Paket, öğütüm ve kullanım bilgisi ürün bazında değişebilir.",
  shippingTitle: "Kargo ve İade",
  shippingText: "Sipariş hazırlık süresi ürün ve sipariş tipine göre değişebilir. Teslimat ve iade koşulları için güncel kargo ve iade politikasını inceleyebilirsiniz.",
};

function clean(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanLong(value: unknown, fallback: string, max = 2400) {
  const text = typeof value === "string" ? value.trim().slice(0, max) : "";
  return text || fallback;
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
      const valueRow: Record<string, unknown> = candidate && typeof candidate === "object"
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

function normalizeProductPage(input: unknown): ProductPageContent {
  const row = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    materialTitle: clean(row.materialTitle, 80) || DEFAULT_PRODUCT_PAGE.materialTitle,
    materialFallback: cleanLong(row.materialFallback, DEFAULT_PRODUCT_PAGE.materialFallback),
    careTitle: clean(row.careTitle, 80) || DEFAULT_PRODUCT_PAGE.careTitle,
    careFallback: cleanLong(row.careFallback, DEFAULT_PRODUCT_PAGE.careFallback),
    sizeUsageTitle: clean(row.sizeUsageTitle, 80) || DEFAULT_PRODUCT_PAGE.sizeUsageTitle,
    sizeUsageFallback: cleanLong(row.sizeUsageFallback, DEFAULT_PRODUCT_PAGE.sizeUsageFallback),
    shippingTitle: clean(row.shippingTitle, 80) || DEFAULT_PRODUCT_PAGE.shippingTitle,
    shippingText: cleanLong(row.shippingText, DEFAULT_PRODUCT_PAGE.shippingText),
  };
}

function normalizedKey(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "");
}

function definitionsFromVariants(rows: Array<{ options?: unknown }>) {
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

      const key = normalizedKey(name);
      const existing = groups.get(key) || {
        id: safeId(name, `option-${groups.size + 1}`),
        name,
        displayType,
        active: true,
        values: [],
      };
      if (displayType === "color") existing.displayType = "color";

      if (!existing.values.some((value) => normalizedKey(value.label) === normalizedKey(label))) {
        existing.values.push({
          id: safeId(`${existing.id}-${label}`, `${existing.id}-value-${existing.values.length + 1}`),
          label,
          ...(existing.displayType === "color" ? { color: fallbackColor || "#111111" } : {}),
        });
      }
      groups.set(key, existing);
    }
  }

  return [...groups.values()];
}

function mergeBootstrapDefinitions(base: OptionDefinition[], discovered: OptionDefinition[]) {
  const next = base.map((group) => ({
    ...group,
    values: group.values.map((value) => ({ ...value })),
  }));
  const byName = new Map(next.map((group) => [normalizedKey(group.name), group]));

  for (const candidate of discovered) {
    const key = normalizedKey(candidate.name);
    const existing = byName.get(key);
    if (!existing) {
      next.push(candidate);
      byName.set(key, candidate);
      continue;
    }
    if (candidate.displayType === "color") existing.displayType = "color";
    for (const value of candidate.values) {
      if (existing.values.some((item) => normalizedKey(item.label) === normalizedKey(value.label))) continue;
      existing.values.push({
        ...value,
        ...(existing.displayType === "color" ? { color: value.color || "#111111" } : {}),
      });
    }
  }

  return normalizeDefinitions(next);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_key,setting_value,updated_at")
    .in("setting_key", [OPTION_KEY, PRODUCT_PAGE_KEY]);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const rows = Array.isArray(data) ? data : [];
  const optionRow = rows.find((row) => row.setting_key === OPTION_KEY);
  const productPageRow = rows.find((row) => row.setting_key === PRODUCT_PAGE_KEY);

  let definitions: OptionDefinition[];
  let bootstrapped = false;

  if (optionRow?.setting_value) {
    definitions = normalizeDefinitions(optionRow.setting_value);
  } else {
    const { data: variantRows } = await auth.supabase
      .from("product_variants")
      .select("options")
      .limit(2500);
    definitions = mergeBootstrapDefinitions(
      normalizeDefinitions(DEFAULT_DEFINITIONS),
      definitionsFromVariants((variantRows || []) as Array<{ options?: unknown }>),
    );
    bootstrapped = true;
  }

  return NextResponse.json({
    ok: true,
    definitions,
    productPage: normalizeProductPage(productPageRow?.setting_value),
    updatedAt: [optionRow?.updated_at, productPageRow?.updated_at].filter(Boolean).sort().at(-1) || null,
    bootstrapped,
  }, { headers: noStoreHeaders() });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const definitions = normalizeDefinitions(body?.definitions);
  const productPage = normalizeProductPage(body?.productPage);

  if (!definitions.length) {
    return NextResponse.json({ ok: false, error: "En az bir ürün seçeneği bırakmalısın." }, { status: 400, headers: noStoreHeaders() });
  }

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("site_settings")
    .upsert([
      {
        setting_key: OPTION_KEY,
        setting_value: { version: 2, definitions },
        is_public: false,
        updated_at: now,
      },
      {
        setting_key: PRODUCT_PAGE_KEY,
        setting_value: { version: 1, ...productPage },
        is_public: true,
        updated_at: now,
      },
    ], { onConflict: "setting_key" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const revalidate = await revalidateWebsite({ source: "admin-product-option-definitions" });
  return NextResponse.json({
    ok: true,
    definitions,
    productPage,
    updatedAt: now,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message,
  }, { headers: noStoreHeaders() });
}
