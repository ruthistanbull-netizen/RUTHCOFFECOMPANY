import { createStorefrontRevalidationSecretResolver } from "@ruth-commerce/commerce-core/storefront-revalidation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const getStorefrontRevalidationSecret = createStorefrontRevalidationSecretResolver({
  configuredSecret: () => process.env.WEBSITE_REVALIDATE_SECRET || process.env.REVALIDATE_SECRET,
  loadInternalSecret: async () => {
    const { data, error } = await getSupabaseAdmin()
      .from("automation_cron_config").select("secret").eq("id", true).maybeSingle();
    if (error) throw error;
    return data?.secret;
  },
});
