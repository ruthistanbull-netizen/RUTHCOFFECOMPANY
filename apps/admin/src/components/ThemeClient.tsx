"use client";

import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

const palette = [
  ["Carbon", "#111111"],
  ["Bone", "#F4F0E8"],
  ["Espresso", "#2B1B16"],
  ["Oxide", "#B9563D"],
  ["Dusty Olive", "#6F725B"],
  ["Steel", "#AAA8A1"],
];

export function ThemeClient() {
  const [settings, setSettings] = useState<any>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    adminRequest<any>("/api/theme").then((value) => {
      setSettings(value.settings || {});
      setDraft(JSON.stringify(value.settings?.theme_customizer || {}, null, 2));
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Tema okunamadı."));
  }, []);

  const hero = useMemo(() => settings?.theme_customizer?.homepageImages?.heroImage || "Tanımlı değil", [settings]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const value = JSON.parse(draft || "{}");
      await adminRequest("/api/theme", {
        method: "PUT",
        body: JSON.stringify({ key: "theme_customizer", value }),
      });
      setSettings((current: any) => ({ ...(current || {}), theme_customizer: value }));
      setMessage("Tema ayarları kaydedildi ve storefront yenilemesi tetiklendi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tema kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="admin-loading">Tema ayarları yükleniyor…</div>;

  return (
    <div className="admin-grid" style={{ gridTemplateColumns: "minmax(0, .85fr) minmax(420px, 1.15fr)", alignItems: "start" }}>
      <section className="admin-card admin-card-body">
        <p className="admin-kicker">SABİT TASARIM SİSTEMİ</p>
        <h2 style={{ fontFamily: "var(--font-archivo)", fontWeight: 900, margin: "7px 0 18px" }}>ROSTA Palette</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {palette.map(([name, color]) => (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "46px 1fr auto", alignItems: "center", gap: 10 }}>
              <span style={{ width: 46, height: 34, borderRadius: 8, background: color, border: "1px solid var(--panel-line)" }} />
              <strong style={{ fontSize: 12 }}>{name}</strong>
              <code style={{ color: "var(--panel-muted)", fontSize: 10 }}>{color}</code>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--panel-line)" }}>
          <span style={{ color: "var(--panel-muted)", fontSize: 10 }}>Hero görseli</span>
          <p style={{ margin: "5px 0 0", fontSize: 11, overflowWrap: "anywhere" }}>{hero}</p>
        </div>
      </section>

      <section className="admin-card admin-card-body">
        <p className="admin-kicker">STOREfront AYARLARI</p>
        <h2 style={{ fontFamily: "var(--font-archivo)", fontWeight: 900, margin: "7px 0 8px" }}>Theme Customizer</h2>
        <p style={{ color: "var(--panel-muted)", fontSize: 12, lineHeight: 1.6 }}>İlk panel bootstrap aşamasında mevcut tema kaydını güvenli şekilde aynı <code>site_settings</code> tablosundan yönetiyoruz. Görsel editör kontrolleri Ruth panelinden sonraki portta taşınacak.</p>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} style={{ width: "100%", minHeight: 430, resize: "vertical", border: "1px solid var(--panel-line)", borderRadius: 12, background: "var(--panel-surface-2)", color: "var(--panel-ink)", padding: 14, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, lineHeight: 1.55 }} />
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: message.includes("kaydedildi") ? "var(--rosta-olive)" : "var(--rosta-espresso)", fontSize: 10 }}>{message}</span>
          <button className="admin-primary-button" onClick={save} disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet ve Yayınla"}</button>
        </div>
      </section>
    </div>
  );
}
