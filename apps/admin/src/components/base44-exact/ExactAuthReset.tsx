"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { ExactAuth } from "./ExactAuth";

/**
 * Password-recovery links are single-use. Capture their URL payload before
 * supabase-js can consume/clean it, establish the recovery session, then mount
 * the existing ExactAuth UI. Supports Ruth's custom Gmail token_hash links as
 * well as the legacy Supabase code/hash recovery formats.
 */
export function ExactAuthReset({ mode }: { mode: "reset" }) {
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let active = true;

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const tokenHash = search.get("token_hash");
    const code = search.get("code");
    const hashType = hash.get("type");
    const queryType = search.get("type");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const recoveryHint = Boolean(
      tokenHash
      || code
      || hashType === "recovery"
      || queryType === "recovery"
      || (accessToken && refreshToken),
    );

    if (!recoveryHint) {
      setBootstrapped(true);
      return () => {
        active = false;
      };
    }

    const keepRecoveryMarker = (clearCredentials = false) => {
      const url = new URL(window.location.href);
      url.searchParams.set("type", "recovery");
      if (clearCredentials) {
        url.searchParams.delete("token_hash");
        url.searchParams.delete("code");
        url.hash = "";
      }
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    };

    if (queryType !== "recovery") keepRecoveryMarker();

    void (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const { data: initial } = await supabase.auth.getSession();

        if (!initial.session && tokenHash && queryType === "recovery") {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (verifyError) throw verifyError;
        } else if (!initial.session && code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            const { data: afterExchange } = await supabase.auth.getSession();
            if (!afterExchange.session) throw exchangeError;
          }
        } else if (!initial.session && accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        }

        const { data: final } = await supabase.auth.getSession();
        if (final.session) keepRecoveryMarker(true);
      } catch {
        // ExactAuth owns the user-facing invalid/expired-link state.
      } finally {
        if (active) setBootstrapped(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!bootstrapped) {
    return (
      <main
        className="relative min-h-[100dvh] overflow-hidden bg-[#141414] text-[#F4F0E8]"
        data-exact-base44-auth={mode}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,255,255,.075),transparent_34%),linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.34))]" />
        <header className="relative z-20 flex h-[72px] items-center px-5 pt-[env(safe-area-inset-top)] sm:h-[86px] sm:px-10 lg:px-12">
          <img
            src="/rr-hub-cream.svg"
            alt="RR HUB"
            draggable={false}
            className="h-[30px] w-auto select-none object-contain sm:h-[34px]"
          />
        </header>
        <section className="relative z-10 flex min-h-[calc(100dvh-72px)] items-start justify-center px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 sm:min-h-[calc(100dvh-86px)] sm:items-center sm:pb-16 sm:pt-0">
          <div className="w-full max-w-[450px] rounded-[8px] border border-white/[0.08] bg-[#1b1b1b]/92 px-6 py-10 text-center shadow-[0_30px_80px_rgba(0,0,0,.38)] backdrop-blur-[6px] sm:px-14 sm:py-12">
            <img
              src="/rr-hub-cream.svg"
              alt="RR HUB"
              draggable={false}
              className="mx-auto mb-8 h-auto w-[184px] select-none object-contain sm:w-[210px]"
            />
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-[#F4F0E8]/20 border-t-[#F4F0E8]" />
            <p className="mt-5 text-[13px] font-medium text-[#F4F0E8]/72">
              Güvenli sıfırlama bağlantısı doğrulanıyor…
            </p>
          </div>
        </section>
      </main>
    );
  }

  return <ExactAuth mode={mode} />;
}
