"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { ExactAuth } from "@/components/base44-exact/ExactAuth";
import { AdminShell } from "@/components/AdminShell";

const PUBLIC_AUTH_ROUTES = new Set(["/login", "/forgot-password", "/reset-password"]);

function AuthGateRRMark() {
  return (
    <svg viewBox="0 0 320 297" aria-hidden="true" className="h-[68px] w-[74px] text-[#FBF3E6]" fill="currentColor">
      <path fillRule="evenodd" d="M 142 262.5 L 98.5 262 L 88.5 180 L 87 178.5 L 78.5 179 L 63.5 261 L 62 262.5 L 20.5 262 L 62.5 41 L 68 19.5 L 108 19.5 L 136 25.5 L 150 33.5 L 158.5 42 L 165.5 53 L 169.5 64 L 171.5 76 L 171.5 95 L 164.5 124 L 150.5 148 L 139 159.5 L 129.5 166 L 142.5 257 L 142 262.5 Z M 275 262.5 L 231.5 262 L 220 178.5 L 211.5 179 L 195.5 262 L 152.5 262 L 200 19.5 L 240 19.5 L 260 22.5 L 271 26.5 L 287.5 38 L 296.5 50 L 301.5 62 L 304.5 90 L 302.5 106 L 297.5 123 L 289.5 139 L 280.5 151 L 269 161.5 L 262.5 165 L 275 262.5 Z M 95.5 139 L 103 137.5 L 115.5 129 L 125.5 111 L 128.5 96 L 128.5 80 L 124.5 69 L 117 62.5 L 106 59.5 L 103 59.5 L 101.5 62 L 86.5 137 L 87 139.5 L 95.5 139 Z M 227.5 139 L 238 136.5 L 250.5 126 L 256.5 115 L 260.5 100 L 261.5 83 L 256.5 68 L 247 61.5 L 239 59.5 L 234.5 60 L 219.5 135 L 220 139.5 L 227.5 139 Z" />
    </svg>
  );
}

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicAuthRoute = useMemo(() => PUBLIC_AUTH_ROUTES.has(pathname), [pathname]);
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};

    const resolveSession = async () => {
      try {
        const supabase = getSupabaseBrowser();

        if (!isPublicAuthRoute) {
          await fetch("/api/bootstrap-admin/auto", { method: "POST", cache: "no-store" }).catch(() => null);
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;
        if (sessionError) setError(sessionError.message);
        setSignedIn(Boolean(data.session));
        setReady(true);

        const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!mounted) return;
          setSignedIn(Boolean(session));
          setReady(true);
        });
        unsubscribe = () => subscription.subscription.unsubscribe();
      } catch (caught) {
        if (!mounted) return;
        setError(caught instanceof Error ? caught.message : "Panel Supabase bağlantısı kurulamadı.");
        setReady(true);
      }
    };

    void resolveSession();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [isPublicAuthRoute]);

  if (!ready) {
    return (
      <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#111111] px-5 text-[#FBF3E6]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(251,243,230,0.07),transparent_34%)]" />
        <div className="relative text-center">
          <div className="flex justify-center"><AuthGateRRMark /></div>
          <p className="mt-2 text-[10px] font-semibold tracking-[0.22em] text-[#FBF3E6]/50">RR HUB</p>
          <h1 className="mt-7 text-xl font-semibold text-[#FBF3E6]">Panel hazırlanıyor</h1>
          <p className="mt-2 text-sm text-[#FBF3E6]/55">{error || "Güvenli yönetici oturumu doğrulanıyor."}</p>
          <div className="mx-auto mt-5 h-8 w-8 animate-spin rounded-full border-2 border-[#FBF3E6]/18 border-t-[#FBF3E6]" />
        </div>
      </main>
    );
  }

  if (!signedIn) {
    if (isPublicAuthRoute) return <>{children}</>;
    return <ExactAuth mode="login" />;
  }

  if (isPublicAuthRoute) return <>{children}</>;

  return <AdminShell>{children}</AdminShell>;
}
