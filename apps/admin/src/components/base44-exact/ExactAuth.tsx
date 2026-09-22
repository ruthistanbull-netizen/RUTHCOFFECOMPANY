"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowser, setAdminRememberSession } from "@/lib/supabaseBrowser";
import { ExactButton, ExactField, exactFormInputClass } from "./primitives";

type AuthMode = "login" | "forgot" | "reset";

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
        if (data.session) router.replace("/");
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
      } catch {
        // PASSWORD_RECOVERY olayı URL oturumu işlendiğinde yine gelebilir.
      }

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
      setError("Supabase bağlantısı hazırlanamadı.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "login") {
        // Storage choice must be set before Supabase writes the new auth token.
        // Without this option the session stays scoped to the current PWA/browser
        // session; with it enabled the token is durably persisted on this device.
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
          throw new Error(result.error || "Bu hesap için admin yetkisi bulunamadı.");
        }

        // This is only a UI fast-path marker. A full storage bucket must never
        // turn a successful authentication into a login error.
        try {
          const target = rememberSession ? window.localStorage : window.sessionStorage;
          const other = rememberSession ? window.sessionStorage : window.localStorage;
          target.setItem("ruth_admin_next_checked_until", String(Date.now() + 15 * 60 * 1000));
          other.removeItem("ruth_admin_next_checked_until");
        } catch {}

        router.replace("/");
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
      setNotice("Şifren güncellendi. Yeni şifrenle panele giriş yapabilirsin.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kimlik doğrulama işlemi tamamlanamadı.");
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login"
    ? "Control Room’a giriş yap"
    : mode === "forgot"
      ? "Şifreni yenile"
      : resetComplete
        ? "Şifren güncellendi"
        : "Yeni şifre oluştur";
  const subtitle = mode === "login"
    ? "Ruth Commerce operasyon paneli"
    : mode === "forgot"
      ? "Yenileme bağlantısını e-posta adresine göndereceğiz."
      : resetComplete
        ? "Yeni şifren artık kullanıma hazır."
        : "Hesabın için güvenli bir şifre belirle.";

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.05fr_.95fr] bg-background" data-exact-base44-auth={mode}>
      <section className="hidden lg:flex relative overflow-hidden bg-gradient-to-br from-[#8F6E1F] via-[#C9A23A] to-[#5F4814] p-12 text-white">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-white/20 blur-3xl animate-orb-breathe" />
          <div className="absolute bottom-12 right-0 h-96 w-96 rounded-full bg-[#E6D28B]/25 blur-3xl animate-orb-deform" />
        </div>
        <div className="relative z-10 flex flex-col justify-between w-full max-w-xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-11 w-11 rounded-[14px] bg-white/15 border border-white/20 backdrop-blur"><span className="font-bold text-lg">R</span></div>
            <div><p className="font-bold text-lg">Ruth Commerce</p><p className="text-xs text-white/65">Control Room</p></div>
          </div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs backdrop-blur"><Sparkles className="h-3.5 w-3.5" /> Yeni nesil ticaret operasyonu</div>
            <h1 className="mt-6 text-5xl font-bold tracking-tight leading-[1.05]">Satıştan teslimata<br />tek kontrol alanı.</h1>
            <p className="mt-5 text-base leading-relaxed text-white/70 max-w-lg">Sipariş, ödeme, üretim, stok, müşteri ve Ruthie AI operasyonlarını güvenli bir panelden yönet.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[{ icon: ShieldCheck, label: "RBAC ve güvenli oturum" }, { icon: KeyRound, label: "Denetimli kritik işlemler" }, { icon: Sparkles, label: "Ruthie AI desteği" }].map((item) => (
              <div key={item.label} className="rounded-[18px] border border-white/12 bg-white/8 p-3 backdrop-blur">
                <item.icon className="h-4 w-4 mb-2" />
                <p className="text-[11px] leading-snug text-white/75">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-5 md:p-10">
        <div className="w-full max-w-md animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="flex items-center justify-center h-10 w-10 radius-small bg-accent text-white font-bold">R</div>
            <div><p className="font-bold text-main">Ruth Commerce</p><p className="text-[10px] text-subtle">Control Room</p></div>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-center h-12 w-12 radius-control bg-accent-soft text-accent mb-5">
              {resetComplete ? <CheckCircle2 className="h-6 w-6" /> : mode === "login" ? <LockKeyhole className="h-6 w-6" /> : mode === "forgot" ? <Mail className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-main">{title}</h2>
            <p className="text-sm text-muted mt-2">{subtitle}</p>
          </div>

          {checkingRecovery ? <div className="radius-control border border-info/20 bg-info-soft px-4 py-3 text-xs text-info-foreground mb-4">Güvenli sıfırlama bağlantısı doğrulanıyor…</div> : null}
          {error ? <div className="radius-control border border-danger/20 bg-danger-soft px-4 py-3 text-xs text-danger-foreground mb-4">{error}</div> : null}
          {notice ? <div className="radius-control border border-success/20 bg-success-soft px-4 py-3 text-xs text-success-foreground mb-4">{notice}</div> : null}

          {sent ? (
            <div className="radius-card border border-success/20 bg-success-soft p-5">
              <ShieldCheck className="h-7 w-7 text-success-foreground" />
              <h3 className="font-semibold text-main mt-3">E-postanı kontrol et</h3>
              <p className="text-sm text-muted mt-1">Şifre yenileme bağlantısı {email} adresine gönderildi.</p>
              <Link href="/login" className="mt-4 inline-flex"><ExactButton size="sm">Giriş ekranına dön <ArrowRight className="h-4 w-4" /></ExactButton></Link>
            </div>
          ) : resetComplete ? (
            <div className="radius-card border border-success/20 bg-success-soft p-5">
              <CheckCircle2 className="h-7 w-7 text-success-foreground" />
              <h3 className="font-semibold text-main mt-3">Yeni şifre kaydedildi</h3>
              <p className="text-sm text-muted mt-1">Eski şifren artık geçerli değil.</p>
              <Link href="/login" className="mt-4 inline-flex"><ExactButton size="sm">Giriş ekranına dön <ArrowRight className="h-4 w-4" /></ExactButton></Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {mode !== "reset" ? (
                <ExactField label="E-posta adresi" required>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" />
                    <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={`${exactFormInputClass} pl-10`} placeholder="admin@ruthistanbul.com" required disabled={loading} />
                  </div>
                </ExactField>
              ) : null}

              {mode !== "forgot" && (mode !== "reset" || recoveryReady) ? (
                <ExactField label={mode === "reset" ? "Yeni şifre" : "Şifre"} required>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" />
                    <input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className={`${exactFormInputClass} pl-10 pr-10`} minLength={mode === "reset" ? 8 : undefined} required disabled={loading} />
                    <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-main" aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                </ExactField>
              ) : null}

              {mode === "reset" && recoveryReady ? (
                <ExactField label="Yeni şifreyi doğrula" required>
                  <input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={exactFormInputClass} minLength={8} required disabled={loading} />
                </ExactField>
              ) : null}

              {mode === "login" ? (
                <div className="flex items-center justify-between gap-4">
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-xs font-medium text-muted">
                    <input
                      type="checkbox"
                      checked={rememberSession}
                      onChange={(event) => setRememberSession(event.target.checked)}
                      disabled={loading}
                      className="h-4 w-4 rounded border-border-strong accent-[hsl(var(--accent))]"
                    />
                    <span>Oturumu açık tut</span>
                  </label>
                  <Link href="/forgot-password" className="text-xs font-medium text-accent hover:underline">Şifremi unuttum</Link>
                </div>
              ) : null}

              {(mode !== "reset" || recoveryReady) ? (
                <ExactButton type="submit" size="lg" className="w-full" loading={loading}>
                  {mode === "login" ? "Giriş yap" : mode === "forgot" ? "Yenileme bağlantısı gönder" : "Yeni şifreyi kaydet"}
                  <ArrowRight className="h-4 w-4" />
                </ExactButton>
              ) : null}

              {mode === "reset" && !checkingRecovery && !recoveryReady ? (
                <Link href="/forgot-password" className="block"><ExactButton type="button" size="lg" className="w-full">Yeni bağlantı iste <ArrowRight className="h-4 w-4" /></ExactButton></Link>
              ) : null}

              {mode !== "login" ? <Link href="/login" className="block text-center text-xs font-medium text-muted hover:text-accent">Giriş ekranına dön</Link> : null}
            </form>
          )}

          <p className="text-[10px] text-subtle text-center mt-8">Yetkisiz erişim denemeleri ve kritik panel işlemleri denetim kayıtlarında saklanır.</p>
        </div>
      </section>
    </main>
  );
}
