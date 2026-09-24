import type { Metadata } from "next";
import "./ruthie-experience-polish.css";

export const metadata: Metadata = {
  applicationName: "ROSTA Insight",
  title: "ROSTA Insight",
  description: "ROSTA Coffee Co. operasyon ve ticaret asistanı",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/api/panel-icon/180", sizes: "180x180", type: "image/png" }],
    apple: [{ url: "/api/panel-icon/180", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "ROSTA Insight",
    statusBarStyle: "default",
  },
};

export default function RuthieLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
