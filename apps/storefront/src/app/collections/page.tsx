import Link from "next/link";
import { AnimatedBlock, PageIntro } from "@/components/PageIntro";
import { getCachedCollections } from "@/data/catalogCache";

export const metadata = {
  title: "Koleksiyonlar",
  description: "Ruth Istanbul koleksiyonlarını keşfet.",
};

export const revalidate = 600;

export default async function CollectionsPage() {
  const collections = await getCachedCollections();

  return (
    <div className="min-h-screen bg-ivory pt-[calc(var(--announcement-height,0px)+96px)]">
      <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
        <PageIntro
          eyebrow="Keşfet"
          title="Koleksiyonlar"
          description="Ruth Istanbul koleksiyonlarını keşfet."
          className="mb-10 md:mb-14"
        />

        {collections.length === 0 ? (
          <p className="text-center text-muted-ruth">Henüz aktif koleksiyon bulunmuyor.</p>
        ) : (
          <div className="space-y-5 md:space-y-7">
            {collections.map((collection, index) => (
              <AnimatedBlock key={collection.id} delay={index * 0.08}>
                <Link
                  href={`/collections/${collection.slug}`}
                  className="group grid overflow-hidden rounded-[24px] bg-cream shadow-[0_14px_42px_rgba(65,47,31,.07)] md:grid-cols-2"
                  style={{ border: "1px solid rgba(184,151,106,0.12)" }}
                >
                  <div className={`relative h-[230px] overflow-hidden sm:h-[270px] md:h-[300px] ${index % 2 ? "md:order-2" : ""}`}>
                    {collection.cover_image_url ? (
                      <img src={collection.cover_image_url} alt={collection.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    ) : (
                      <div className="ruth-card-gradient h-full w-full" />
                    )}
                  </div>
                  <div className="flex flex-col justify-center p-6 md:p-9">
                    <p className="mb-2 text-[10px] uppercase tracking-wide-luxe text-gold-dark">Koleksiyon</p>
                    <h2 className="font-heading text-3xl text-ink md:text-4xl">{collection.name}</h2>
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-ruth">{collection.description || "Ruth Istanbul seçili koleksiyonu."}</p>
                    <span className="mt-5 text-[10px] uppercase tracking-wide-luxe text-gold-dark">Keşfet</span>
                  </div>
                </Link>
              </AnimatedBlock>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
