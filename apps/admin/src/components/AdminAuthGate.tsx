"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};
    try {
      const supabase = getSupabaseBrowser();
      supabase.auth.getSession().then(({ data, error: sessionError }) => {
        if (!mounted) return;
        if (sessionError) setError(sessionError.message);
        if (!data.session) {
          setSignedIn(false);
          setReady(true);
          return;
        }
        fetch("/api/me", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        })
          .then(async (response) => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "Panel yetkisi doğrulanamadı.");
            if (!mounted) return;
            setSignedIn(true);
          })
          .catch((caught) => {
            if (!mounted) return;
            setSignedIn(false);
            setError(caught instanceof Error ? caught.message : "Panel yetkisi doğrulanamadı.");
          })
          .finally(() => {
            if (mounted) setReady(true);
          });
      }).catch((caught) => {
        if (!mounted) return;
        setError(caught instanceof Error ? caught.message : "Panel oturumu okunamadı.");
        setReady(true);
      });
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) {
          setSignedIn(false);
          setReady(true);
        }
      });
      unsubscribe = () => subscription.subscription.unsubscribe();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Panel Supabase bağlantısı kurulamadı.");
      setReady(true);
    }
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = getSupabaseBrowser();
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      const token = loginData.session?.access_token;
      if (!token) throw new Error("Panel oturumu oluşturulamadı.");
      const response = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        await supabase.auth.signOut();
        throw new Error(payload?.error || "Panel yetkisi doğrulanamadı.");
      }
      setSignedIn(true);
      setReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Giriş yapılamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <div className="admin-loading-screen"><div className="admin-loader" /><span>ROSTA Panel yükleniyor</span></div>;
  }

  if (!signedIn) {
    return (
      <main className="admin-login">
        <section className="admin-login-brand">
          <div className="admin-brand-logo">ROSTA</div>
          <div>
            <p className="admin-kicker">CONTROL ROOM</p>
            <h1>Kahvenin her adımını tek yerden yönet.</h1>
            <p className="admin-login-copy">Storefront, ürünler, siparişler, müşteriler ve mağaza görünümü aynı altyapı üzerinden yönetilir.</p>
          </div>
        </section>
        <section className="admin-login-form-wrap">
          <form className="admin-login-form" onSubmit={login}>
            <p className="admin-kicker">YÖNETİCİ GİRİŞİ</p>
            <h2>ROSTA Panel</h2>
            <label><span>E-posta</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
            <label><span>Şifre</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
            <label className="admin-check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Oturumu açık tut</span></label>
            {error ? <div className="admin-error">{error}</div> : null}
            <button className="admin-primary-button" disabled={busy}>{busy ? "Giriş yapılıyor…" : "Giriş Yap"}</button>
          </form>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}
