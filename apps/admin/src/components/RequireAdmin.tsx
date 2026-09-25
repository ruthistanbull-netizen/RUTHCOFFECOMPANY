"use client";

import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useLayoutEffect, useState } from "react";
import { adminRememberSessionEnabled, getSupabaseBrowser } from "@/lib/supabaseBrowser";

const CACHE_KEY = "ruth_admin_next_checked_until";
const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TIMEOUT_MS = 12_000;
const VERIFY_TIMEOUT_MS = 10_000;
const VERIFY_RETRIES = 3;
const RETRY_DELAY_MS = 650;

class AdminGateError extends Error {
  constructor(message: string, readonly recoverable: boolean) {
    super(message);
    this.name = "AdminGateError";
  }
}

function accessStorages() {
  const remembered = adminRememberSessionEnabled();
  return remembered
    ? { target: window.localStorage, other: window.sessionStorage }
    : { target: window.sessionStorage, other: window.localStorage };
}

function cachedAccess() {
  if (typeof window === "undefined") return false;
  try {
    const { target } = accessStorages();
    return Number(target.getItem(CACHE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

function cacheVerifiedAccess() {
  try {
    const { target, other } = accessStorages();
    target.setItem(CACHE_KEY, String(Date.now() + CACHE_MS));
    other.removeItem(CACHE_KEY);
  } catch {}
}

function clearVerifiedAccess() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
    window.sessionStorage.removeItem(CACHE_KEY);
  } catch {}
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function RRHubGateMark() {
  return (
    <svg
      viewBox="0 0 320 297"
      aria-hidden="true"
      focusable="false"
      className="h-[74px] w-[80px] text-[#F4F0E8]"
      fill="currentColor"
    >
      <path fillRule="evenodd" d="M 142 262.5 L 98.5 262 L 88.5 180 L 87 178.5 L 78.5 179 L 63.5 261 L 62 262.5 L 20.5 262 L 62.5 41 L 68 19.5 L 108 19.5 L 136 25.5 L 150 33.5 L 158.5 42 L 165.5 53 L 169.5 64 L 171.5 76 L 171.5 95 L 164.5 124 L 150.5 148 L 139 159.5 L 129.5 166 L 142.5 257 L 142 262.5 Z M 275 262.5 L 231.5 262 L 220 178.5 L 211.5 179 L 195.5 262 L 152.5 262 L 200 19.5 L 240 19.5 L 260 22.5 L 271 26.5 L 287.5 38 L 296.5 50 L 301.5 62 L 304.5 90 L 302.5 106 L 297.5 123 L 289.5 139 L 280.5 151 L 269 161.5 L 262.5 165 L 275 262.5 Z M 95.5 139 L 103 137.5 L 115.5 129 L 125.5 111 L 128.5 96 L 128.5 80 L 124.5 69 L 117 62.5 L 106 59.5 L 103 59.5 L 101.5 62 L 86.5 137 L 87 139.5 L 95.5 139 Z M 227.5 139 L 238 136.5 L 250.5 126 L 256.5 115 L 260.5 100 L 261.5 83 L 256.5 68 L 247 61.5 L 239 59.5 L 234.5 60 L 219.5 135 L 220 139.5 L 227.5 139 Z" />
    </svg>
  );
}

async function withTimeout<T>(value: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new AdminGateError(message, true)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function restoreAdminSession() {
  const supabase = getSupabaseBrowser();
  const current = await withTimeout(
    supabase.auth.getSession(),
    SESSION_TIMEOUT_MS,
    "Oturum bilgisi geri yüklenirken zaman aşımı oluştu.",
  );
  if (current.error) {
    throw new AdminGateError(current.error.message || "Oturum bilgisi okunamadı.", true);
  }
  if (current.data.session) return current.data.session;

  const refreshed = await withTimeout(
    supabase.auth.refreshSession(),
    SESSION_TIMEOUT_MS,
    "Oturum yenilenirken zaman aşımı oluştu.",
  );
  if (refreshed.error) {
    const status = Number((refreshed.error as { status?: number }).status || 0);
    const permanent = status === 400 || status === 401 || status === 403;
    throw new AdminGateError(
      refreshed.error.message || "Oturum yenilenemedi.",
      !permanent,
    );
  }
  return refreshed.data.session;
}

async function verifyAdminSession(token: string) {
  let lastError: AdminGateError | null = null;

  for (let attempt = 0; attempt < VERIFY_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    try {
      const response = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.ok) return result;

      if (response.status === 401 || response.status === 403) {
        throw new AdminGateError(result.error || "Admin oturumu geçersiz.", false);
      }

      lastError = new AdminGateError(
        result.error || "Kimlik servisine geçici olarak ulaşılamıyor.",
        true,
      );
    } catch (caught) {
      if (caught instanceof AdminGateError && !caught.recoverable) throw caught;
      lastError = new AdminGateError(
        caught instanceof Error && caught.name !== "AbortError"
          ? caught.message
          : "Kimlik doğrulama servisi zaman aşımına uğradı.",
        true,
      );
    } finally {
      window.clearTimeout(timer);
    }

    if (attempt + 1 < VERIFY_RETRIES) await sleep(RETRY_DELAY_MS);
  }

  throw lastError || new AdminGateError("Kimlik servisine geçici olarak ulaşılamıyor.", true);
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");
  const [error, setError] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const ready = state === "allowed";
    root.classList.toggle("ruth-admin-preparing", !ready);
    root.classList.toggle("ruth-admin-ready", ready);
    if (ready) window.dispatchEvent(new Event("ruth-admin-ready"));

    return () => {
      root.classList.remove("ruth-admin-preparing", "ruth-admin-ready");
    };
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    let sessionReady = false;
    const hadCachedAccess = cachedAccess();
    setState("checking");
    setError(null);
    setRecoverable(false);

    const verify = async () => {
      try {
        const session = await restoreAdminSession();
        const token = session?.access_token;
        if (!token) {
          clearVerifiedAccess();
          if (!cancelled) router.replace("/login");
          return;
        }

        sessionReady = true;
        if (hadCachedAccess && !cancelled) setState("allowed");

        await verifyAdminSession(token);
        cacheVerifiedAccess();
        if (!cancelled) {
          setError(null);
          setRecoverable(false);
          setState("allowed");
        }
      } catch (caught) {
        const gateError = caught instanceof AdminGateError
          ? caught
          : new AdminGateError(
              caught instanceof Error ? caught.message : "Admin yetkisi doğrulanamadı.",
              true,
            );

        if (gateError.recoverable && hadCachedAccess && sessionReady) {
          if (!cancelled) {
            setError(null);
            setRecoverable(false);
            setState("allowed");
          }
          return;
        }

        if (!gateError.recoverable) clearVerifiedAccess();
        if (!cancelled) {
          setError(gateError.message);
          setRecoverable(gateError.recoverable);
          setState("denied");
        }
      }
    };

    void verify();
    return () => {
      cancelled = true;
    };
  }, [retryNonce, router]);

  if (state === "allowed") return <>{children}</>;

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#141414] px-5 py-[max(2rem,env(safe-area-inset-top))] text-[#F4F0E8]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(244,240,232,0.07),transparent_34%)]" />
      <div className="relative w-full max-w-[430px] text-center">
        <div className="mx-auto flex items-center justify-center">
          <RRHubGateMark />
        </div>
        <p className="mt-2 text-[11px] font-semibold tracking-[0.22em] text-[#F4F0E8]/55">RR HUB</p>

        {state === "checking" ? (
          <div className="mt-8">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#F4F0E8]">Güvenli oturum hazırlanıyor</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[#F4F0E8]/58">
              Yönetici oturumun ve erişim yetkin doğrulanıyor.
            </p>
            <div className="mx-auto mt-6 h-9 w-9 animate-spin rounded-full border-2 border-[#F4F0E8]/18 border-t-[#F4F0E8]" />
            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-[#F4F0E8]/45">
              <ShieldCheck className="h-3.5 w-3.5" /> RR HUB güvenli bağlantısı
            </div>
          </div>
        ) : (
          <div className="mt-8 rounded-[22px] border border-[#F4F0E8]/12 bg-[#1B1B1B] p-5 text-left shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
            <h1 className="text-lg font-semibold text-[#F4F0E8]">
              {recoverable ? "Kimlik servisi geçici olarak yavaş" : "Yönetici erişimi gerekli"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#F4F0E8]/58">
              {error || "Bu oturum yönetim alanını açmaya yetkili değil."}
            </p>
            {recoverable ? (
              <button
                type="button"
                onClick={() => {
                  setState("checking");
                  setError(null);
                  setRetryNonce((value) => value + 1);
                }}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#F4F0E8] px-4 text-sm font-semibold text-[#141414] transition active:scale-[0.98]"
              >
                <RefreshCw className="h-4 w-4" /> Tekrar dene
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.replace("/login")}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[#F4F0E8] px-4 text-sm font-semibold text-[#141414] transition active:scale-[0.98]"
              >
                Giriş ekranına dön <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
