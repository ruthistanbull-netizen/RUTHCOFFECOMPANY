import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";
import { normalizeThemeCustomizerSettings } from "@ruth-commerce/commerce-core/theme";
import { normalizeThemeSectionSettings } from "@ruth-commerce/commerce-core/theme-sections";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEYS = ["theme_customizer", "theme_sections"] as const;

const ROSTA_PALETTE = {
  carbon: "#111111",
  bone: "#F4F0E8",
  espresso: "#2B1B16",
  oxide: "#B9563D",
  olive: "#6F725B",
  steel: "#AAA8A1",
} as const;

const LEGACY_ROSTA_COLORS: Record<string, string> = {
  "#ffffff": ROSTA_PALETTE.bone,
  "#fff": ROSTA_PALETTE.bone,
  "#faf7f2": ROSTA_PALETTE.bone,
  "#faf7f1": ROSTA_PALETTE.bone,
  "#f6f0e7": ROSTA_PALETTE.bone,
  "#f5efe7": ROSTA_PALETTE.bone,
  "#f1eadf": ROSTA_PALETTE.bone,
  "#f0e6d8": ROSTA_PALETTE.bone,
  "#171512": ROSTA_PALETTE.carbon,
  "#211912": ROSTA_PALETTE.carbon,
  "#171717": ROSTA_PALETTE.carbon,
  "#000000": ROSTA_PALETTE.carbon,
  "#000": ROSTA_PALETTE.carbon,
  "#b8976a": ROSTA_PALETTE.oxide,
  "#d4b896": ROSTA_PALETTE.oxide,
  "#8d704b": ROSTA_PALETTE.espresso,
  "#765a37": ROSTA_PALETTE.espresso,
  "#76552f": ROSTA_PALETTE.espresso,
  "#9a7b52": ROSTA_PALETTE.espresso,
  "#6f6a63": ROSTA_PALETTE.olive,
  "#6a6056": ROSTA_PALETTE.olive,
  "#66594d": ROSTA_PALETTE.olive,
  "#7a6d5f": ROSTA_PALETTE.olive,
  "#77716b": ROSTA_PALETTE.olive,
  "#e7ded2": ROSTA_PALETTE.steel,
  "#cdbeac": ROSTA_PALETTE.steel,
  "#d8d2ca": ROSTA_PALETTE.steel,
};

const ROSTA_ALLOWED_COLORS = new Map(
  Object.values(ROSTA_PALETTE).map((value) => [value.toLowerCase(), value]),
);

function rostaColor(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const mapped = LEGACY_ROSTA_COLORS[value.toLowerCase()] || value;
  return ROSTA_ALLOWED_COLORS.get(mapped.toLowerCase()) || fallback;
}

function normalizeRostaThemeSections(value: unknown) {
  const settings = normalizeThemeSectionSettings(value);
  return {
    ...settings,
    pages: Object.fromEntries(
      Object.entries(settings.pages).map(([path, page]) => [
        path,
        {
          ...page,
          sections: page.sections.map((section) => {
            if (!section.backgroundColor && !section.textColor) return section;
            const backgroundColor = section.backgroundColor
              ? rostaColor(section.backgroundColor, ROSTA_PALETTE.bone)
              : undefined;
            const dark = backgroundColor === ROSTA_PALETTE.carbon || backgroundColor === ROSTA_PALETTE.espresso;
            return {
              ...section,
              backgroundColor,
              textColor: section.textColor
                ? rostaColor(section.textColor, dark ? ROSTA_PALETTE.bone : ROSTA_PALETTE.carbon)
                : undefined,
            };
          }),
        },
      ]),
    ),
  };
}

const ROSTA_COLORS = {
  ivory: "#F4F0E8",
  cream: "#F4F0E8",
  ink: "#111111",
  gold: "#B9563D",
  goldDark: "#2B1B16",
  muted: "#6F725B",
};

function normalizeValue(key: string, value: unknown) {
  if (key === "theme_customizer") {
    const settings = normalizeThemeCustomizerSettings(value);
    return {
      ...settings,
      colors: { ...ROSTA_COLORS },
      logo: {
        ...settings.logo,
        src: "/rosta-coffee-co.svg",
      },
    };
  }
  if (key === "theme_sections") return normalizeRostaThemeSections(value);
  return value ?? {};
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_key,setting_value")
    .in("setting_key", [...KEYS]);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const settings = Object.fromEntries((data || []).map((row: any) => [
    row.setting_key,
    normalizeValue(row.setting_key, row.setting_value),
  ]));
  return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const key = String(body.key || "");
  if (!KEYS.includes(key as any)) {
    return NextResponse.json({ ok: false, error: "Desteklenmeyen tema anahtarı." }, { status: 400 });
  }

  const value = normalizeValue(key, body.value);
  const { error } = await auth.supabase.from("site_settings").upsert({
    setting_key: key,
    setting_value: value,
    is_public: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "setting_key" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const delivery = await revalidateStorefront("rosta-admin-theme-update", "theme");
  return NextResponse.json({ ok: true, value, storefront: delivery });
}
