import { unstable_noStore as noStore } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  defaultThemeCustomizerSettings,
  normalizeThemeCustomizerSettings,
  type ThemeCustomizerSettings,
} from "@/lib/themeCustomizer";
import { applyRostaStorefrontDesignSystem } from "@/lib/rostaDesignSystem";

function themeClient() {
  try {
    return getSupabaseAdmin();
  } catch {
    return supabase;
  }
}

export async function getLiveThemeCustomizerSettings(): Promise<ThemeCustomizerSettings> {
  noStore();

  try {
    const client = themeClient();
    if (!client) return applyRostaStorefrontDesignSystem(defaultThemeCustomizerSettings);

    const { data, error } = await client
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "theme_customizer")
      .maybeSingle();

    if (error) throw error;
    return applyRostaStorefrontDesignSystem(
      normalizeThemeCustomizerSettings(data?.setting_value || defaultThemeCustomizerSettings),
    );
  } catch (error) {
    console.error("Canlı tema ayarları okunamadı:", error);
    return applyRostaStorefrontDesignSystem(defaultThemeCustomizerSettings);
  }
}
