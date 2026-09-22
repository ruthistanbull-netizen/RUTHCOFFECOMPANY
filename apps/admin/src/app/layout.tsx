import type { Metadata, Viewport } from "next";\nimport { Archivo, Inter } from "next/font/google";
import "@ruth-commerce/ui/semantic-tokens.css";
import "@ruth-commerce/ui/typography.css";
import "./globals.css";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { ROSTA_PANEL_URL } from "@/lib/platform";

\nconst inter = Inter({\n  subsets: ["latin", "latin-ext"],\n  weight: ["400", "500", "700"],\n  display: "swap",\n  variable: "--font-inter",\n  preload: true,\n});\n\nconst archivo = Archivo({\n  subsets: ["latin", "latin-ext"],\n  weight: ["900"],\n  display: "swap",\n  variable: "--font-archivo",\n  preload: true,\n});\n\nexport const metadata: Metadata = {
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
