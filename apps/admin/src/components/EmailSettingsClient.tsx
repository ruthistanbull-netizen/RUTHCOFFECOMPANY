"use client";

import { useEffect, useState } from "react";
import { Mail, Unplug } from "lucide-react";
import { adminRequest } from "@/lib/adminApi";

type Integration = {
  id: string;
  provider: string;
  email: string | null;
  sender_name: string | null;
  status: string;
  expires_at: string | null;
  updated_at: string | null;
};

export function EmailSettingsClient() {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminRequest<{ ok: true; integration: Integration | null }>("/api/email/status");
      setIntegration(data.integration);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "E-posta durumu okunamadı.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const data = await adminRequest<{ ok: true; url: string }>("/api/email/gmail/connect", { method: "POST" });
      window.location.assign(data.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gmail bağlantısı başlatılamadı.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await adminRequest("/api/email/status", { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gmail bağlantısı kaldırılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card" style={{ maxWidth: 720 }}>
      <div className="admin-card-body" style={{ borderBottom: "1px solid var(--panel-line)" }}>
        <div>
          <p className="admin-kicker">GMAIL</p>
          <h2>İşlemsel e-posta</h2>
          <p>Sipariş onay e-postaları ROSTA hesabından gönderilir. Tokenlar yalnızca ROSTA Supabase içinde saklanır.</p>
        </div>
      </div>

      <div className="admin-card-body">
      {loading ? <p>Bağlantı kontrol ediliyor…</p> : null}
      {error ? <div className="admin-error">{error}</div> : null}

      {!loading && integration?.status === "active" ? (
        <div style={{ display: "grid", gap: 12, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "var(--panel-muted)", fontSize: 12 }}>Bağlı hesap</span>
            <strong>{integration.email || "Gmail"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "var(--panel-muted)", fontSize: 12 }}>Gönderen</span>
            <strong>{integration.sender_name || "ROSTA Coffee Co."}</strong>
          </div>
          <button className="admin-secondary-button" onClick={disconnect} disabled={busy}>
            <Unplug size={16} /> {busy ? "Kaldırılıyor…" : "Bağlantıyı Kaldır"}
          </button>
        </div>
      ) : !loading ? (
        <button className="admin-primary-button" onClick={connect} disabled={busy}>
          <Mail size={16} /> {busy ? "Google açılıyor…" : "Gmail Hesabını Bağla"}
        </button>
      ) : null}
      </div>
    </section>
  );
}
