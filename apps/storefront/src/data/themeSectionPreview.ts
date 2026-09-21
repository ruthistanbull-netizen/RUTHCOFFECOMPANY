import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeThemeSectionSettings } from "@ruth-commerce/commerce-core/theme-sections";
import { mapRostaLegacyColor } from "@/lib/rostaDesignSystem";

export async function getThemeSectionPreviewSettings(token: string) {
  const safe = String(token || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  if (!safe) return null;
  let client;
  try { client = getSupabaseAdmin(); } catch { return null; }
  const { data, error } = await client.from("site_settings").select("setting_value").eq("setting_key", `theme_sections_preview_${safe}`).maybeSingle();
  if (error || !data?.setting_value) return null;
  const settings = normalizeThemeSectionSettings(data.setting_value);
  return {
    pages: Object.fromEntries(Object.entries(settings.pages).map(([path, page]) => [path, {
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        backgroundColor: mapRostaLegacyColor(section.backgroundColor) || section.backgroundColor,
        textColor: mapRostaLegacyColor(section.textColor) || section.textColor,
      })),
    }])),
  };
}
