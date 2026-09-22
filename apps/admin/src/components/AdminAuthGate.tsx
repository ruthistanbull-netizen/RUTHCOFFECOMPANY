"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSignedIn(Boolean(data.session));
      setReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setReady(true);
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const supabase = getSupabaseBrowser();
      if (!remember && typeof window !== "undefined") {
        window.localStorage.setItem("rosta_admin_session_mode", "session");
      } else if (typeof window !== "undefined") {
        window.localStorage.setItem("rosta_admin_session_mode", "remember");
      }
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
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
