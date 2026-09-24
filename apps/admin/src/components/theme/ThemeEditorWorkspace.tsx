"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { SaveLifecycleProvider } from "@ruth-commerce/ui";
import { adminAuthHeaders } from "@/lib/adminApi";
import { ThemePreviewViewport } from "@/components/theme/ThemePreviewViewport";
import { ThemeSectionPanelV4 } from "@/components/theme/ThemeSectionPanelV4";

type BootState = "checking" | "ready" | "error";

function timeout<T>(promise: PromiseLike<T> | Promise<T>, ms: number, message: string) {
  return Promise.race<T>([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

async function verifyThemeEditorBoot() {
  const authHeaders = await timeout(
    adminAuthHeaders(),
    4_500,
    "Panel oturumu zamanında doğrulanamadı.",
  );

  const authorization = authHeaders.Authorization;
  if (!authorization) throw new Error("Panel oturumu bulunamadı.");

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 5_500);
  try {
    const response = await fetch(`/api/theme?boot=${Date.now()}`, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "X-Ruth-Admin-Request": "1",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || "Tema ayarları alınamadı.");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Tema servisi 5 saniye içinde yanıt vermedi.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function ThemeEditorWorkspace() {
  const [bootState, setBootState] = useState<BootState>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [sectionsReady, setSectionsReady] = useState(false);

  useEffect(() => {
    let active = true;
    setBootState("checking");
    setErrorMessage("");
    setSectionsReady(false);

    void verifyThemeEditorBoot()
      .then(() => {
        if (active) setBootState("ready");
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Tema düzenleyici başlatılamadı.");
        setBootState("error");
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  // Önce ana editörü başlat, bölüm API'sini kısa süre sonra devreye al.
  // Bu iki ekranın aynı anda Supabase auth/session kilidine girmesini engeller.
  useEffect(() => {
    if (bootState !== "ready") return;
    const timer = window.setTimeout(() => setSectionsReady(true), 650);
    return () => window.clearTimeout(timer);
  }, [bootState]);

  // V4'ün kendi veri yüklemesi beklenmedik şekilde takılırsa sonsuz overlay bırakma.
  useEffect(() => {
    if (bootState !== "ready") return;
    const timer = window.setTimeout(() => {
      const root = document.querySelector("[data-theme-customizer-v4]");
      const stillLoading = Array.from(root?.querySelectorAll("div") || []).some(
        (node) => node.textContent?.trim() === "Tema düzenleyici hazırlanıyor…",
      );
      if (!stillLoading) return;
      setErrorMessage("Tema verisi ikinci yükleme aşamasında takıldı. Tekrar dene; editör güvenli şekilde yeniden başlatılacak.");
      setBootState("error");
    }, 6_500);
    return () => window.clearTimeout(timer);
  }, [attempt, bootState]);

  if (bootState !== "ready") {
    return (
      <div className="fixed inset-0 z-[90] grid place-items-center bg-background px-5 text-main">
        <div className="w-full max-w-sm rounded-xl border border-border-subtle bg-surface-primary p-5 text-center shadow-xl">
          {bootState === "checking" ? (
            <div role="status" aria-busy="true" aria-live="polite">
              <LoadingIndicator size="md" label="Tema düzenleyici hazırlanıyor" className="mx-auto" />
              <p className="mt-3 text-[12px] font-semibold">Tema düzenleyici hazırlanıyor…</p>
              <p className="mt-1 text-[10px] leading-5 text-muted">Oturum ve tema servisi kontrol ediliyor.</p>
            </div>
          ) : (
            <>
              <p className="text-[12px] font-semibold">Tema düzenleyici açılamadı</p>
              <p className="mt-2 text-[10px] leading-5 text-muted">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-[10px] font-semibold text-[var(--rosta-action-text)] active:bg-[var(--rosta-espresso)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tekrar dene
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <SaveLifecycleProvider>
      <ThemePreviewViewport />
      {sectionsReady ? <ThemeSectionPanelV4 /> : null}
    </SaveLifecycleProvider>
  );
}
