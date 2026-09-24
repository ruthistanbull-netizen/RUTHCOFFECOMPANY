"use client";

import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  ImagePlus,
  Monitor,
  RefreshCw,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import {
  defaultThemeCustomizerSettings,
  normalizeThemeCustomizerSettings,
  type ThemeCustomizerSettings,
} from "@/lib/themeCustomizer";
import { ExactDataCard } from "./data";
import {
  ExactButton,
  ExactField,
  ExactIconButton,
  ExactPageHeader,
  ExactSegmentedControl,
  ExactSkeleton,
  exactFormInputClass,
  useExactToast,
} from "./primitives";

type PreviewMode = "desktop" | "mobile";
const DRAFT_KEY = "rosta_exact_base44_storefront_draft";
const LEGACY_DRAFT_KEY = "ruth_exact_base44_storefront_draft";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app";
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

function safeDraft(value: string | null) {
  if (!value) return null;
  try {
    return normalizeThemeCustomizerSettings(JSON.parse(value));
  } catch {
    return null;
  }
}

function settingsFingerprint(value: ThemeCustomizerSettings) {
  return JSON.stringify(normalizeThemeCustomizerSettings(value));
}

export function ExactStorefront() {
  const toast = useExactToast();
  const { save: saveLifecycle, requestTransition, saving } = useSaveLifecycle();
  const [device, setDevice] = useState<PreviewMode>("desktop");
  const [settings, setSettings] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [savedSettings, setSavedSettings] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const dirty = settingsFingerprint(settings) !== settingsFingerprint(savedSettings);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ settings?: unknown }>(`/api/theme?t=${Date.now()}`);
      const serverSettings = normalizeThemeCustomizerSettings(result.settings);
      const rawDraft = typeof window === "undefined" ? null : (window.localStorage.getItem(DRAFT_KEY) || window.localStorage.getItem(LEGACY_DRAFT_KEY));
      const draft = safeDraft(rawDraft);
      if (typeof window !== "undefined" && !window.localStorage.getItem(DRAFT_KEY) && window.localStorage.getItem(LEGACY_DRAFT_KEY) && rawDraft) {
        window.localStorage.setItem(DRAFT_KEY, rawDraft);
        window.localStorage.removeItem(LEGACY_DRAFT_KEY);
      }
      setSavedSettings(serverSettings);
      setSettings(draft || serverSettings);
      if (draft && settingsFingerprint(draft) !== settingsFingerprint(serverSettings)) {
        toast.info("Kaydedilmemiş yerel vitrin taslağı yüklendi.");
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Vitrin ayarları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const saveDraft = () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(settings));
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
    toast.success("Vitrin taslağı bu cihazda kaydedildi.");
  };

  const validatePublish = useCallback(() => {
    if (uploading) {
      toast.error("Görsel yüklemesinin bitmesini bekle.");
      return false;
    }
    if (settings.announcement.enabled && !settings.announcement.text.trim()) {
      toast.error("Duyuru alanı aktifken metin boş olamaz.");
      return false;
    }
    return true;
  }, [settings.announcement.enabled, settings.announcement.text, toast, uploading]);

  const persistPublish = useCallback(async () => {
    try {
      const result = await adminRequest<{ settings?: unknown; warning?: string }>("/api/theme", {
        method: "PUT",
        body: JSON.stringify({ settings }),
      });
      const nextSettings = normalizeThemeCustomizerSettings(result.settings || settings);
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      window.localStorage.removeItem(DRAFT_KEY);
      window.localStorage.removeItem(LEGACY_DRAFT_KEY);
      toast.success(result.warning ? `Vitrin yayınlandı. ${result.warning}` : "Vitrin yayınlandı ve website yenilemesi tetiklendi.");
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Vitrin yayınlanamadı.");
      return false;
    }
  }, [settings, toast]);

  const discardSettings = useCallback(() => {
    setSettings(savedSettings);
    window.localStorage.removeItem(DRAFT_KEY);
    window.localStorage.removeItem(LEGACY_DRAFT_KEY);
  }, [savedSettings]);

  useSaveLifecycleSource({
    id: "storefront-theme-editor",
    dirty,
    validate: validatePublish,
    save: persistPublish,
    discard: discardSettings,
  });

  const requestRefresh = () => {
    if (loading || saving || uploading) return;
    void requestTransition(load);
  };

  const uploadHero = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Yalnız görsel dosyaları yüklenebilir.");
      return;
    }
    setUploading(true);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Görsel yüklenemedi.");
      setSettings((current) => ({
        ...current,
        homepageImages: { ...current.homepageImages, heroImage: String(result.url) },
      }));
      toast.success("Hero görseli yüklendi. Yayınladığında website’e aktarılır.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Hero görseli yüklenemedi.");
    } finally {
      setUploading(false);
    }
  };

  const sections = useMemo(() => [
    { id: "hero", label: "Hero Banner", value: settings.homepageImages.heroImage },
    ...settings.homepageImages.scrollImages.map((value, index) => ({ id: `scroll-${index}`, label: `Vitrin Görseli ${index + 1}`, value })),
    { id: "newsletter", label: "Duyuru ve Newsletter", value: settings.announcement.enabled ? "Aktif" : "Pasif" },
    { id: "footer", label: "İletişim ve WhatsApp", value: settings.whatsapp.enabled ? "Aktif" : "Pasif" },
  ], [settings]);

  const moveImage = (index: number, direction: -1 | 1) => setSettings((current) => {
    const images = [...current.homepageImages.scrollImages];
    const target = index + direction;
    if (target < 0 || target >= images.length) return current;
    [images[index], images[target]] = [images[target], images[index]];
    return { ...current, homepageImages: { ...current.homepageImages, scrollImages: images } };
  });

  const removeImage = (index: number) => setSettings((current) => ({
    ...current,
    homepageImages: {
      ...current.homepageImages,
      scrollImages: current.homepageImages.scrollImages.filter((_, itemIndex) => itemIndex !== index),
    },
  }));

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="storefront">
      <ExactPageHeader
        title="Theme Editor"
        subtitle="Vitrin görünümünü Base44 düzeninde özelleştir"
        actions={
          <>
            <ExactButton variant="secondary" size="sm" onClick={saveDraft} disabled={loading || saving || uploading}>Taslağı Kaydet</ExactButton>
            <ExactButton size="sm" onClick={() => void saveLifecycle()} loading={saving} disabled={loading || uploading}><Save className="h-4 w-4" /> Yayınla</ExactButton>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ExactSkeleton className="h-[720px]" />
          <ExactSkeleton className="h-[620px]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <ExactSegmentedControl
              value={device}
              onChange={(value) => setDevice(value as PreviewMode)}
              options={[
                { value: "desktop", label: "Masaüstü", icon: Monitor },
                { value: "mobile", label: "Mobil", icon: Smartphone },
              ]}
            />

            <ExactDataCard title="Hero Section">
              <div className="space-y-3">
                <div className="overflow-hidden radius-card bg-surface-secondary aspect-[16/7] flex items-center justify-center">
                  {settings.homepageImages.heroImage ? (
                    <img src={settings.homepageImages.heroImage} alt="Hero önizleme" className="h-full w-full object-cover" />
                  ) : <span className="text-xs text-subtle">Hero görseli yok</span>}
                </div>
                <label className="inline-flex items-center justify-center gap-2 h-9 px-3 radius-control bg-surface-secondary border border-border-subtle text-xs font-medium cursor-pointer hover:bg-surface-tertiary transition-all">
                  <ImagePlus className="h-4 w-4" /> Hero Görseli Yükle
                  <input type="file" accept="image/*" hidden disabled={uploading || saving} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadHero(file); event.currentTarget.value = ""; }} />
                </label>
                <ExactField label="Duyuru Başlığı">
                  <input
                    value={settings.announcement.text}
                    onChange={(event) => setSettings((current) => ({ ...current, announcement: { ...current.announcement, text: event.target.value } }))}
                    className={exactFormInputClass}
                  />
                </ExactField>
                <ExactField label="İkinci Duyuru">
                  <input
                    value={settings.announcement.text2}
                    onChange={(event) => setSettings((current) => ({ ...current, announcement: { ...current.announcement, text2: event.target.value } }))}
                    className={exactFormInputClass}
                    placeholder="İkinci mesaj"
                  />
                </ExactField>
                <ExactField label="Duyuru Bağlantısı">
                  <input
                    value={settings.announcement.href}
                    onChange={(event) => setSettings((current) => ({ ...current, announcement: { ...current.announcement, href: event.target.value } }))}
                    className={exactFormInputClass}
                  />
                </ExactField>
              </div>
            </ExactDataCard>

            <ExactDataCard title="Colors">
              <div className="space-y-3">
                <ExactField label="Accent Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.colors.gold}
                      onChange={(event) => setSettings((current) => ({ ...current, colors: { ...current.colors, gold: event.target.value } }))}
                      className="h-9 w-12 rounded-[var(--radius-small)] border border-border-subtle cursor-pointer"
                    />
                    <input
                      value={settings.colors.gold}
                      onChange={(event) => setSettings((current) => ({ ...current, colors: { ...current.colors, gold: event.target.value } }))}
                      className={`${exactFormInputClass} flex-1`}
                    />
                  </div>
                </ExactField>
                <ExactField label="Background">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.colors.ivory}
                      onChange={(event) => setSettings((current) => ({ ...current, colors: { ...current.colors, ivory: event.target.value } }))}
                      className="h-9 w-12 rounded-[var(--radius-small)] border border-border-subtle cursor-pointer"
                    />
                    <input
                      value={settings.colors.ivory}
                      onChange={(event) => setSettings((current) => ({ ...current, colors: { ...current.colors, ivory: event.target.value } }))}
                      className={`${exactFormInputClass} flex-1`}
                    />
                  </div>
                </ExactField>
              </div>
            </ExactDataCard>

            <ExactDataCard title="Homepage Sections">
              <div className="space-y-2">
                {sections.map((section, index) => {
                  const scrollIndex = section.id.startsWith("scroll-") ? Number(section.id.replace("scroll-", "")) : null;
                  return (
                    <div key={section.id} className="flex items-center gap-2 p-2.5 radius-small bg-surface-secondary">
                      <span className="text-xs font-medium text-subtle">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-main block truncate">{section.label}</span>
                        <span className="text-[10px] text-subtle block truncate">{section.value || "Ayarlanmadı"}</span>
                      </div>
                      {scrollIndex != null ? (
                        <div className="flex items-center gap-1">
                          <ExactIconButton icon={ArrowUp} label="Yukarı taşı" size="icon-sm" onClick={() => moveImage(scrollIndex, -1)} disabled={scrollIndex === 0 || saving || uploading} />
                          <ExactIconButton icon={ArrowDown} label="Aşağı taşı" size="icon-sm" onClick={() => moveImage(scrollIndex, 1)} disabled={scrollIndex === settings.homepageImages.scrollImages.length - 1 || saving || uploading} />
                          <ExactIconButton icon={Trash2} label="Kaldır" size="icon-sm" variant="ghost" onClick={() => removeImage(scrollIndex)} disabled={saving || uploading} />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ExactDataCard>
          </div>

          <div className="lg:sticky lg:top-20 h-fit">
            <ExactDataCard
              title={<span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" /> Live Preview</span>}
              action={<div className="flex items-center gap-1"><ExactIconButton icon={RefreshCw} label="Yenile" size="icon-sm" onClick={requestRefresh} loading={loading} disabled={saving || uploading} /><a href={SITE_URL} target="_blank" rel="noreferrer"><ExactIconButton icon={ExternalLink} label="Website’i aç" size="icon-sm" /></a></div>}
            >
              <div className={`mx-auto bg-surface-tertiary rounded-[var(--radius-small)] overflow-hidden transition-all ${device === "mobile" ? "max-w-[320px]" : "max-w-full"}`}>
                <div className="flex items-center gap-1.5 px-3 py-2 bg-surface-secondary border-b border-border-subtle">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger/40" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/40" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/40" />
                  <span className="ml-2 text-[10px] text-subtle">{SITE_HOST}</span>
                </div>
                <div
                  className="relative min-h-[260px] p-6 text-center flex flex-col items-center justify-center overflow-hidden"
                  style={{ backgroundColor: settings.colors.ivory }}
                >
                  {settings.homepageImages.heroImage ? <img src={settings.homepageImages.heroImage} alt="Vitrin hero" className="absolute inset-0 h-full w-full object-cover opacity-35" /> : null}
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${settings.colors.gold}22, transparent)` }} />
                  <div className="relative z-10">
                    {settings.logo.src ? <img src={settings.logo.src} alt="ROSTA Coffee Co." className="mx-auto max-h-10 max-w-[190px] object-contain mb-3" /> : null}
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: settings.colors.goldDark }}>ROSTA COFFEE CO.</p>
                    <h2 className="text-2xl font-bold mt-2" style={{ color: settings.colors.ink }}>Good Coffee, Good Mood.</h2>
                    <p className="text-xs mt-1" style={{ color: settings.colors.muted }}>{settings.announcement.text || "Taze kahve, sade ritüel."}</p>
                    <button type="button" className="mt-4 px-5 py-2 rounded-full text-white text-xs font-medium" style={{ backgroundColor: settings.colors.gold }}>Kahveleri Keşfet</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 p-4" style={{ backgroundColor: settings.colors.cream }}>
                  {settings.homepageImages.scrollImages.slice(0, 3).map((image, index) => (
                    <div key={`${image}-${index}`} className="aspect-square rounded-[var(--radius-small)] bg-surface-primary overflow-hidden flex items-center justify-center">
                      {image ? <img src={image} alt={`Kahve ${index + 1}`} className="h-full w-full object-cover" /> : <span className="text-[9px] text-subtle">Kahve {index + 1}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </ExactDataCard>
          </div>
        </div>
      )}
    </div>
  );
}
