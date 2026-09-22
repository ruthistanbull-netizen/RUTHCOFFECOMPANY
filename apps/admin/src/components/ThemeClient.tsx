"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import { adminRequest } from "@/lib/adminApi";
import { MediaUploadButton } from "@/components/MediaUploadButton";
import { ROSTA_STORE_URL } from "@/lib/platform";

const palette = [
  ["Carbon", "#111111"],
  ["Bone", "#F4F0E8"],
  ["Espresso", "#2B1B16"],
  ["Oxide", "#B9563D"],
  ["Dusty Olive", "#6F725B"],
  ["Steel", "#AAA8A1"],
];

function cleanCustomizer(value: any) {
  const current = value && typeof value === "object" ? value : {};
  const homepageImages = current.homepageImages && typeof current.homepageImages === "object" ? current.homepageImages : {};
  const announcement = current.announcement && typeof current.announcement === "object" ? current.announcement : {};
  const whatsapp = current.whatsapp && typeof current.whatsapp === "object" ? current.whatsapp : {};
  return {
    ...current,
    announcement: {
      enabled: Boolean(announcement.enabled),
      text: String(announcement.text || ""),
      text2: String(announcement.text2 || ""),
      href: String(announcement.href || "/products"),
      intervalSeconds: Number(announcement.intervalSeconds || 5),
    },
    whatsapp: {
      enabled: whatsapp.enabled !== false,
      phone: String(whatsapp.phone || ""),
      label: String(whatsapp.label || "WhatsApp"),
    },
    homepageImages: {
      heroImage: String(homepageImages.heroImage || ""),
      heroDesktopImage: String(homepageImages.heroDesktopImage || ""),
      heroMobileImage: String(homepageImages.heroMobileImage || ""),
      editorialVideo: String(homepageImages.editorialVideo || "/home/rosta-under-hero-video.mp4"),
      editorialImage: String(homepageImages.editorialImage || "/home/rosta-under-hero-photo.jpg"),
      scrollImages: Array.isArray(homepageImages.scrollImages) ? homepageImages.scrollImages.map(String) : [],
    },
  };
}

