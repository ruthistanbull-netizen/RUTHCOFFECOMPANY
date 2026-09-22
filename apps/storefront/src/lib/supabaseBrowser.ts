"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

let browserClient: SupabaseClient | null = null;

function installPasswordResetEmailBridge(client: SupabaseClient) {
  const resetPasswordForEmail: typeof client.auth.resetPasswordForEmail = async (email) => {
    const response = await fetch("/api/auth/password-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Şifre yenileme e-postası gönderilemedi.");
    }

    return { data: {}, error: null } as Awaited<ReturnType<typeof client.auth.resetPasswordForEmail>>;
  };

  Reflect.set(client.auth, "resetPasswordForEmail", resetPasswordForEmail);
  return client;
}

export function getSupabaseBrowser() {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_6Zoqk9z0WEDsvNZ79-b2Qw_fnKVuWhb"
  ).trim();

  if (!browserClient) {
    browserClient = installPasswordResetEmailBridge(createClient(supabaseUrl, supabaseAnonKey));
  }

  return browserClient;
}
