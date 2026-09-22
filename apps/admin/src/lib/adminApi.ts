"use client";

import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data, error } = await getSupabaseBrowser().auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Panel oturumu bulunamadı.");

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Panel isteği tamamlanamadı.");
  }
  return payload as T;
}
