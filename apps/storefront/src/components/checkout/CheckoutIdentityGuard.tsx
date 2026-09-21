"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@ruth-commerce/ui";
import { useAuth } from "@/components/auth/AuthProvider";

type IdentityMatchResponse = {
  ok?: boolean;
  matched?: boolean;
};

type IdentityNotice = {
  email: string;
  fingerprint: string;
};

function checkoutContact(form: HTMLFormElement) {
  const emailInput = form.querySelector<HTMLInputElement>('input[type="email"], input[autocomplete="email"]');
  const phoneInput = form.querySelector<HTMLInputElement>('input[type="tel"], input[autocomplete="tel"]');
  const email = emailInput?.value.trim().toLowerCase() || "";
  const phone = phoneInput?.value.trim() || "";
  const phoneDigits = phone.replace(/\D/g, "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phoneDigits.length < 10) return null;
  return {
    email,
    phone,
    fingerprint: `${email}|${phoneDigits}`,
  };
}

export function CheckoutIdentityGuard() {
  const { user } = useAuth();
  const [notice, setNotice] = useState<IdentityNotice | null>(null);
  const pendingFormRef = useRef<HTMLFormElement | null>(null);
  const bypassNextSubmitRef = useRef(false);
  const checkingRef = useRef(false);
  const approvedFingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    if (user) {
      setNotice(null);
      pendingFormRef.current = null;
      return;
    }

    const continueSubmission = (form: HTMLFormElement, fingerprint: string) => {
      approvedFingerprintRef.current = fingerprint;
      bypassNextSubmitRef.current = true;
      window.setTimeout(() => form.requestSubmit(), 0);
    };

    const handleSubmit = async (event: SubmitEvent) => {
      if (bypassNextSubmitRef.current) {
        bypassNextSubmitRef.current = false;
        return;
      }

      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const contact = checkoutContact(form);
      if (!contact || approvedFingerprintRef.current === contact.fingerprint) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const response = await fetch("/api/checkout/identity-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ email: contact.email, phone: contact.phone }),
        });
        const data = await response.json().catch(() => ({})) as IdentityMatchResponse;

        if (!response.ok || !data.ok || !data.matched) {
          continueSubmission(form, contact.fingerprint);
          return;
        }

        pendingFormRef.current = form;
        setNotice({
          email: contact.email,
          fingerprint: contact.fingerprint,
        });
      } catch {
        // Kimlik uyarısı ödeme akışını engellemez.
        continueSubmission(form, contact.fingerprint);
      } finally {
        checkingRef.current = false;
      }
    };

    document.addEventListener("submit", handleSubmit, true);
    return () => document.removeEventListener("submit", handleSubmit, true);
  }, [user]);

  if (!notice || user) return null;

  const continueAsGuest = () => {
    const form = pendingFormRef.current;
    const fingerprint = notice.fingerprint;
    setNotice(null);
    pendingFormRef.current = null;
    if (!form) return;
    approvedFingerprintRef.current = fingerprint;
    bypassNextSubmitRef.current = true;
    window.setTimeout(() => form.requestSubmit(), 0);
  };

  const goToLogin = () => {
    const redirect = `${window.location.pathname}${window.location.search}`;
    const loginUrl = `/login?redirect=${encodeURIComponent(redirect)}&email=${encodeURIComponent(notice.email)}`;
    window.location.assign(loginUrl);
  };

  return (
    <ConfirmDialog
      open
      title="Bu iletişim bilgileri daha önce kullanılmış"
      description="Bu e-posta veya telefonla daha önce sipariş verilmiş ya da bir hesap oluşturulmuş olabilir. Giriş yaparak siparişlerini hesabından takip edebilirsin. Üyeliksiz devam edersen yeni siparişin aynı müşteri kaydına otomatik olarak eklenecek."
      confirmLabel="Giriş Yap"
      cancelLabel="Üyeliksiz Devam Et"
      onConfirm={goToLogin}
      onClose={continueAsGuest}
    />
  );
}
