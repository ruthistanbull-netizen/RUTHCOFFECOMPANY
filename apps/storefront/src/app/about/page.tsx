import BrandStory from "@/components/home/BrandStory";
import { PageIntro } from "@/components/PageIntro";

export const metadata = {
  title: "Hakkımızda",
  description:
    "Ruth Istanbul'un marka hikayesini, İstanbul'dan ve antik sembollerden ilham alan modern takı yaklaşımını keşfet.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-ivory pt-24">
      <section className="px-4 py-16 md:px-8 md:py-24">
        <PageIntro
          eyebrow="Ruth Istanbul"
          title="Günlük anlar için takılar."
          description="Ruth Istanbul; Istanbul’un zamansız hissinden, antik sembollerden ve modern çizgilerden ilham alan bir takı markasıdır. Her parça günlük kullanımda sade ama güçlü bir imza bırakmak için tasarlanır."
          className="mx-auto max-w-4xl"
        />
      </section>
      <BrandStory />
    </div>
  );
}
