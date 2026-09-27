"use client";

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [recoveryAttempted, setRecoveryAttempted] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowser();

    const cleanRecoveryUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("token_hash");
      url.searchParams.delete("token");
      url.searchParams.delete("code");
      url.searchParams.set("type", "recovery");
      url.hash = "";
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    };

    const resolveRecoveryIdentity = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const tokenHash = searchParams.get("token_hash") || searchParams.get("token");
      const searchType = searchParams.get("type");
      const hashType = hashParams.get("type");
      const code = searchParams.get("code");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const isRecoveryLink = searchType === "recovery" || hashType === "recovery";
      const hasRecoveryPayload = Boolean(tokenHash || code || accessToken || refreshToken || isRecoveryLink);

      if (!hasRecoveryPayload) {
        if (!mounted) return;
        setRecoveryAttempted(false);
        setChecking(false);
        return;
      }

      if (!mounted) return;
      setRecoveryAttempted(true);

      try {
        if (tokenHash && (isRecoveryLink || !searchType)) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (verifyError) throw verifyError;
        } else if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError && !exchangeError.message.toLowerCase().includes("already")) throw exchangeError;
        } else if (accessToken && refreshToken && isRecoveryLink) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        } else if (!isRecoveryLink) {
          throw new Error("Geçerli bir şifre yenileme bağlantısı bulunamadı.");
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;

        const email = normalizeEmail(userData.user?.email);
        if (!email) throw new Error("Şifre bağlantısına bağlı hesap bulunamadı.");
        if (!mounted) return;

        setRecoveryEmail(email);
        setReady(true);
        setChecking(false);
        setError(null);
        cleanRecoveryUrl();
      } catch (caught) {
        if (!mounted) return;
        setError(caught instanceof Error ? caught.message : "Şifre bağlantısı doğrulanamadı.");
        setRecoveryEmail("");
        setReady(false);
        setChecking(false);
      }
    };

    void resolveRecoveryIdentity();
    return () => {
      mounted = false;
    };
  }, [searchParams]);

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setRequestSent(false);

    const email = normalizeEmail(requestEmail);
    if (!validEmail(email)) {
      setError("Geçerli bir e-posta adresi gir.");
      return;
    }

    setRequesting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email);
      if (requestError) throw requestError;
      setRequestSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Şifre yenileme e-postası gönderilemedi.");
    } finally {
      setRequesting(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!recoveryEmail) {
      setError("Şifre bağlantısına bağlı hesap doğrulanamadı.");
      return;
    }
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Şifreler birbiriyle aynı değil.");
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const currentEmail = normalizeEmail(userData.user?.email);
      if (!currentEmail || currentEmail !== recoveryEmail) {
        throw new Error("Şifre bağlantısının bağlı olduğu hesap değişti. Lütfen e-postadaki bağlantıyı yeniden aç.");
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      router.replace("/account");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Şifre kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-carbon px-4 pb-24 pt-28 text-cream md:px-8 md:pt-32">
      <div className="mx-auto max-w-md rounded-2xl border border-kraft/35 bg-carbon-soft p-6 shadow-sm md:p-8">
        <p className="mb-3 text-xs uppercase tracking-wide-luxe text-brick">ROSTA Coffee Co.</p>

        {checking ? (
          <>
            <h1 className="font-heading text-4xl">Şifre Yenileme</h1>
            <div className="mt-8 flex items-center gap-3 rounded-xl border border-kraft/35 bg-carbon p-4 text-sm text-cream/70" role="status" aria-busy="true">
              <LoadingIndicator size="sm" /> Bağlantı doğrulanıyor…
            </div>
          </>
        ) : ready ? (
          <>
            <h1 className="font-heading text-4xl">Yeni Şifreni Belirle</h1>
            <p className="mt-3 text-sm leading-7 text-cream/70">
              {recoveryEmail} hesabın için yeni şifreni oluştur.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">
                Yeni Şifre
                <input
                  required
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                />
              </label>
              <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">
                Şifreyi Tekrarla
                <input
                  required
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                />
              </label>

              {error ? <div className="rounded-lg border border-[var(--ruth-color-danger)]/40 bg-[var(--ruth-color-danger-soft)] px-4 py-3 text-sm text-[var(--ruth-color-danger-text)]">{error}</div> : null}

              <button
                type="submit"
                disabled={saving}
                aria-busy={saving || undefined}
                className="flex w-full items-center justify-center gap-2 bg-brick px-8 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] transition active:bg-espresso disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
              >
                {saving ? <LoadingIndicator size="sm" /> : null}
                {saving ? "Kaydediliyor" : "Şifremi Yenile"}
                {!saving ? <ArrowRight size={15} /> : null}
              </button>
            </form>
          </>
        ) : recoveryAttempted ? (
          <>
            <h1 className="font-heading text-4xl">Bağlantı Geçersiz</h1>
            <div className="mt-6 rounded-xl border border-[var(--ruth-color-danger)]/40 bg-[var(--ruth-color-danger-soft)] p-4 text-sm leading-6 text-[var(--ruth-color-danger-text)]">
              {error || "Bu şifre yenileme bağlantısının süresi dolmuş veya bağlantı daha önce kullanılmış."}
            </div>
            <Link href="/reset-password" className="mt-5 inline-flex text-xs uppercase tracking-wide-luxe text-brick underline-offset-4 focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick">
              Yeni bağlantı iste
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-heading text-4xl">Şifreni mi Unuttun?</h1>
            <p className="mt-3 text-sm leading-7 text-cream/70">
              Hesabına bağlı e-posta adresini gir. Sana güvenli bir şifre yenileme bağlantısı gönderelim.
            </p>

            <form onSubmit={requestReset} className="mt-7 space-y-4">
              <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">
                E-posta
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={requestEmail}
                  onChange={(event) => setRequestEmail(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                />
              </label>

              {requestSent ? (
                <div className="rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm leading-6 text-cream/70">
                  Bu e-posta ile bir hesap varsa şifre yenileme bağlantısı gönderildi. Gelen kutunu ve spam klasörünü kontrol et.
                </div>
              ) : null}
              {error ? <div className="rounded-lg border border-[var(--ruth-color-danger)]/40 bg-[var(--ruth-color-danger-soft)] px-4 py-3 text-sm text-[var(--ruth-color-danger-text)]">{error}</div> : null}

              <button
                type="submit"
                disabled={requesting}
                aria-busy={requesting || undefined}
                className="flex w-full items-center justify-center gap-2 bg-brick px-8 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] transition active:bg-espresso disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
              >
                {requesting ? <LoadingIndicator size="sm" /> : <Mail size={15} />}
                {requesting ? "Gönderiliyor" : requestSent ? "Tekrar Gönder" : "Bağlantı Gönder"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
