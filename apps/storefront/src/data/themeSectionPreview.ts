import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeThemeSectionSettings } from "@ruth-commerce/commerce-core/theme-sections";

export async function getThemeSectionPreviewSettings(token: string) {
  const safe = String(token || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
  if (!safe) return null;
  let client;
  try { client = getSupabaseAdmin(); } catch { return null; }
  const { data, error } = await client.from("site_settings").select("setting_value").eq("setting_key", `theme_sections_preview_${safe}`).maybeSingle();
  if (error || !data?.setting_value) return null;
  return normalizeThemeSectionSettings(data.setting_value);
}
