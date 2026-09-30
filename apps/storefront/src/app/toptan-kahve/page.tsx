import type { Metadata } from "next";
import { ToptanKahveClient } from "./ToptanKahveClient";

const description = "İşletmeniz için kahve seçimini, tahmini tüketimi ve toptan çalışma koşullarını ROSTA ile değerlendirin. Toptan kahve talebinizi paylaşın.";

export const metadata: Metadata = {
  title: "Toptan Kahve | ROSTA",
  description,
  alternates: { canonical: "/toptan-kahve" },
  openGraph: {
    title: "Toptan Kahve | ROSTA",
    description,
    url: "/toptan-kahve",
    images: [{ url: "/home/rosta-espresso.webp", alt: "ROSTA işletmeler için toptan kahve" }],
  },
};

export default function ToptanKahvePage() {
  return <ToptanKahveClient />;
}
