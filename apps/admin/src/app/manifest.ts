import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ROSTA Coffee Co. Control Room",
    short_name: "ROSTA Panel",
    description: "ROSTA Coffee Co. sipariş, kargo, ödeme, müşteri ve mağaza operasyon paneli",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4F0E8",
    theme_color: "#F4F0E8",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png?v=25",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=25",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=25",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
