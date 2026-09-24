"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type PrivacyState = {
  marketingEmailConsent: boolean;
  deletionRequest?: { status: string; requested_at?: string | null } | null;
};

export function AccountPrivacyClient() {
  const { user, session, isLoading } = useAuth();
  const [state, setState] = useState<PrivacyState | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const request = async (method: "GET" | "PATCH" | "POST", body?: Record<string, unknown>) => {
    if (!session?.access_token) throw new Error("Oturum gerekli.");
    const response = await fetch("/api/account/privacy", {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || "İşlem tamamlanamadı.");
    return result;
  };

  useEffect(() => {
    if (!session?.access_token) return;
    void request("GET")
      .then((result) => setState({ marketingEmailConsent: Boolean(result.marketingEmailConsent), deletionRequest: result.deletionRequest || null }))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Tercihler alınamadı."));
  }, [session?.access_token]);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-carbon text-cream" role="status" aria-busy="true"><LoadingIndicator size="md" label="Hesap gizliliği yükleniyor" /></div>;
  if (!user) return <div className="min-h-screen bg-carbon px-4 pt-32 text-center text-cream"><p>Bu alanı görmek için giriş yapmalısın.</p><Link className="mt-5 inline-block underline" href="/login?redirect=/account/privacy">Giriş yap</Link></div>;

  const updateConsent = async (next: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request("PATCH", { marketingEmailConsent: next });
      setState((current) => current ? { ...current, marketingEmailConsent: next } : { marketingEmailConsent: next });
      setNotice(next ? "Kampanya e-postası onayın açıldı." : "Kampanya e-postası onayın geri çekildi.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tercih güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const requestDeletion = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await request("POST", { confirmation });
      setState((current) => ({ marketingEmailConsent: false, deletionRequest: result.deletionRequest || current?.deletionRequest || null }));
      setNotice("Hesap silme talebin alındı. Yasal saklama yükümlülüğü bulunan sipariş ve fatura kayıtları ayrıştırılarak talep incelenecek.");
      setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Silme talebi oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-carbon px-4 pb-24 pt-32 md:px-8 text-cream">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide-luxe text-brick">Hesap gizliliği</p>
          <h1 className="mt-3 font-heading text-4xl">İletişim ve veri tercihleri</h1>
          <p className="mt-4 text-sm leading-7 text-cream/70">Pazarlama iznini dilediğin zaman değiştirebilir veya hesabının silinmesini talep edebilirsin.</p>
        </div>

        {error ? <div role="alert" className="rounded-xl border border-[var(--ruth-color-danger)]/40 bg-[var(--ruth-color-danger-soft)] p-4 text-sm text-[var(--ruth-color-danger-text)]">{error}</div> : null}
        {notice ? <div aria-live="polite" className="rounded-xl border border-kraft/40 bg-carbon-soft p-4 text-sm text-cream">{notice}</div> : null}

        <section className="rounded-2xl border border-kraft/35 bg-carbon-soft p-6">
          <div className="flex items-start gap-4"><ShieldCheck className="mt-1 text-brick" /><div><h2 className="font-heading text-2xl">Kampanya e-postaları</h2><p className="mt-2 text-sm leading-6 text-cream/70">Sipariş ve kargo gibi zorunlu hizmet mesajları devam eder. Bu tercih yalnız indirim ve kampanya e-postalarını yönetir.</p></div></div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" disabled={busy || state?.marketingEmailConsent === true} onClick={() => void updateConsent(true)} className="rounded-full bg-brick px-5 py-3 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] disabled:opacity-40">Onay ver</button>
            <button type="button" disabled={busy || state?.marketingEmailConsent === false} onClick={() => void updateConsent(false)} className="rounded-full border border-kraft/40 px-5 py-3 text-xs uppercase tracking-wide-luxe text-cream disabled:opacity-40">Onayı geri çek</button>
          </div>
          <p className="mt-4 text-sm text-cream/70">Mevcut durum: <strong className="text-cream">{state?.marketingEmailConsent ? "İzin var" : "İzin yok"}</strong></p>
        </section>

        <section className="rounded-2xl border border-[var(--ruth-color-danger)]/40 bg-[var(--ruth-color-danger-soft)]/70 p-6">
          <h2 className="font-heading text-2xl">Hesap silme talebi</h2>
          {state?.deletionRequest && ["requested", "reviewing"].includes(state.deletionRequest.status) ? (
            <p className="mt-3 text-sm leading-6 text-[var(--ruth-color-danger-text)]">Silme talebin alındı ve inceleniyor. Yeni bir talep oluşturman gerekmiyor.</p>
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-[var(--ruth-color-danger-text)]">Talebi doğrulamak için aşağıya <strong>HESABIMI SİL</strong> yaz. Sipariş, fatura, ödeme ve hukuki yükümlülük kapsamındaki kayıtlar gereken süre boyunca saklanabilir.</p>
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="HESABIMI SİL" className="mt-5 w-full rounded-lg border border-[var(--ruth-color-danger)]/40 bg-carbon-soft px-4 py-3 text-sm" />
              <button type="button" disabled={busy || confirmation.trim().toLocaleUpperCase("tr-TR") !== "HESABIMI SİL"} onClick={() => void requestDeletion()} className="mt-4 rounded-full bg-[var(--ruth-color-danger)] px-5 py-3 text-xs uppercase tracking-wide-luxe text-white disabled:opacity-40">Silme talebi oluştur</button>
            </>
          )}
        </section>

        <Link href="/account" className="inline-flex text-sm underline underline-offset-4">Hesabıma dön</Link>
      </div>
    </main>
  );
}
