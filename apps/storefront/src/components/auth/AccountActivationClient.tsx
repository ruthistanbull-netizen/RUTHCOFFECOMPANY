"use client";

import { ArrowRight } from "lucide-react";
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

export function AccountActivationClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
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
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const tokenHash = searchParams.get("token_hash") || searchParams.get("token");
        const searchType = searchParams.get("type");
        const hashType = hashParams.get("type");
        const code = searchParams.get("code");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const isRecoveryLink = searchType === "recovery" || hashType === "recovery";

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
          throw new Error("Geçerli bir hesap aktivasyon bağlantısı bulunamadı.");
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;

        const email = normalizeEmail(userData.user?.email);
        if (!email) throw new Error("Aktivasyon bağlantısına bağlı hesap bulunamadı.");
        if (!mounted) return;

        setRecoveryEmail(email);
        setEmailDraft(email);
        setReady(true);
        setChecking(false);
        cleanRecoveryUrl();
      } catch (caught) {
        if (!mounted) return;
        setError(caught instanceof Error ? caught.message : "Aktivasyon bağlantısı doğrulanamadı.");
        setRecoveryEmail("");
        setEmailDraft("");
        setReady(false);
        setChecking(false);
      }
    };

    void resolveRecoveryIdentity();
    return () => {
      mounted = false;
    };
  }, [searchParams]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const desiredEmail = normalizeEmail(emailDraft);
    if (!recoveryEmail) {
      setError("Aktivasyon bağlantısına bağlı hesap doğrulanamadı.");
      return;
    }
    if (!validEmail(desiredEmail)) {
      setError("Geçerli bir e-posta adresi gir.");
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
        throw new Error("Aktivasyon bağlantısının bağlı olduğu hesap değişti. Lütfen e-postadaki bağlantıyı yeniden aç.");
      }

      const emailChanged = desiredEmail !== recoveryEmail;
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        ...(emailChanged ? { email: desiredEmail } : {}),
      });
      if (updateError) throw updateError;

      router.replace(emailChanged ? "/account?email-change=pending" : "/account");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Hesap aktifleştirilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEmailEditing = () => {
    setError(null);
    setEditingEmail((current) => {
      if (current) setEmailDraft(recoveryEmail);
      return !current;
    });
  };

  return (
    <div className="min-h-screen bg-carbon px-4 pb-24 pt-28 md:px-8 md:pt-32 text-cream">
      <div className="mx-auto max-w-md rounded-2xl border border-kraft/35 bg-carbon-soft p-6 shadow-sm md:p-8">
        <p className="mb-3 text-xs uppercase tracking-wide-luxe text-brick">ROSTA Coffee</p>
        <h1 className="font-heading text-4xl">Hesabını Aktifleştir</h1>
        <p className="mt-3 text-sm leading-7 text-cream/70">
          ROSTA hesabını etkinleştirmek için yeni şifreni belirle. Hesabına bağlı sipariş ve ROSTA Points bilgilerin erişilebilir kalır.
        </p>

        {checking ? (
          <div className="mt-8 flex items-center gap-3 rounded-xl border border-kraft/35 bg-carbon p-4 text-sm text-cream/70" role="status" aria-busy="true">
            <LoadingIndicator size="sm" /> Bağlantı doğrulanıyor…
          </div>
        ) : !ready ? (
          <div className="mt-8 rounded-xl border border-[var(--ruth-color-danger)]/40 bg-[var(--ruth-color-danger-soft)] p-4 text-sm leading-6 text-[var(--ruth-color-danger-text)]">
            {error || "Bu hesap aktivasyon bağlantısının süresi dolmuş veya bağlantı daha önce kullanılmış."}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="text-xs uppercase tracking-wide-luxe text-cream/70">E-posta</span>
                <button
                  type="button"
                  onClick={toggleEmailEditing}
                  className="text-[11px] font-medium uppercase tracking-wide-luxe text-brick underline-offset-4 focus-visible:underline"
                >
                  {editingEmail ? "Vazgeç" : "Değiştir"}
                </button>
              </div>
              <input
                required
                type="email"
                autoComplete="email"
                readOnly={!editingEmail}
                aria-readonly={!editingEmail}
                value={emailDraft}
                onChange={(event) => setEmailDraft(event.target.value)}
                className={editingEmail
                  ? "w-full rounded-lg border border-kraft/50 bg-carbon px-4 py-3 text-sm text-cream outline-none transition focus:border-brick-dark"
                  : "w-full cursor-not-allowed rounded-lg border border-transparent bg-carbon-soft px-4 py-3 text-sm text-cream/70 outline-none"}
              />
              {editingEmail ? (
                <p className="mt-2 text-xs leading-5 text-cream/70">
                  Yeni e-posta adresi aynı hesabına bağlanır. Güvenlik ayarına göre yeni adrese doğrulama e-postası gönderilebilir.
                </p>
              ) : null}
            </div>

            <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">
              Yeni Şifre
              <input
                required
                type="password"
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick-dark"
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
                className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick-dark"
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
              {saving ? "Kaydediliyor" : "Hesabımı Aktifleştir"}
              {!saving ? <ArrowRight size={15} /> : null}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
