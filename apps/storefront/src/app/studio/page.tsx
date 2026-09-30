import type { Metadata } from "next";
import { RostaStudioClient } from "./RostaStudioClient";

const description =
  "Kahve işletmeleri için bar kurulumu, reçete ve ürün geliştirme, marka ve konsept danışmanlığı.";

export const metadata: Metadata = {
  title: "ROSTA.Studio",
  description,
  alternates: { canonical: "/studio" },
  openGraph: {
    title: "ROSTA.Studio",
    description,
    url: "/studio",
    images: [
      {
        url: "/home/rosta-under-hero-photo.jpg",
        alt: "ROSTA.Studio kahve danışmanlığı",
      },
    ],
  },
};

export default function RostaStudioPage() {
  return <RostaStudioClient />;
}
