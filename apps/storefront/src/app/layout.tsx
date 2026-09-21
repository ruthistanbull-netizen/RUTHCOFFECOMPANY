import type { Metadata, Viewport } from "next";
import { Cinzel, Montserrat } from "next/font/google";
import "@ruth-commerce/ui/styles.css";
import "@ruth-commerce/ui/interaction.css";
import "@ruth-commerce/ui/feedback.css";
import "@ruth-commerce/ui/storefront-motion.css";
import "@ruth-commerce/ui/semantic-tokens.css";
import "@ruth-commerce/ui/typography.css";
import "@ruth-commerce/ui/core.css";
import "@ruth-commerce/ui/cards.css";
import "@ruth-commerce/ui/data-display.css";
import "@ruth-commerce/ui/operations.css";
import "@ruth-commerce/ui/order-card.css";
import "@ruth-commerce/ui/search-shell.css";
import "./globals.css";
import "./ruthie-offer5-motion.css";
import "./necklace-size-guide.css";
import "./product-image-standard.css";
import "./product-header-contrast.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AnalyticsConsentGate } from "@/components/analytics/AnalyticsConsentGate";
import { PremiumInteractions } from "@/components/PremiumInteractions";
import { NavigationSpeedup } from "@/components/NavigationSpeedup";
import { ProductNavigationContextCapture } from "@/components/ProductNavigationContextCapture";
import { RewardsWidget } from "@/components/RewardsWidget";
import { LatinUppercaseFixer } from "@/components/LatinUppercaseFixer";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { MobileMenuAccordion } from "@/components/MobileMenuAccordion";
import { HomepageHeaderLogoVisibility } from "@/components/HomepageHeaderLogoVisibility";
import { StorefrontMotionProvider } from "@/components/StorefrontMotionProvider";
import { getThemeCustomizerSettings } from "@/data/site";
import { getCachedCategories, getCachedCollections } from "@/data/catalogCache";
import {
  absoluteUrl,
  DEFAULT_OG_IMAGE,
  DEFAULT_SEO_DESCRIPTION,
  DEFAULT_SEO_TITLE,
  jsonLd,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "@/lib/seo";

const montserrat = Montserrat({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-montserrat",
  preload: true,
});

const cinzel = Cinzel({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-cinzel",
  preload: true,
});

export const revalidate = 10;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F6F0E7",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_SEO_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_SEO_DESCRIPTION,
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: DEFAULT_SEO_TITLE,
    description: DEFAULT_SEO_DESCRIPTION,
    siteName: SITE_NAME,
    locale: "tr_TR",
    type: "website",
    url: SITE_URL,
    images: [{ url: DEFAULT_OG_IMAGE, alt: `${SITE_NAME} tasarım takı koleksiyonu` }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SEO_TITLE,
    description: DEFAULT_SEO_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  icons: {
    icon: [{ url: "/favicon.svg?v=3", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg?v=3"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ROSTA",
    statusBarStyle: "default",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [themeSettings, categories, collections] = await Promise.all([
    getThemeCustomizerSettings(),
    getCachedCategories(),
    getCachedCollections(),
  ]);

  const colors = themeSettings.colors;
  const themeStyle = {
    "--ivory": colors.ivory || "#F6F0E7",
    "--cream": colors.cream || "#FAF7F1",
    "--ink": colors.ink || "#211912",
    "--gold": colors.gold || "#B8976A",
    "--gold-dark": colors.goldDark || "#76552F",
    "--muted-foreground": colors.muted || "#66594D",
    "--background": colors.ivory || "#F6F0E7",
    "--foreground": colors.ink || "#211912",
    "--font-heading": 'var(--font-montserrat), "Helvetica Neue", Arial, sans-serif',
    "--font-body": 'var(--font-montserrat), "Helvetica Neue", Arial, sans-serif',
    "--font-editorial": 'var(--font-cinzel), Georgia, "Times New Roman", serif',
    "--ruth-font-display": 'var(--font-cinzel), Georgia, "Times New Roman", serif',
    "--ruth-font-body": 'var(--font-montserrat), "Helvetica Neue", Arial, sans-serif',
    "--ruth-color-canvas": colors.ivory || "#F6F0E7",
    "--ruth-color-surface": colors.cream || "#FAF7F1",
    "--ruth-color-surface-muted": colors.cream || "#FAF7F1",
    "--ruth-color-text-primary": colors.ink || "#211912",
    "--ruth-color-text-muted": colors.muted || "#66594D",
    "--ruth-color-accent": colors.gold || "#B8976A",
    "--ruth-color-accent-strong": colors.goldDark || "#76552F",
    "--ruth-color-border-subtle": "rgba(184, 151, 106, 0.20)",
    "--ruth-color-border-strong": "rgba(118, 85, 47, 0.52)",
    "--ruth-color-text-inverse": "#FFFFFF",
    "--announcement-height": themeSettings.announcement.enabled ? "34px" : "0px",
  } as React.CSSProperties;

  const siteStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl(themeSettings.logo.src || "/rosta-coffee-co-v4.webp"),
        sameAs: [...SOCIAL_PROFILES],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: "tr-TR",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <html lang="tr" data-uppercase-locale="en-US">
      <body
        lang="tr"
        className={`${montserrat.variable} ${cinzel.variable} site-app-shell`}
        data-ruth-typography="storefront"
        style={themeStyle}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(siteStructuredData) }}
        />
        <style>{`
          .site-app-shell {
            font-family: var(--font-body);
            font-synthesis: none;
          }
          .site-app-shell :where(button, input, select, textarea) {
            font-family: inherit;
          }
          .site-app-shell :where(.font-heading) {
            font-family: var(--font-body);
          }
          .site-app-shell :where(.font-editorial, .font-serif, .ruth-type-display, [data-ruth-text-role="display"]) {
            font-family: var(--ruth-font-display);
          }
          .site-app-shell :where([data-latin-uppercase], .latin-uppercase) {
            text-transform: uppercase;
            font-variant: normal;
            font-variant-caps: normal;
            letter-spacing: 0.12em;
          }
          .site-app-shell .mobile-menu-collection-name,
          .site-app-shell .mobile-menu-section-title,
          .site-app-shell .mobile-menu-account-link,
          .site-app-shell .desktop-menu-link,
          .site-app-shell .desktop-menu-subtitle,
          .site-app-shell .desktop-collection-name,
          .site-app-shell .header-search-input,
          .site-app-shell .product-title,
          .site-app-shell .product-card-title,
          .site-app-shell .product-complete-card-copy strong,
          .site-app-shell .product-browser-preview-buy-row > strong,
          .site-app-shell .product-modal-heading,
          .site-app-shell .product-mobile-tabs button,
          .site-app-shell .cart-item-title,
          .site-app-shell .checkout-page h1,
          .site-app-shell .checkout-page h2,
          .site-app-shell .checkout-page h3,
          .site-app-shell .checkout-page h4,
          .site-app-shell .checkout-page strong,
          .site-app-shell .checkout-page span,
          .site-app-shell .checkout-page p,
          .site-app-shell .checkout-page label,
          .site-app-shell .checkout-page input,
          .site-app-shell .checkout-page select,
          .site-app-shell .checkout-page textarea,
          .site-app-shell .checkout-page button {
            font-variant-caps: normal !important;
            text-transform: none !important;
            letter-spacing: normal;
          }
        `}</style>
        <StorefrontMotionProvider>
          <AuthProvider>
            <AnalyticsConsentGate />
            <CartProvider>
              <NavigationSpeedup />
              <ProductNavigationContextCapture />
              <LatinUppercaseFixer />
              <PremiumInteractions />
              <HomepageHeaderLogoVisibility />
              <MobileMenuAccordion
                themeSettings={themeSettings}
                categories={categories}
                collections={collections}
              />
              <Header
                themeSettings={themeSettings}
                categories={categories}
                collections={collections}
              />
              <main id="main-content" className="site-content">
                {children}
              </main>
              <Footer />
              <CartDrawer />
              <RewardsWidget />
              <FloatingWhatsApp settings={themeSettings.whatsapp} />
            </CartProvider>
          </AuthProvider>
        </StorefrontMotionProvider>
      </body>
    </html>
  );
}
