import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { supabase } from "@/lib/supabase";
import {
  defaultThemeSectionSettings,
  normalizeThemeSectionSettings,
  type ThemeSectionSettings,
} from "@ruth-commerce/commerce-core/theme-sections";
import { ROSTA_PALETTE, sanitizeRostaPaletteColor } from "@/lib/rostaDesignSystem";

const THEME_SECTION_REVALIDATE_SECONDS = 10;

function applyRostaSectionPalette(settings: ThemeSectionSettings): ThemeSectionSettings {
  return {
    pages: Object.fromEntries(Object.entries(settings.pages).map(([path, page]) => [path, {
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        backgroundColor: section.backgroundColor
          ? sanitizeRostaPaletteColor(section.backgroundColor, ROSTA_PALETTE.carbon)
          : section.backgroundColor,
        textColor: section.textColor
          ? sanitizeRostaPaletteColor(section.textColor, ROSTA_PALETTE.cream)
          : section.textColor,
      })),
    }])),
  };
}

async function readThemeSections(): Promise<ThemeSectionSettings> {
  let client = supabase;
  try { client = getSupabaseAdmin(); } catch {}
  if (!client) return applyRostaSectionPalette(defaultThemeSectionSettings);

  const { data, error } = await client
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "theme_sections")
    .maybeSingle();

  if (error) {
    console.error("Tema bölüm ayarları alınamadı:", error.message);
    return applyRostaSectionPalette(defaultThemeSectionSettings);
  }
  return applyRostaSectionPalette(normalizeThemeSectionSettings(data?.setting_value || defaultThemeSectionSettings));
}

const cachedThemeSections = unstable_cache(readThemeSections, ["rosta-theme-sections"], {
  revalidate: THEME_SECTION_REVALIDATE_SECONDS,
  tags: ["rosta-theme"],
});

export async function getThemeSectionSettings() {
  return cachedThemeSections();
}
