"use client";

import {
  AtSign,
  ExternalLink,
  Facebook,
  Instagram,
  Linkedin,
  Link2,
  MessageCircle,
  Music2,
  Save,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SOCIAL_MEDIA_PLATFORMS,
  defaultSocialMediaSettings,
  type SocialMediaPlatform,
  type SocialMediaSettings,
} from "@ruth-commerce/contracts/social-media";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactField,
  ExactPageHeader,
  ExactSkeleton,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactDataCard } from "./data";

const PLATFORM_ICONS: Record<SocialMediaPlatform, LucideIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  facebook: Facebook,
  youtube: Youtube,
  x: AtSign,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
};

export function ExactSocialMedia() {
  const toast = useExactToast();
  const [settings, setSettings] = useState<SocialMediaSettings>(defaultSocialMediaSettings);
  const [savedSettings, setSavedSettings] = useState<SocialMediaSettings>(defaultSocialMediaSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ settings?: SocialMediaSettings }>("/api/social-media", {
        hardRefresh: true,
        ttlMs: 0,
        staleMs: 0,
      });
      const next = result.settings || defaultSocialMediaSettings;
      setSettings(next);
      setSavedSettings(next);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Sosyal medya bağlantıları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [savedSettings, settings],
  );

  const activeCount = useMemo(
    () => SOCIAL_MEDIA_PLATFORMS.filter((platform) => Boolean(String(settings[platform.key] || "").trim())).length,
    [settings],
  );

  const save = async () => {
    setSaving(true);
    try {
      const result = await adminRequest<{ settings?: SocialMediaSettings; warning?: string | null }>("/api/social-media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
        invalidate: ["/api/social-media"],
      });
      const next = result.settings || settings;
      setSettings(next);
      setSavedSettings(next);
      toast.success(result.warning ? "Bağlantılar kaydedildi. Storefront yenilemesi sıraya alındı." : "Sosyal medya bağlantıları kaydedildi.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Sosyal medya bağlantıları kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="social-media">
      <ExactPageHeader
        title="Sosyal Medya"
        subtitle="Storefrontta gösterilecek sosyal hesap bağlantılarını tek yerden yönet."
        actions={
          <ExactButton onClick={() => void save()} loading={saving} disabled={loading || !dirty}>
            <Save className="h-4 w-4" />
            Kaydet
          </ExactButton>
        }
      />

      <ExactDataCard title="Sosyal medya hesapları">
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {SOCIAL_MEDIA_PLATFORMS.map((platform) => (
              <ExactSkeleton key={platform.key} className="h-28" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {SOCIAL_MEDIA_PLATFORMS.map((platform) => {
              const Icon = PLATFORM_ICONS[platform.key];
              const href = String(settings[platform.key] || "").trim();
              return (
                <div key={platform.key} className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-secondary p-4">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-small)] bg-surface-primary text-main">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="ruth-type-card-title text-main">{platform.label}</p>
                      <p className="ruth-type-caption mt-0.5 text-muted">{href ? "Storefrontta aktif" : "Bağlantı eklenmedi"}</p>
                    </div>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${platform.label} bağlantısını aç`}
                        className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-small)] text-muted transition-colors hover:bg-surface-primary hover:text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:h-9 md:w-9"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                  <ExactField label={`${platform.label} bağlantısı`}>
                    <input
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      className={exactFormInputClass}
                      value={settings[platform.key]}
                      placeholder={platform.placeholder}
                      onChange={(event) => setSettings((current) => ({
                        ...current,
                        [platform.key]: event.target.value,
                      }))}
                    />
                  </ExactField>
                </div>
              );
            })}
          </div>
        )}
      </ExactDataCard>

      <ExactDataCard title="Storefront davranışı">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
            <Link2 className="h-4 w-4 text-accent" />
            <p className="mt-2 text-xs font-semibold text-main">Tek kaynak</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">Footer, iletişim alanları ve sosyal profil verileri bu sayfadaki bağlantıları kullanır.</p>
          </div>
          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
            <Instagram className="h-4 w-4 text-accent" />
            <p className="mt-2 text-xs font-semibold text-main">{activeCount} aktif hesap</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">Yalnız bağlantısı bulunan platformların logosu storefrontta görünür.</p>
          </div>
          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
            <MessageCircle className="h-4 w-4 text-accent" />
            <p className="mt-2 text-xs font-semibold text-main">WhatsApp da bağlı</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">WhatsApp hedefi de aynı kaynaktan gelir; mevcut görünürlük ve etiket ayarı korunur.</p>
          </div>
        </div>
      </ExactDataCard>
    </div>
  );
}
