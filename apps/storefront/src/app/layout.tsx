import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
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
import "./rosta-points-motion.css";
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
import { LatinUppercaseFixer } from "@/components/LatinUppercaseFixer";
import { FloatingWhatsApp } from "@/components/FloatingWhatsApp";
import { RostaPointsWidget } from "@/components/RostaPointsWidget";
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

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
});

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  weight: ["900"],
  display: "swap",
  variable: "--font-archivo",
  preload: true,
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F0E8",
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
    images: [{ url: DEFAULT_OG_IMAGE, alt: `${SITE_NAME} kahve ve kahve deneyimi` }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SEO_TITLE,
    description: DEFAULT_SEO_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  icons: {
    icon: [{ url: "/favicon.png?v=4", sizes: "192x192", type: "image/png" }],
    shortcut: ["/favicon.png?v=4"],
    apple: [{ url: "/apple-touch-icon.png?v=4", sizes: "180x180", type: "image/png" }],
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
    "--ivory": colors.ivory || "#F4F0E8",
    "--cream": colors.cream || "#F4F0E8",
    "--ink": colors.ink || "#111111",
    "--gold": colors.gold || "#B9563D",
    "--gold-dark": colors.goldDark || "#2B1B16",
    "--muted-foreground": colors.muted || "#6F725B",
    "--background": colors.ivory || "#F4F0E8",
    "--foreground": colors.ink || "#111111",
    "--font-heading": 'var(--font-archivo), "Arial Black", "Helvetica Neue", Arial, sans-serif',
    "--font-body": 'var(--font-inter), "Helvetica Neue", Arial, sans-serif',
    "--font-editorial": 'var(--font-archivo), "Arial Black", "Helvetica Neue", Arial, sans-serif',
    "--ruth-font-display": 'var(--font-archivo), "Arial Black", "Helvetica Neue", Arial, sans-serif',
    "--ruth-font-body": 'var(--font-inter), "Helvetica Neue", Arial, sans-serif',
    "--ruth-color-canvas": colors.ivory || "#F4F0E8",
    "--ruth-color-surface": colors.cream || "#F4F0E8",
    "--ruth-color-surface-muted": colors.cream || "#F4F0E8",
    "--ruth-color-text-primary": colors.ink || "#111111",
    "--ruth-color-text-muted": colors.muted || "#6F725B",
    "--ruth-color-accent": colors.gold || "#B9563D",
    "--ruth-color-accent-soft": "color-mix(in srgb, #B9563D 28%, #F4F0E8)",
    "--ruth-color-accent-strong": colors.goldDark || "#2B1B16",
    "--ruth-color-border-subtle": "rgba(170, 168, 161, 0.48)",
    "--ruth-color-border-strong": "#AAA8A1",
    "--ruth-color-focus": "#B9563D",
    "--ruth-color-overlay": "rgba(17, 17, 17, 0.44)",
    "--ruth-color-text-inverse": "#F4F0E8",
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
        className={`${inter.variable} ${archivo.variable} site-app-shell`}
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
            font-family: var(--font-body);
          }
          .site-app-shell :where(
            p, span, a, button, input, select, textarea, label, small,
            li, dt, dd, th, td, time, address
          ) {
            font-family: var(--font-body);
          }
          .site-app-shell :where(
            h1, h2, h3, h4, h5, h6,
            .font-heading, .font-editorial, .font-serif,
            .ruth-type-display, .ruth-type-page-title, .ruth-type-section-title,
            [data-ruth-text-role="display"],
            [data-ruth-text-role="page-title"],
            [data-ruth-text-role="section-title"],
            .ruth-mobile-link-accordion__title,
            .ruth-zara-main-tab,
            .ruth-zara-desktop-link,
            .product-title,
            .product-card-name
          ) {
            font-family: var(--font-heading) !important;
          }
          .site-app-shell :where(
            .font-heading, .font-editorial, .font-serif,
            .ruth-type-display, .ruth-type-page-title, .ruth-type-section-title,
            [data-ruth-text-role="display"],
            [data-ruth-text-role="page-title"],
            [data-ruth-text-role="section-title"],
            .ruth-mobile-link-accordion__title,
            .ruth-zara-main-tab,
            .ruth-zara-desktop-link
          ) {
            font-weight: 900;
            letter-spacing: -0.03em;
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
              <RostaPointsWidget />
              <FloatingWhatsApp settings={themeSettings.whatsapp} />
            </CartProvider>
          </AuthProvider>
        </StorefrontMotionProvider>
      </body>
    </html>
  );
}
