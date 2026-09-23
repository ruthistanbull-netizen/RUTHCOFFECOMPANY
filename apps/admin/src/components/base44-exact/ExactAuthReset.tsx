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
      <main className="min-h-screen flex items-center justify-center bg-background p-5" data-exact-base44-auth={mode}>
        <div className="radius-control border border-info/20 bg-info-soft px-4 py-3 text-xs text-info-foreground">
          Güvenli sıfırlama bağlantısı doğrulanıyor…
        </div>
      </main>
    );
  }

  return <ExactAuth mode={mode} />;
}
