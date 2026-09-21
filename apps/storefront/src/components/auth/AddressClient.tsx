"use client";

import Link from "next/link";
import { LogOut, MapPin, Plus, Star, Trash2, UserRound, X } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type AccountAddress = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  city: string;
  district: string;
  neighborhood: string | null;
  address_line: string;
  postal_code: string | null;
  is_default: boolean | null;
  created_at: string;
};

type AddressForm = {
  fullName: string;
  phone: string;
  email: string;
  city: string;
  district: string;
  neighborhood: string;
  addressLine: string;
  postalCode: string;
};

const initialForm: AddressForm = {
  fullName: "",
  phone: "",
  email: "",
  city: "",
  district: "",
  neighborhood: "",
  addressLine: "",
  postalCode: "",
};

export function AddressClient() {
  const { user, session, isLoading, signOut } = useAuth();
  const [addresses, setAddresses] = useState<AccountAddress[]>([]);
  const [form, setForm] = useState<AddressForm>(initialForm);
  const [formOpen, setFormOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAddressAction, setPendingAddressAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = () => ({
    Authorization: `Bearer ${session?.access_token}`,
  });

  const loadAddresses = async (showInitialLoading = false) => {
    if (!session?.access_token) return;

    if (showInitialLoading) setIsFetching(true);
    setError(null);

    try {
      const response = await fetch("/api/account/addresses", {
        headers: authHeaders(),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Adresler alınamadı.");
      }

      setAddresses(data.addresses || []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Adresler alınamadı.");
    } finally {
      if (showInitialLoading) setIsFetching(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;

    if (!session?.access_token) {
      setIsFetching(false);
      return;
    }

    void loadAddresses(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, session?.access_token]);

  useEffect(() => {
    if (!user) return;

    setForm((current) => ({
      ...current,
      fullName: current.fullName || String(user.user_metadata?.full_name || ""),
      email: current.email || user.email || "",
      phone: current.phone || String(user.user_metadata?.phone || ""),
    }));
  }, [user]);

  const updateField = (field: keyof AddressForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const addAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.access_token || isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/account/addresses", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Adres eklenemedi.");
      }

      setForm((current) => ({
        ...initialForm,
        fullName: current.fullName,
        phone: current.phone,
        email: current.email,
      }));
      setFormOpen(false);
      await loadAddresses(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Adres eklenemedi.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAddress = async (id: string) => {
    if (!session?.access_token || pendingAddressAction) return;
    setError(null);
    setPendingAddressAction(`delete:${id}`);

    try {
      const response = await fetch(`/api/account/addresses?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Adres silinemedi.");
      }

      await loadAddresses(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Adres silinemedi.");
    } finally {
      setPendingAddressAction(null);
    }
  };

  const makeDefault = async (id: string) => {
    if (!session?.access_token || pendingAddressAction) return;
    setError(null);
    setPendingAddressAction(`default:${id}`);

    try {
      const response = await fetch("/api/account/addresses", {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, isDefault: true }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Adres güncellenemedi.");
      }

      await loadAddresses(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Adres güncellenemedi.");
    } finally {
      setPendingAddressAction(null);
    }
  };

  if (isLoading || isFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory px-4 pt-20" role="status" aria-busy="true">
        <LoadingIndicator size="lg" className="text-gold-dark" label="Adresler yükleniyor" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ivory px-4 pt-20 text-center">
        <div className="max-w-md rounded-2xl border border-gold/15 bg-cream p-8">
          <UserRound className="mx-auto mb-5 text-gold-dark" size={34} />
          <h1 className="font-heading text-4xl">Giriş yapman gerekiyor</h1>
          <p className="mt-4 text-sm leading-7 text-muted-ruth">
            Adreslerini görmek için giriş yap.
          </p>
          <Link
            href="/login?redirect=/account/addresses"
            className="mt-7 inline-block bg-ink px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream"
          >
            Giriş Yap
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory px-4 pb-24 pt-28 md:px-8 md:pt-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs uppercase tracking-wide-luxe text-gold-dark">
              Hesabım
            </p>
            <h1 className="font-heading text-4xl md:text-5xl">Adreslerim</h1>
            <p className="mt-4 text-sm leading-7 text-muted-ruth">
              Siparişte kullandığın adresler burada otomatik kaydedilir. Istersen manuel adres de ekleyebilirsin.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/account"
              className="inline-flex items-center justify-center border border-gold/25 px-6 py-3 text-xs uppercase tracking-wide-luxe text-ink transition hover:bg-cream"
            >
              Hesabıma Dön
            </Link>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                window.location.href = "/";
              }}
              className="inline-flex items-center justify-center gap-2 border border-gold/25 px-6 py-3 text-xs uppercase tracking-wide-luxe text-ink transition hover:bg-cream"
            >
              <LogOut size={15} />
              Çıkış Yap
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-gold/15 bg-cream p-5 md:p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-heading text-sm uppercase tracking-wide-luxe">
              Kayıtlı Adresler
            </h2>
            <button
              type="button"
              onClick={() => setFormOpen((current) => !current)}
              className="inline-flex items-center justify-center gap-2 bg-ink px-6 py-3 text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark"
            >
              {formOpen ? <X size={15} /> : <Plus size={15} />}
              {formOpen ? "Kapat" : "Adres Ekle"}
            </button>
          </div>

          {formOpen && (
            <form onSubmit={addAddress} className="mb-6 rounded-xl border border-gold/10 bg-ivory p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Ad soyad<input required value={form.fullName} onChange={(event) => updateField("fullName", event.target.value)} className="mt-2 w-full rounded-xl border border-gold/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-dark" /></label>
                <label className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Telefon<input required value={form.phone} onChange={(event) => updateField("phone", event.target.value)} className="mt-2 w-full rounded-xl border border-gold/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-dark" /></label>
                <label className="text-xs uppercase tracking-wide-luxe text-muted-ruth">E-posta<input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} className="mt-2 w-full rounded-xl border border-gold/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-dark" /></label>
                <label className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Il<input required value={form.city} onChange={(event) => updateField("city", event.target.value)} className="mt-2 w-full rounded-xl border border-gold/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-dark" /></label>
                <label className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Ilçe<input required value={form.district} onChange={(event) => updateField("district", event.target.value)} className="mt-2 w-full rounded-xl border border-gold/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-dark" /></label>
                <label className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Mahalle<input value={form.neighborhood} onChange={(event) => updateField("neighborhood", event.target.value)} className="mt-2 w-full rounded-xl border border-gold/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-dark" /></label>
                <label className="text-xs uppercase tracking-wide-luxe text-muted-ruth md:col-span-2">Açık adres<textarea required rows={3} value={form.addressLine} onChange={(event) => updateField("addressLine", event.target.value)} className="mt-2 w-full rounded-xl border border-gold/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-dark" /></label>
                <label className="text-xs uppercase tracking-wide-luxe text-muted-ruth">Posta kodu<input value={form.postalCode} onChange={(event) => updateField("postalCode", event.target.value)} className="mt-2 w-full rounded-xl border border-gold/15 bg-cream px-4 py-3 text-sm text-ink outline-none transition focus:border-gold-dark" /></label>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                aria-busy={isSaving || undefined}
                className="mt-5 inline-flex items-center justify-center gap-2 bg-ink px-7 py-4 text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark disabled:opacity-60"
              >
                {isSaving ? <LoadingIndicator size="sm" /> : null}
                Adresi Kaydet
              </button>
            </form>
          )}

          {addresses.length === 0 ? (
            <div className="rounded-xl border border-gold/10 bg-ivory p-8 text-center">
              <MapPin className="mx-auto mb-4 text-gold-dark" size={30} />
              <p className="font-heading text-xl">Henüz kayıtlı adres yok</p>
              <p className="mt-3 text-sm text-muted-ruth">Adres ekleyebilirsin. Sipariş verirsen kullandığın adres de otomatik buraya eklenecek.</p>
              <button type="button" onClick={() => setFormOpen(true)} className="mt-6 inline-block bg-ink px-7 py-4 text-xs uppercase tracking-wide-luxe text-cream">Adres Ekle</button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {addresses.map((address) => {
                const makingDefault = pendingAddressAction === `default:${address.id}`;
                const deleting = pendingAddressAction === `delete:${address.id}`;
                return (
                  <div key={address.id} className="rounded-xl border border-gold/10 bg-ivory p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div><p className="font-heading text-lg">{address.full_name}</p><p className="mt-1 text-xs text-muted-ruth">{address.phone}</p></div>
                      {address.is_default ? <span className="inline-flex items-center gap-1 rounded-full border border-gold/20 bg-cream px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-gold-dark"><Star size={12} />Varsayılan</span> : null}
                    </div>
                    <p className="text-sm leading-7 text-muted-ruth">{address.address_line}<br />{address.neighborhood ? `${address.neighborhood} / ` : ""}{address.district} / {address.city}{address.postal_code ? ` · ${address.postal_code}` : ""}</p>
                    {address.email && <p className="mt-3 text-xs text-muted-ruth">{address.email}</p>}
                    <div className="mt-5 flex flex-wrap gap-2">
                      {!address.is_default && (
                        <button type="button" disabled={Boolean(pendingAddressAction)} aria-busy={makingDefault || undefined} onClick={() => void makeDefault(address.id)} className="inline-flex items-center gap-2 border border-gold/20 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-ink transition hover:bg-cream disabled:opacity-50">
                          {makingDefault ? <LoadingIndicator size="sm" /> : <Star size={13} />}
                          Varsayılan Yap
                        </button>
                      )}
                      <button type="button" disabled={Boolean(pendingAddressAction)} aria-busy={deleting || undefined} onClick={() => void deleteAddress(address.id)} className="inline-flex items-center gap-2 border border-red-200 px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-red-700 transition hover:bg-red-50 disabled:opacity-50">
                        {deleting ? <LoadingIndicator size="sm" /> : <Trash2 size={13} />}
                        Sil
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