export function ThemeClient() {
  const [settings, setSettings] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [scrollText, setScrollText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    adminRequest<any>("/api/theme").then((value) => {
      const customizer = cleanCustomizer(value.settings?.theme_customizer || {});
      setSettings(value.settings || {});
      setDraft(customizer);
      setScrollText(customizer.homepageImages.scrollImages.join("\n"));
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Tema okunamadı."));
  }, []);

  const heroPreview = useMemo(() => {
    if (!draft) return "";
    return draft.homepageImages.heroDesktopImage || draft.homepageImages.heroImage || "/home/rosta-hero-v6";
  }, [draft]);

  function setHomepage(key: string, value: unknown) {
    setDraft((current: any) => ({
      ...current,
      homepageImages: { ...current.homepageImages, [key]: value },
    }));
  }

  function setAnnouncement(key: string, value: unknown) {
    setDraft((current: any) => ({
      ...current,
      announcement: { ...current.announcement, [key]: value },
    }));
  }

  function setWhatsapp(key: string, value: unknown) {
    setDraft((current: any) => ({
      ...current,
      whatsapp: { ...current.whatsapp, [key]: value },
    }));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage("");
    try {
      const next = {
        ...draft,
        homepageImages: {
          ...draft.homepageImages,
          scrollImages: scrollText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 12),
        },
      };
      const result = await adminRequest<any>("/api/theme", {
        method: "PUT",
        body: JSON.stringify({ key: "theme_customizer", value: next }),
      });
      const normalized = cleanCustomizer(result.value || next);
      setDraft(normalized);
      setSettings((current: any) => ({ ...(current || {}), theme_customizer: normalized }));
      setScrollText(normalized.homepageImages.scrollImages.join("\n"));
      setMessage("Mağaza ayarları kaydedildi ve storefront yenilemesi tetiklendi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tema kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings || !draft) return <div className="admin-loading">Tema ayarları yükleniyor…</div>;

  return (
    <>
      <div className="admin-toolbar">
        <div>
          <strong>Storefront görünümü</strong>
          <span>Yerleşim yapısı korunur; medya ve içerik aynı Supabase tema kaydından yönetilir.</span>
        </div>
        <a className="admin-secondary-button" href={ROSTA_STORE_URL} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Storefrontu Aç
        </a>
      </div>

      {message ? <div className="admin-inline-message">{message}</div> : null}

      <div className="admin-theme-layout">
        <aside className="admin-card admin-card-body admin-theme-palette">
          <p className="admin-kicker">SABİT TASARIM SİSTEMİ</p>
          <h2>ROSTA Palette</h2>
          <p className="admin-theme-note">Renk paleti ve font ailesi panelden değiştirilemez. Böylece storefrontta eski Ruth renkleri geri dönmez.</p>

          <div className="admin-palette-list">
            {palette.map(([name, color]) => (
              <div key={name} className="admin-palette-row">
                <span style={{ background: color }} />
                <strong>{name}</strong>
                <code>{color}</code>
              </div>
            ))}
          </div>

          <div className="admin-type-card">
            <span>Display</span><strong>Archivo 900</strong>
            <span>Body / UI</span><strong>Inter 400 / 500 / 700</strong>
          </div>

          <div className="admin-theme-preview">
            <span>Hero önizleme kaynağı</span>
            <p>{heroPreview}</p>
          </div>
        </aside>

        <div className="admin-theme-editors">
          <section className="admin-card admin-card-body">
            <div className="admin-section-heading">
              <div><p className="admin-kicker">ANA SAYFA</p><h2>Hero & Editoryal Medya</h2></div>
            </div>

            <div className="admin-form-grid">
              <div className="admin-field admin-field-wide">
                <span>Hero · Masaüstü</span>
                <input value={draft.homepageImages.heroDesktopImage} onChange={(e)=>setHomepage("heroDesktopImage",e.target.value)} placeholder="Boşsa ortak hero kullanılır" />
                <MediaUploadButton folder="theme/hero-desktop" accept="image/*" label="Masaüstü Hero Yükle" onUploaded={(url)=>setHomepage("heroDesktopImage",url)} />
              </div>

              <div className="admin-field admin-field-wide">
                <span>Hero · Mobil</span>
                <input value={draft.homepageImages.heroMobileImage} onChange={(e)=>setHomepage("heroMobileImage",e.target.value)} placeholder="Boşsa ortak hero kullanılır" />
                <MediaUploadButton folder="theme/hero-mobile" accept="image/*" label="Mobil Hero Yükle" onUploaded={(url)=>setHomepage("heroMobileImage",url)} />
              </div>

              <div className="admin-field admin-field-wide">
                <span>Hero · Ortak fallback</span>
                <input value={draft.homepageImages.heroImage} onChange={(e)=>setHomepage("heroImage",e.target.value)} />
                <MediaUploadButton folder="theme/hero" accept="image/*" label="Ortak Hero Yükle" onUploaded={(url)=>setHomepage("heroImage",url)} />
              </div>

              <div className="admin-field admin-field-wide">
                <span>Hero altındaki video</span>
                <input value={draft.homepageImages.editorialVideo} onChange={(e)=>setHomepage("editorialVideo",e.target.value)} />
                <MediaUploadButton folder="theme/editorial-video" accept="video/mp4,video/webm" label="Video Yükle" onUploaded={(url)=>setHomepage("editorialVideo",url)} />
              </div>

              <div className="admin-field admin-field-wide">
                <span>Videonun altındaki fotoğraf</span>
                <input value={draft.homepageImages.editorialImage} onChange={(e)=>setHomepage("editorialImage",e.target.value)} />
                <MediaUploadButton folder="theme/editorial-image" accept="image/*" label="Editoryal Fotoğraf Yükle" onUploaded={(url)=>setHomepage("editorialImage",url)} />
              </div>

              <label className="admin-field admin-field-wide">
                <span>Scroll Story Görselleri · her satıra bir URL</span>
                <textarea rows={7} value={scrollText} onChange={(e)=>setScrollText(e.target.value)} />
              </label>
              <div className="admin-field admin-field-wide">
                <span>Scroll Story görsel ekle</span>
                <MediaUploadButton folder="theme/scroll-story" accept="image/*" label="Scroll Görseli Yükle" onUploaded={(url)=>setScrollText((current)=>current.trim()?`${current.trim()}\n${url}`:url)} />
              </div>
            </div>
          </section>

          <section className="admin-card admin-card-body">
            <p className="admin-kicker">ÜST BİLGİ</p>
            <h2>Duyuru & WhatsApp</h2>
            <div className="admin-form-grid">
              <label className="admin-check admin-field-wide">
                <input type="checkbox" checked={draft.announcement.enabled} onChange={(e)=>setAnnouncement("enabled",e.target.checked)} />
                <span>Duyuru alanını göster</span>
              </label>
              <label className="admin-field admin-field-wide"><span>Duyuru metni</span><input value={draft.announcement.text} onChange={(e)=>setAnnouncement("text",e.target.value)} /></label>
              <label className="admin-field admin-field-wide"><span>Duyuru linki</span><input value={draft.announcement.href} onChange={(e)=>setAnnouncement("href",e.target.value)} /></label>
              <label className="admin-field"><span>Geçiş süresi</span><input type="number" min="2" max="60" value={draft.announcement.intervalSeconds} onChange={(e)=>setAnnouncement("intervalSeconds",Number(e.target.value))} /></label>

              <label className="admin-check admin-field-wide">
                <input type="checkbox" checked={draft.whatsapp.enabled} onChange={(e)=>setWhatsapp("enabled",e.target.checked)} />
                <span>WhatsApp butonunu göster</span>
              </label>
              <label className="admin-field"><span>Telefon</span><input value={draft.whatsapp.phone} onChange={(e)=>setWhatsapp("phone",e.target.value)} /></label>
              <label className="admin-field"><span>Buton etiketi</span><input value={draft.whatsapp.label} onChange={(e)=>setWhatsapp("label",e.target.value)} /></label>
            </div>
          </section>

          <section className="admin-card admin-card-body admin-theme-lock-card">
            <p className="admin-kicker">KORUNAN YAPI</p>
            <h2>Navigation & Ürün Yerleşimi</h2>
            <p>Menü/navigation yerleşimi, ürün kartlarının 3:4 medya oranı ve ürün varyant seçme sistemi storefront kodunda korunur. Panel içerik ve medya verisini değiştirir; bu yapıları yeniden tasarlamaz.</p>
          </section>

          <div className="admin-theme-savebar">
            <span>{message || "Değişiklikleri storefronta göndermek için kaydet."}</span>
            <button className="admin-primary-button" onClick={save} disabled={saving}>
              <Save size={15} /> {saving ? "Kaydediliyor…" : "Kaydet ve Yayınla"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
