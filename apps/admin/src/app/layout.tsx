import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@ruth-commerce/ui/semantic-tokens.css";
import "@ruth-commerce/ui/typography.css";
import "@ruth-commerce/ui/interaction.css";
import "@ruth-commerce/ui/feedback.css";
import "@ruth-commerce/ui/picker.css";
import "./base44-runtime.css";
import "./base44-mobile-fixes.css";
import "./mobile-panel-fixes.css";
import "./native-ios-shell.css";
import "./preparing-products-mobile-fix.css";
import "./auth-brand.css";
import "./popup-action-bar-standard.css";
import "./admin-surface-contract.css";
import "./base44-mobile-popup-polish.css";
import "./premium-panel-interactions.css";
import "./mobile-interaction-polish-v2.css";
import "./navigation-v4-overrides.css";
import "./admin-confirmation-popup.css";
import "./date-range-custom-trigger.css";
import "./theme-customizer-mobile.css";
import "./overlay-performance-fixes.css";
import "./ruthie-insight-soft-polish.css";
import "./ruthie-insight-motion-polish.css";
import "./ruthie-upload-menu-polish.css";
import "./admin-desert-rose-surfaces.css";
import "./admin-final-ui-polish.css";
import "./admin-header-modern-icons.css";
import "./ruthie-image-tool-menu-polish.css";
import "./ruthie-image-tool-fixes.css";
import "./ruthie-insight-popup-motion-fix.css";
import "./admin-user-logo.css";
import "./product-image-standard.css";
import "./notification-mobile-position.css";
import "./global-premium-motion.css";
import "./rosta-exact-palette.css";
import { AppFrame } from "@/components/AppFrame";
import { AdminBackupProgress } from "@/components/AdminBackupProgress";
import { AdminCacheEpoch } from "@/components/AdminCacheEpoch";
import { AdminConfirmationProvider } from "@/components/AdminConfirmationProvider";
import { AdminContactMessagePopup } from "@/components/AdminContactMessagePopup";
import { AdminNativeDockBridge } from "@/components/AdminNativeDockBridge";
import { AdminOrderStatusNormalizer } from "@/components/AdminOrderStatusNormalizer";
import { AdminOrdersBulkActions } from "@/components/AdminOrdersBulkActions";
import { AdminPanelUiRules } from "@/components/AdminPanelUiRules";
import { AdminRuthieInsightPopupMotion } from "@/components/AdminRuthieInsightPopupMotion";
import { AdminSavedViewControlsCleaner } from "@/components/AdminSavedViewControlsCleaner";
import { AdminStorageQuotaGuard } from "@/components/AdminStorageQuotaGuard";
import { AdminTodayDateDefaults } from "@/components/AdminTodayDateDefaults";
import { GmailConnectionAutoRefresh } from "@/components/GmailConnectionAutoRefresh";
import { MetaAdsInstantBootstrap } from "@/components/MetaAdsInstantBootstrap";
import { PremiumPanelInteractionEnhancer } from "@/components/PremiumPanelInteractionEnhancer";
import { ROSTA_PANEL_URL } from "@/lib/platform";

export const metadata: Metadata = {
  metadataBase: new URL(ROSTA_PANEL_URL),
  applicationName: "ROSTA Panel",
  title: { default: "ROSTA Control Room", template: "%s | ROSTA" },
  description: "ROSTA Coffee Co. yönetim paneli",
  manifest: "/manifest.webmanifest?v=25",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png?v=25", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=25", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/api/panel-home-icon?v=25", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon.svg"],
  },
  appleWebApp: { capable: true, title: "ROSTA Panel", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#F4F0E8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body data-ruth-typography="admin" data-rosta-panel="true">
        <AdminStorageQuotaGuard />
        <AdminCacheEpoch />
        <AdminTodayDateDefaults />
        <GmailConnectionAutoRefresh />
        <MetaAdsInstantBootstrap />
        <AdminNativeDockBridge />
        <AdminSavedViewControlsCleaner />
        <AdminPanelUiRules />
        <PremiumPanelInteractionEnhancer />
        <AdminRuthieInsightPopupMotion />
        <AdminConfirmationProvider />
        <AdminOrderStatusNormalizer />
        <AppFrame>
          <AdminOrdersBulkActions />
          <AdminBackupProgress />
          <AdminContactMessagePopup />
          {children}
        </AppFrame>
      </body>
    </html>
  );
}
