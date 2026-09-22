import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseFetch } from "@/lib/supabaseFetch";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

let adminClient: SupabaseClient | null = null;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function assertValidServerKey(supabaseUrl: string, key: string) {
  if (key.startsWith("sb_secret_")) return;

  const payload = decodeJwtPayload(key);
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

  if (
    payload?.role !== "service_role" ||
    (typeof payload?.ref === "string" && payload.ref !== projectRef)
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY bu Supabase projesine ait geçerli bir service_role anahtarı değil.",
    );
  }
}

export function getSupabaseAdmin() {
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fposvxuryzidmeuwytbg.supabase.co",
  );
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error(
      "Supabase admin env eksik: SUPABASE_SERVICE_ROLE_KEY yok.",
    );
  }

  assertValidServerKey(supabaseUrl, serviceRoleKey);

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: { fetch: supabaseFetch },
    });
  }

  return adminClient;
}
