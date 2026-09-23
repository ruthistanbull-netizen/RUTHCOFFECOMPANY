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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[hsl(var(--background))] px-5 py-[max(2rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,hsl(var(--accent)/0.13),transparent_38%),radial-gradient(circle_at_15%_85%,hsl(var(--accent)/0.07),transparent_30%)]" />
      <div className="relative w-full max-w-md animate-fade-in text-center">
        <div className="mx-auto flex w-full max-w-[320px] items-center justify-center overflow-visible px-4">
          <img
            src="/ruth-commerce-panel-logo.png?v=20260807-3"
            alt="ROSTA Coffee Co."
            data-ruth-loading-logo
            width={1000}
            height={500}
            draggable={false}
            className="block h-auto max-h-[180px] w-full select-none object-contain"
          />
        </div>

        {state === "checking" ? (
          <>
            <h1 className="mt-8 text-2xl font-bold tracking-tight text-main">Panel hazırlanıyor</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
              Güvenli oturumun ve yönetici yetkin doğrulanıyor.
            </p>
            <div className="mx-auto mt-6 h-1.5 w-52 overflow-hidden rounded-full bg-surface-tertiary">
              <div className="h-full w-2/5 rounded-full bg-accent animate-[ruth-loading_1.4s_ease-in-out_infinite]" />
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-subtle">
              <ShieldCheck className="h-3.5 w-3.5 text-success-foreground" /> Şifreli yönetici bağlantısı kuruluyor
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-[var(--radius-card)] border border-danger/15 bg-danger-soft p-5 text-left shadow-card">
            <h1 className="text-lg font-bold text-main">
              {recoverable ? "Kimlik servisi geçici olarak yavaş" : "Yönetici erişimi gerekli"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {error || "Bu hesap paneli açmaya yetkili değil."}
            </p>
            {recoverable ? (
              <button
                type="button"
                onClick={() => {
                  setState("checking");
                  setError(null);
                  setRetryNonce((value) => value + 1);
                }}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-semibold text-white transition-all hover:bg-accent-hover"
              >
                <RefreshCw className="h-4 w-4" /> Tekrar dene
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.replace("/login")}
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-semibold text-white transition-all hover:bg-accent-hover"
              >
                Giriş ekranına dön <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
      <style jsx global>{`
        @keyframes ruth-loading { 0% { transform: translateX(-130%); } 55% { transform: translateX(150%); } 100% { transform: translateX(150%); } }
        html.dark img[data-ruth-loading-logo] {
          filter:
            drop-shadow(0 0 1px rgba(255, 255, 255, 0.95))
            drop-shadow(0 0 4px rgba(255, 255, 255, 0.58));
        }
      `}</style>
    </main>
  );
}