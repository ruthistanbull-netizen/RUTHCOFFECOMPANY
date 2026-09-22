"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { ExactAuth } from "@/components/base44-exact/ExactAuth";

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};

    try {
      const supabase = getSupabaseBrowser();
      fetch("/api/bootstrap-admin/auto", { method: "POST", cache: "no-store" })
        .catch(() => null)
        .finally(() => {
          supabase.auth.getSession().then(({ data, error: sessionError }) => {
            if (!mounted) return;
            if (sessionError) setError(sessionError.message);
            setSignedIn(Boolean(data.session));
            setReady(true);
          }).catch((caught) => {
            if (!mounted) return;
            setError(caught instanceof Error ? caught.message : "Panel oturumu okunamadı.");
            setReady(true);
          });
        });

      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        setSignedIn(Boolean(session));
        setReady(true);
      });
      unsubscribe = () => subscription.subscription.unsubscribe();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Panel Supabase bağlantısı kurulamadı.");
      setReady(true);
    }

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,hsl(var(--accent)/0.13),transparent_38%)]" />
        <div className="relative text-center">
          <img src="/rosta-coffee-co.svg" alt="ROSTA Coffee Co." className="mx-auto h-24 w-52 object-contain" />
          <h1 className="mt-6 text-xl font-bold text-main">Panel hazırlanıyor</h1>
          <p className="mt-2 text-sm text-muted">{error || "Güvenli yönetici oturumu doğrulanıyor."}</p>
          <div className="mx-auto mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-surface-tertiary">
            <div className="h-full w-2/5 rounded-full bg-accent animate-[ruth-loading_1.4s_ease-in-out_infinite]" />
          </div>
        </div>
      </main>
    );
  }

  if (!signedIn) {
    if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password") return <>{children}</>;
    return <ExactAuth mode="login" />;
  }

  return <>{children}</>;
}
