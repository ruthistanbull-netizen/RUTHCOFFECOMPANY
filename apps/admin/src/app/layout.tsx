import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "@ruth-commerce/ui/semantic-tokens.css";
import "@ruth-commerce/ui/typography.css";
import "@ruth-commerce/ui/interaction.css";
import "@ruth-commerce/ui/feedback.css";
import "@ruth-commerce/ui/picker.css";
import "./globals.css";
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
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { ROSTA_PANEL_URL } from "@/lib/platform";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(ROSTA_PANEL_URL),
  applicationName: "ROSTA Panel",
  title: { default: "ROSTA Control Room", template: "%s | ROSTA" },
  description: "ROSTA Coffee Co. yönetim paneli",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F0E8",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className={inter.variable} data-ruth-typography="admin" data-rosta-panel="true">
        <AdminAuthGate>{children}</AdminAuthGate>
      </body>
    </html>
  );
}
