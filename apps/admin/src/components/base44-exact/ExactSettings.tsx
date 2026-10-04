"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ExactNotifications } from "./ExactNotifications";
import { ExactDataCard } from "./data";
import { exactAllNavItems } from "./nav-config";
import { ExactPageHeader } from "./primitives";

const descriptions: Record<string, string> = {
  "/account": "Hesap ve profil bilgilerinizi yönetin.",
  "/settings/users": "Panel erişimlerini ve kullanıcı rollerini yönetin.",
  "/settings/integrations": "Ödeme, kargo, e-posta ve diğer bağlantıları yönetin.",
  "/settings/security": "Oturum güvenliğini ve işlem kayıtlarını kontrol edin.",
  "/settings/appearance": "Panel temasını, yoğunluğunu ve hareket tercihlerini ayarlayın.",
  "/system": "Servis durumunu ve operasyon uyarılarını kontrol edin.",
};

const settingsLinks = exactAllNavItems.filter((item) => item.path in descriptions);

export function ExactSettings() {
  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="settings">
      <ExactPageHeader title="Ayarlar" subtitle="Bildirimleri, panel tercihlerini ve yönetim ayarlarını yönetin" />
      <ExactNotifications embedded />
      <ExactDataCard title="Panel ayarları">
        <nav aria-label="Ayar bölümleri" className="grid gap-3 md:grid-cols-2">
          {settingsLinks.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              href={path}
              className="flex min-h-11 min-w-0 items-start gap-3 radius-control border border-border-subtle bg-surface-secondary p-4 text-main hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h3 className="ruth-type-card-title">{label}</h3>
                <p className="ruth-type-caption mt-1 text-muted">{descriptions[path]}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </ExactDataCard>
    </div>
  );
}
