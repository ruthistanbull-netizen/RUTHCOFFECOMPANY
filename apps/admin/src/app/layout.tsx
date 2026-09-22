import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import "@ruth-commerce/ui/semantic-tokens.css";
import "@ruth-commerce/ui/typography.css";
import "./globals.css";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { ROSTA_PANEL_URL } from "@/lib/platform";


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
      <body className={`${inter.variable} ${archivo.variable}`}>
        <AdminAuthGate><AdminShell>{children}</AdminShell></AdminAuthGate>
      </body>
    </html>
  );
}
