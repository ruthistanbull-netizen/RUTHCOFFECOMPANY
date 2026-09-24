import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  applicationName: "Ruthie",
  title: "Ruthie",
  description: "Ruthie sesli asistan",
  manifest: "/ruthie-voice.webmanifest?v=3",
  icons: {
    icon: [
      {
        url: "/ruth-panel-icon-static-180.png?v=10",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png?v=10",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Ruthie",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#050403",
};

export default function RuthieVoiceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
