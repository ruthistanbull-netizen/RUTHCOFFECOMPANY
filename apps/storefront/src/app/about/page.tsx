import BrandStory from "@/components/home/BrandStory";
import { PageIntro } from "@/components/PageIntro";

export const metadata = {
  title: "Hakkımızda",
  description:
    "ROSTA Coffee Co.’nun kahve yaklaşımını, ürün seçimini ve kahve deneyimine bakışını keşfet.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-ivory pt-24">
      <section className="px-4 py-16 md:px-8 md:py-24">
        <PageIntro
          eyebrow="ROSTA Coffee Co."
          title="İyi kahve, net bir yaklaşım."
          description="ROSTA; çekirdek seçiminden fincandaki son tada kadar kahveyi daha anlaşılır, tutarlı ve ulaşılabilir hale getirmeyi hedefleyen bir kahve markasıdır."
          className="mx-auto max-w-4xl"
        />
      </section>
      <BrandStory />
    </div>
  );
}
