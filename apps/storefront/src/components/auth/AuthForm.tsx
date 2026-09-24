"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRostaPointsSettings } from "@/lib/useRostaPointsSettings";

type AuthMode = "login" | "register";

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  termsAccepted: boolean;
  marketingEmailConsent: boolean;
};

const initialForm: FormState = {
  fullName: "",
  email: "",
  phone: "",
  password: "",
  termsAccepted: false,
  marketingEmailConsent: false,
};

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshSession } = useAuth();
  const rewardSettings = useRostaPointsSettings();
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = searchParams.get("redirect") || "/account";
  const isRegister = mode === "register";
  const isMigratedActivation = isRegister && searchParams.get("migrated") === "1";
  const isExistingAccountRedirect = !isRegister && searchParams.get("reason") === "account-exists";

  useEffect(() => {
    const emailFromLink = searchParams.get("email")?.trim() || "";
    if (emailFromLink) {
      setForm((current) => ({ ...current, email: current.email || emailFromLink }));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isExistingAccountRedirect) return;
    setMessage("Bu e-posta veya telefon numarası mevcut bir üyelikle eşleşiyor. Siparişine devam etmek için hesabına giriş yap.");
  }, [isExistingAccountRedirect]);

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const syncProfile = async (accessToken: string) => {
    await fetch("/api/account/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        fullName: form.fullName,
        phone: form.phone,
      }),
    });
  };

  const requestPasswordReset = async () => {
    const email = form.email.trim().toLocaleLowerCase("tr-TR");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Şifre yenileme bağlantısı için geçerli e-posta adresini yaz.");
      return;
    }

    setIsRecovering(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/password-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Şifre yenileme e-postası gönderilemedi.");
      }
      setMessage("Bu e-posta ile bir hesap varsa şifre yenileme bağlantısı gönderildi. Gelen kutusu ve spam klasörünü kontrol et.");
    } catch {
      setMessage("Bu e-posta ile bir hesap varsa şifre yenileme bağlantısı gönderildi. Gelen kutusu ve spam klasörünü kontrol et.");
    } finally {
      setIsRecovering(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowser();

      if (isRegister) {
        if (form.password.length < 6) {
          throw new Error("Şifre en az 6 karakter olmalı.");
        }

        const registerResponse = await fetch("/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName: form.fullName,
            phone: form.phone,
            email: form.email,
            password: form.password,
            termsAccepted: form.termsAccepted,
            marketingEmailConsent: form.marketingEmailConsent,
          }),
        });

        const registerData = await registerResponse.json();
        if (!registerResponse.ok || !registerData.ok) {
          throw new Error(registerData.error || "Kayıt oluşturulamadı.");
        }

        const { data, error: signInAfterRegisterError } = await supabase.auth.signInWithPassword({
          email: form.email.trim().toLowerCase(),
          password: form.password,
        });

        if (signInAfterRegisterError) throw signInAfterRegisterError;

        if (data.session?.access_token) {
          await syncProfile(data.session.access_token);
        }

        await refreshSession();
        router.push(redirectTo);
        router.refresh();
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (signInError) throw new Error("E-posta veya şifre hatalı.");

      if (data.session?.access_token) {
        await syncProfile(data.session.access_token);
      }

      await refreshSession();
      router.push(redirectTo);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "İşlem tamamlanamadı.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-carbon px-4 pb-24 pt-28 md:px-8 md:pt-32">
      <div className="mx-auto max-w-md rounded-2xl border border-kraft/35 bg-carbon-soft p-6 shadow-sm md:p-8">
        <p className="mb-3 text-xs uppercase tracking-wide-luxe text-brick">
          ROSTA Coffee
        </p>
        <h1 className="font-heading text-4xl">
          {isMigratedActivation ? "Yeni Şifreni Oluştur" : isRegister ? "Kayıt Ol" : "Giriş Yap"}
        </h1>
        <p className="mt-3 text-sm leading-7 text-cream/70">
          {isMigratedActivation
            ? "Önceki üyeliğinde kullandığın e-posta adresiyle yeni şifreni belirle. Mevcut müşteri kaydın ve geçmiş siparişlerin korunur."
            : isRegister
              ? `Hesap oluştur, siparişlerini takip et ve ${rewardSettings.signupPoints.toLocaleString("tr-TR")} ROSTA Points avantajını aktifleştir.`
              : "Hesabına gir, siparişlerini ve bilgilerini görüntüle."}
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          {isRegister && (
            <>
              <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">
                Ad Soyad
                <input
                  required
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(event) => updateField("fullName", event.target.value)}
                  className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick"
                />
              </label>

              <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">
                Telefon
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick"
                />
              </label>
            </>
          )}

          <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">
            E-posta
            <input
              required
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick"
            />
          </label>

          <label className="block text-xs uppercase tracking-wide-luxe text-cream/70">
            Şifre
            <input
              required
              type="password"
              minLength={6}
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={form.password}
              onChange={(event) => updateField("password", event.target.value)}
              className="mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick"
            />
          </label>

          {!isRegister ? (
            <button
              type="button"
              onClick={() => void requestPasswordReset()}
              disabled={isRecovering}
              className="text-sm text-cream underline underline-offset-4 disabled:opacity-60"
            >
              {isRecovering ? "Bağlantı gönderiliyor…" : "Şifremi unuttum"}
            </button>
          ) : null}

          {isRegister && (
            <div className="space-y-3 rounded-xl border border-kraft/35 bg-carbon p-4 text-xs normal-case tracking-normal text-cream/70">
              <label className="flex items-start gap-3">
                <input required type="checkbox" checked={form.termsAccepted} onChange={(event) => updateField("termsAccepted", event.target.checked)} className="mt-1" />
                <span><Link className="underline" href="/terms" target="_blank">Kullanım Şartları</Link>, <Link className="underline" href="/kvkk" target="_blank">KVKK Aydınlatma Metni</Link> ve <Link className="underline" href="/privacy-policy" target="_blank">Gizlilik Politikası</Link>’nı okudum ve kabul ediyorum.</span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={form.marketingEmailConsent} onChange={(event) => updateField("marketingEmailConsent", event.target.checked)} className="mt-1" />
                <span>İndirim ve kampanya e-postaları almak için <Link className="underline" href="/commercial-communication-consent" target="_blank">Elektronik Ticari İleti Onay Metni</Link> kapsamında isteğe bağlı onay veriyorum.</span>
              </label>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-[var(--ruth-color-danger)]/40 bg-[var(--ruth-color-danger-soft)] px-4 py-3 text-sm text-[var(--ruth-color-danger-text)]">
              {error}
            </div>
          )}

          {message && (
            <div aria-live="polite" className="rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm leading-6 text-cream/70">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting || undefined}
            className="flex w-full items-center justify-center gap-2 bg-brick px-8 py-4 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] transition active:bg-espresso disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <LoadingIndicator size="sm" /> : null}
            {isMigratedActivation ? "Hesabımı Aktifleştir" : isRegister ? "Hesap Oluştur" : "Giriş Yap"}
            {!isSubmitting ? <ArrowRight size={15} /> : null}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-cream/70">
          {isRegister ? (
            <>
              Zaten hesabın var mı?{" "}
              <Link href={`/login?redirect=${encodeURIComponent(redirectTo)}`} className="text-cream underline underline-offset-4">
                Giriş yap
              </Link>
            </>
          ) : (
            <>
              Hesabın yok mu?{" "}
              <Link href={`/register?redirect=${encodeURIComponent(redirectTo)}`} className="text-cream underline underline-offset-4">
                Kayıt ol
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}