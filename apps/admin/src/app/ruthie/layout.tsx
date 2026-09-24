import type { Metadata } from "next";
import "./ruthie-experience-polish.css";

export const metadata: Metadata = {
  applicationName: "Ruthie Sesli",
  title: "Ruthie Sesli",
  description: "Ruthie sesli yönetici asistanı",
  manifest: "/ruthie-voice.webmanifest?v=9",
  icons: {
    icon: [
      {
        url: "/ruth-panel-icon-static-180.png?v=9",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png?v=9",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Ruthie Sesli",
    statusBarStyle: "default",
  },
};

export default function RuthieLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
