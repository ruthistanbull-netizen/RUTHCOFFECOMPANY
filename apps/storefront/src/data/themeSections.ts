import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { supabase } from "@/lib/supabase";
import {
  defaultThemeSectionSettings,
  normalizeThemeSectionSettings,
  type ThemeSectionSettings,
} from "@ruth-commerce/commerce-core/theme-sections";

const THEME_SECTION_REVALIDATE_SECONDS = 10;

async function readThemeSections(): Promise<ThemeSectionSettings> {
  let client = supabase;
  try { client = getSupabaseAdmin(); } catch {}
  if (!client) return defaultThemeSectionSettings;

  const { data, error } = await client
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "theme_sections")
    .maybeSingle();

  if (error) {
    console.error("Tema bölüm ayarları alınamadı:", error.message);
    return defaultThemeSectionSettings;
  }
  return normalizeThemeSectionSettings(data?.setting_value || defaultThemeSectionSettings);
}

const cachedThemeSections = unstable_cache(readThemeSections, ["ruth-theme-sections"], {
  revalidate: THEME_SECTION_REVALIDATE_SECONDS,
  tags: ["ruth-theme"],
});

export async function getThemeSectionSettings() {
  return cachedThemeSections();
}
