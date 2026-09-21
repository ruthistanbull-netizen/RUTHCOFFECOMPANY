import Link from "next/link";
import { Mail } from "lucide-react";
import { categoryHref } from "@/lib/catalogCategories";
import type { Category, Collection } from "@/types/site";
import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";
import { getThemeCustomizerSettings } from "@/data/site";
import { ThemeEditorBridgeV3 } from "@/components/theme/ThemeEditorBridgeV3";
import { ThemeEditorContextGestureBridge } from "@/components/theme/ThemeEditorContextGestureBridge";
import { ThemeEditorEnhancements } from "@/components/theme/ThemeEditorEnhancements";
import { ThemeEditorNativeNavigation } from "@/components/theme/ThemeEditorNativeNavigation";

const SOCIAL_LINKS = [
  { label: "WhatsApp", href: "https://wa.me/908503469789", icon: <WhatsAppIcon /> },
  { label: "Instagram", href: "https://www.instagram.com/theruthistanbul/", icon: <InstagramIcon /> },
  { label: "TikTok", href: "https://www.tiktok.com/@theruthistanbul", icon: <TikTokIcon /> },
];

const PAYMENT_LOGOS = [
  { label: "Visa", src: "/payments/visa.png" },
  { label: "Mastercard", src: "/payments/mastercard.png" },
  { label: "Maestro", src: "/payments/maestro.png" },
  { label: "American Express", src: "/payments/amex.png" },
  { label: "TROY", src: "/payments/troy.png" },
];

function InstagramIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" /></svg>;
}

function TikTokIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4v10.2a4.2 4.2 0 1 1-3.3-4.1" /><path d="M14 4c.7 3 2.6 4.8 5.4 5.2" /></svg>;
}

function WhatsAppIcon() {
  return <img src="/whatsapp-icon-black.png" alt="" aria-hidden="true" className="h-8 w-8 object-contain" loading="lazy" />;
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; href: string }> }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-3 text-[8px] uppercase leading-tight tracking-[0.14em] sm:text-[9px]" style={{ color: "var(--gold-dark)" }}>{title}</h4>
      <ul className="space-y-2 text-[9px] leading-[1.45] sm:text-[10px] md:text-[11px]" style={{ color: "var(--muted-foreground)" }}>
        {links.map((item) => <li key={`${title}-${item.href}`}><Link href={item.href} className="break-words transition hover:text-ink">{item.label}</Link></li>)}
      </ul>
    </div>
  );
}

export async function Footer({ categories = [], collections = [], themeSettings }: { categories?: Category[]; collections?: Collection[]; themeSettings?: ThemeCustomizerSettings }) {
  const resolvedThemeSettings = themeSettings || await getThemeCustomizerSettings();
  const shoppingLinks = [
    { label: "Yeni Gelenler", href: "/category/new-arrivals" },
    ...categories.map((category) => ({ label: category.name, href: categoryHref(category.public_slug || category.slug) })),
    ...(collections.length ? [{ label: "Koleksiyonlar", href: "/collections" }] : []),
  ];
  const supportLinks = [
    { label: "İletişim", href: "/contact" },
    { label: "S.S.S.", href: "/faq" },
    { label: "Kargo, İade ve Değişim", href: "/shipping-returns" },
    { label: "Garanti ve Kullanım Talimatları", href: "/warranty-care" },
  ];
  const legalLinks = [
    { label: "Gizlilik Politikası", href: "/privacy-policy" },
    { label: "Kullanım Şartları", href: "/terms" },
    { label: "KVKK Aydınlatma Metni", href: "/kvkk" },
    { label: "Elektronik Ticari İleti Onayı", href: "/commercial-communication-consent" },
  ];

  return (
    <>
      <footer className="bg-cream px-4 pb-8 pt-14 md:px-8 md:pt-20" style={{ borderTop: "1px solid rgba(184,151,106,0.15)" }}>
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col items-center text-center md:mb-12">
            <Link href="/" aria-label="Rosta Coffee Co anasayfa" className="mb-4 inline-flex"><img src="/rosta-coffee-co-user.svg" alt="" className="h-[66px] w-[240px] object-contain sm:w-[280px]" /></Link>
            <p className="max-w-sm text-xs leading-relaxed sm:text-sm" style={{ color: "var(--muted-foreground)" }}>Kahve, danışmanlık ve tedarik için sade, güvenilir çözümler.</p>
            <div className="mt-5 flex justify-center gap-3">
              {SOCIAL_LINKS.map((social) => <a key={social.label} href={social.href} target="_blank" rel="noreferrer" aria-label={social.label} className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/20 text-ink transition-colors hover:border-gold hover:bg-ivory">{social.icon}</a>)}
              <Link href="/contact#contact-form" aria-label="Bizimle iletişime geç" className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/20 text-ink transition-colors hover:border-gold hover:bg-ivory"><Mail size={18} strokeWidth={1.65} /></Link>
            </div>
          </div>
          <div className="mb-10 grid grid-cols-3 gap-x-3 sm:gap-x-8 md:mx-auto md:max-w-4xl md:gap-x-16">
            <FooterColumn title="Alışveriş" links={shoppingLinks} /><FooterColumn title="Müşteri Hizmetleri" links={supportLinks} /><FooterColumn title="Yasal" links={legalLinks} />
          </div>
          <div className="mb-7 flex flex-col gap-4 rounded-[1.25rem] border border-gold/15 bg-ivory/65 p-4 md:flex-row md:items-center md:justify-between">
            <div><p className="text-[9px] uppercase tracking-wide-luxe text-gold-dark">Güvenli Ödeme</p><p className="mt-1.5 text-[10px] text-muted-ruth sm:text-xs">PAYTR ile Güvenli Ödeme.</p></div>
            <div className="flex flex-nowrap items-center justify-center gap-1.5 overflow-x-auto pb-1 md:justify-end md:gap-2 md:overflow-visible md:pb-0" role="region" aria-label="Desteklenen ödeme yöntemleri" tabIndex={0}>
              {PAYMENT_LOGOS.map((logo) => <span key={logo.label} className="flex h-8 w-[58px] shrink-0 items-center justify-center rounded-lg border border-gold/10 bg-cream p-0.5 shadow-sm md:h-10 md:w-[74px]" aria-label={logo.label} title={logo.label}><img src={logo.src} alt={logo.label} className="h-full w-full object-contain" loading="lazy" /></span>)}
            </div>
          </div>
          <div className="flex flex-col justify-between gap-2 border-t border-gold/15 pt-6 text-[9px] sm:text-[10px] md:flex-row" style={{ color: "var(--muted-foreground)" }}><p>Copyright © 2026, ROSTA COFFEE CO. Tüm Hakları Saklıdır.</p><p>Kahvenin her adımında.</p></div>
        </div>
      </footer>
      <ThemeEditorNativeNavigation />
      <ThemeEditorEnhancements />
      <ThemeEditorContextGestureBridge />
      <ThemeEditorBridgeV3 settings={resolvedThemeSettings} />
    </>
  );
}
