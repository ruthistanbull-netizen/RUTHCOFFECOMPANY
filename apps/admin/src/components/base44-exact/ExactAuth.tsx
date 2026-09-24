"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowser, setAdminRememberSession } from "@/lib/supabaseBrowser";

type AuthMode = "login" | "forgot" | "reset";
const PROFILE_NAME_KEY = "rr_hub_profile_name";

export function ExactAuth({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(mode === "reset");
  const [recoveryReady, setRecoveryReady] = useState(mode !== "reset");
  const [resetComplete, setResetComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    if (mode === "login") {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) router.replace("/profiles");
      });
      return;
    }

    if (mode !== "reset") return;

    let active = true;
    let settled = false;
    const search = new URLSearchParams(window.location.search);
    const recoveryInUrl = window.location.hash.includes("type=recovery")
      || search.has("code")
      || search.get("type") === "recovery";

    const acceptRecovery = () => {
      if (!active) return;
      settled = true;
      setRecoveryReady(true);
      setCheckingRecovery(false);
      setError(null);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) acceptRecovery();
    });

    void (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (recoveryInUrl && data.session) {
          acceptRecovery();
          return;
        }
      } catch {}

      window.setTimeout(async () => {
        if (!active || settled) return;
        const { data } = await supabase.auth.getSession();
        if (recoveryInUrl && data.session) {
          acceptRecovery();
          return;
        }
        setCheckingRecovery(false);
        setRecoveryReady(false);
        setError("Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı iste.");
      }, 1400);
    })();

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [mode, router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Bağlantı hazırlanamadı.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "login") {
        setAdminRememberSession(rememberSession);

        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLocaleLowerCase("tr-TR"),
          password,
        });
        if (signInError) throw signInError;

        const response = await fetch("/api/me", {
          headers: { Authorization: `Bearer ${data.session?.access_token || ""}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          await supabase.auth.signOut();
          setAdminRememberSession(false);
          throw new Error(result.error || "Bu hesap için yönetim erişimi bulunamadı.");
        }

        try {
          const target = rememberSession ? window.localStorage : window.sessionStorage;
          const other = rememberSession ? window.sessionStorage : window.localStorage;
          target.setItem("ruth_admin_next_checked_until", String(Date.now() + 15 * 60 * 1000));
          other.removeItem("ruth_admin_next_checked_until");

          const profileName = String(result?.profile?.full_name || "").trim();
          if (profileName) {
            target.setItem(PROFILE_NAME_KEY, profileName);
            other.removeItem(PROFILE_NAME_KEY);
          }
        } catch {}

        try { window.sessionStorage.removeItem("rosta_panel_hub_entered_v1"); } catch {}
        router.replace("/profiles");
        router.refresh();
        return;
      }

      if (mode === "forgot") {
        const normalizedEmail = email.trim().toLocaleLowerCase("tr-TR");
        const response = await fetch("/api/auth/password-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: normalizedEmail, target: "admin" }),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || "Şifre yenileme e-postası gönderilemedi.");
        }
        setSent(true);
        setNotice("Şifre yenileme bağlantısı e-posta adresine gönderildi.");
        return;
      }

      if (!recoveryReady) throw new Error("Geçerli bir şifre sıfırlama oturumu bulunamadı.");
      if (password.length < 8) throw new Error("Yeni şifre en az 8 karakter olmalı.");
      if (password !== confirmPassword) throw new Error("Yeni şifreler eşleşmiyor.");

      const passwordAttributes = { password } as unknown as Parameters<typeof supabase.auth.updateUser>[0];
      const { error: updateError } = await supabase.auth.updateUser(passwordAttributes);
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      setResetComplete(true);
      setRecoveryReady(false);
      setPassword("");
      setConfirmPassword("");
      setNotice("Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kimlik doğrulama işlemi tamamlanamadı.");
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login"
    ? "Oturum aç"
    : mode === "forgot"
      ? "Şifrenizi yenileyin"
      : resetComplete
        ? "Şifreniz güncellendi"
        : "Yeni şifre oluşturun";

  const subtitle = mode === "login"
    ? "ROSTA Coffee Co. ve Ruth Istanbul çalışma alanlarına erişin."
    : mode === "forgot"
      ? "Yenileme bağlantısını e-posta adresinize göndereceğiz."
      : resetComplete
        ? "Yeni şifreniz kullanıma hazır."
        : "Hesabınız için yeni bir şifre belirleyin.";

  const fieldClass =
    "h-[54px] w-full rounded-[4px] border border-border-subtle bg-surface-secondary px-4 text-[15px] text-main outline-none transition placeholder:text-subtle focus:border-accent focus:bg-surface-secondary focus:ring-2 focus:ring-accent/15 disabled:opacity-50";

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-background text-main" data-exact-base44-auth={mode}>
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
        <div className="w-full max-w-[450px] rounded-[8px] border border-border-subtle bg-surface-primary/95 px-6 py-8 shadow-[0_30px_80px_rgba(0,0,0,.38)] backdrop-blur-[6px] sm:px-14 sm:py-12">
          <div className="mb-8">
            <img
              src="/rr-hub-cream.svg"
              alt="RR HUB"
              draggable={false}
              className="mx-auto mb-8 h-auto w-[184px] select-none object-contain sm:w-[210px]"
            />
            <h1 className="text-[30px] font-bold tracking-[-0.035em] text-[#FBF3E6] sm:text-[34px]">{title}</h1>
            <p className="mt-2 text-[12px] leading-relaxed text-[#FBF3E6]/46 sm:text-[13px]">{subtitle}</p>
          </div>

          {checkingRecovery ? (
            <div className="mb-4 rounded-[4px] border border-border-subtle bg-surface-secondary px-4 py-3 text-[12px] text-muted">
              Güvenli bağlantı doğrulanıyor…
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-[4px] border border-[var(--ruth-color-danger)]/45 bg-[var(--ruth-color-danger-soft)] px-4 py-3 text-[12px] leading-relaxed text-[var(--ruth-color-danger-text)]">
              {error}
            </div>
          ) : null}

          {notice ? (
            <div className="mb-4 rounded-[4px] border border-border-subtle bg-surface-secondary px-4 py-3 text-[12px] leading-relaxed text-muted">
              {notice}
            </div>
          ) : null}

          {sent ? (
            <div>
              <p className="text-[15px] leading-relaxed text-muted">
                Şifre yenileme bağlantısı <strong className="font-medium text-white">{email}</strong> adresine gönderildi.
              </p>
              <Link href="/login" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-[4px] bg-accent text-[14px] font-semibold text-[var(--rosta-action-text)] transition active:scale-[0.985] active:bg-[var(--rosta-espresso)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Giriş ekranına dön
              </Link>
            </div>
          ) : resetComplete ? (
            <div>
              <p className="text-[15px] leading-relaxed text-muted">Yeni şifreniz kaydedildi.</p>
              <Link href="/login" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-[4px] bg-accent text-[14px] font-semibold text-[var(--rosta-action-text)] transition active:scale-[0.985] active:bg-[var(--rosta-espresso)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                Giriş ekranına dön
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {mode !== "reset" ? (
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={fieldClass}
                  placeholder="E-posta adresi"
                  required
                  disabled={loading}
                />
              ) : null}

              {mode !== "forgot" && (mode !== "reset" || recoveryReady) ? (
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={`${fieldClass} pr-12`}
                    placeholder={mode === "reset" ? "Yeni şifre" : "Şifre"}
                    minLength={mode === "reset" ? 8 : undefined}
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-subtle transition active:scale-90 active:bg-surface-tertiary focus-visible:bg-surface-tertiary focus-visible:text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              ) : null}

              {mode === "reset" && recoveryReady ? (
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={fieldClass}
                  placeholder="Yeni şifreyi doğrulayın"
                  minLength={8}
                  required
                  disabled={loading}
                />
              ) : null}

              {mode === "login" ? (
                <div className="flex items-center justify-between gap-4 pt-0.5">
                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[12px] text-white/58">
                    <input
                      type="checkbox"
                      checked={rememberSession}
                      onChange={(event) => setRememberSession(event.target.checked)}
                      disabled={loading}
                      className="h-4 w-4 rounded border-white/35 bg-transparent accent-[#C94A40]"
                    />
                    <span>Oturumu açık tut</span>
                  </label>
                  <Link href="/forgot-password" className="text-[12px] text-muted transition focus-visible:text-main focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    Şifremi unuttum
                  </Link>
                </div>
              ) : null}

              {(mode !== "reset" || recoveryReady) ? (
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 flex h-[48px] w-full touch-manipulation select-none items-center justify-center rounded-[4px] bg-accent text-[14px] font-bold text-[var(--rosta-action-text)] transition-[transform,background,filter] duration-150 active:scale-[0.965] active:bg-[var(--rosta-espresso)] disabled:cursor-wait disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [-webkit-tap-highlight-color:transparent]"
                >
                  {loading
                    ? "Kontrol ediliyor…"
                    : mode === "login"
                      ? "Giriş Yap"
                      : mode === "forgot"
                        ? "Bağlantıyı Gönder"
                        : "Şifreyi Kaydet"}
                </button>
              ) : null}

              {mode === "reset" && !checkingRecovery && !recoveryReady ? (
                <Link href="/forgot-password" className="flex h-[48px] w-full items-center justify-center rounded-[4px] bg-white text-[14px] font-bold text-black transition active:scale-[0.98]">
                  Yeni bağlantı iste
                </Link>
              ) : null}

              {mode !== "login" ? (
                <Link href="/login" className="block pt-2 text-center text-[12px] text-subtle transition focus-visible:text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  Giriş ekranına dön
                </Link>
              ) : null}
            </form>
          )}

          <p className="mt-8 text-center text-[10px] leading-relaxed tracking-[0.03em] text-subtle">
            RR HUB · Güvenli yönetim erişimi
          </p>
        </div>
      </section>
    </main>
  );
}
