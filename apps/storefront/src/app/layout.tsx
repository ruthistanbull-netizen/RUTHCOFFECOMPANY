import type { Metadata, Viewport } from "next";
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
import "./theme.css";
import "./storefront-backgrounds.css";
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
import { ThemeEditorBridgeV3 } from "@/components/theme/ThemeEditorBridgeV3";
import { ThemeEditorContextGestureBridge } from "@/components/theme/ThemeEditorContextGestureBridge";
import { ThemeEditorDirectImageBridge } from "@/components/theme/ThemeEditorDirectImageBridge";
import { SemanticThemeEditorBridge } from "@/components/theme/SemanticThemeEditorBridge";
import { ThemeEditorEnhancements } from "@/components/theme/ThemeEditorEnhancements";
import { ThemeEditorNativeNavigation } from "@/components/theme/ThemeEditorNativeNavigation";
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

export const revalidate = 10;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111111",
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
    icon: [
      { url: "/rosta-bean-favicon-v6.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/favicon.png?v=6", sizes: "192x192", type: "image/png" },
    ],
    shortcut: ["/rosta-bean-favicon-v6.svg"],
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

  const themeStyle = {
    "--rosta-carbon": "#111111",
    "--rosta-carbon-soft": "#242424",
    "--rosta-cream": "#FBF3E6",
    "--rosta-espresso": "#38251C",
    "--rosta-brick-b": "#C94A40",
    "--rosta-cocoa": "#6B4638",
    "--rosta-kraft": "#C8A77D",
    "--rosta-action-text": "#FFFFFF",
    "--background": "#111111",
    "--foreground": "#FBF3E6",
    "--ivory": "#FBF3E6",
    "--cream": "#FBF3E6",
    "--ink": "#111111",
    "--gold": "#C94A40",
    "--gold-dark": "#38251C",
    "--bronze": "#6B4638",
    "--muted-foreground": "#6B4638",
    "--font-heading": 'var(--font-archivo), "Arial Black", "Helvetica Neue", Arial, sans-serif',
    "--font-body": 'var(--font-inter), "Helvetica Neue", Arial, sans-serif',
    "--font-editorial": 'var(--font-archivo), "Arial Black", "Helvetica Neue", Arial, sans-serif',
    "--ruth-font-display": 'var(--font-archivo), "Arial Black", "Helvetica Neue", Arial, sans-serif',
    "--ruth-font-body": 'var(--font-inter), "Helvetica Neue", Arial, sans-serif',
    "--ruth-color-canvas": "#111111",
    "--ruth-color-surface": "#242424",
    "--ruth-color-surface-muted": "#242424",
    "--ruth-color-surface-elevated": "#242424",
    "--ruth-color-surface-inverse": "#FBF3E6",
    "--ruth-color-text-primary": "#FBF3E6",
    "--ruth-color-text-muted": "color-mix(in srgb, #FBF3E6 72%, transparent)",
    "--ruth-color-text-inverse": "#FBF3E6",
    "--ruth-color-text-on-light": "#111111",
    "--ruth-color-text-on-action": "#FFFFFF",
    "--ruth-color-accent": "#C94A40",
    "--ruth-color-accent-soft": "color-mix(in srgb, #C94A40 15%, transparent)",
    "--ruth-color-accent-strong": "#38251C",
    "--ruth-color-accent-wash": "color-mix(in srgb, #C94A40 15%, transparent)",
    "--ruth-color-border-subtle": "color-mix(in srgb, #C8A77D 42%, transparent)",
    "--ruth-color-border-strong": "#C8A77D",
    "--ruth-color-focus": "#C94A40",
    "--ruth-color-selected": "#C94A40",
    "--ruth-color-overlay": "color-mix(in srgb, #111111 72%, transparent)",
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
        className="site-app-shell"
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
            .product-card-current,
            .product-card-compare,
            .product-card-sale-pill,
            .product-price,
            .product-detail-sale-pill,
            .product-purchase-price,
            .product-purchase-mobile-price,
            .product-variant-picker [class*="price"],
            .ruth-mobile-link-accordion__child,
            .ruth-mobile-photo-collection-card__label,
            .ruth-zara-desktop-child,
            .ruth-zara-menu-copy__link
          ) {
            font-family: var(--font-body) !important;
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
        <SemanticThemeEditorBridge />
        <ThemeEditorNativeNavigation />
        <ThemeEditorEnhancements />
        <ThemeEditorBridgeV3 settings={themeSettings} />
        <ThemeEditorContextGestureBridge />
        <ThemeEditorDirectImageBridge />
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
              <RostaPointsWidget themeSettings={themeSettings} />
              <FloatingWhatsApp settings={themeSettings.whatsapp} />
            </CartProvider>
          </AuthProvider>
        </StorefrontMotionProvider>
      </body>
    </html>
  );
}
