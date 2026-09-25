"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Collection } from "@/types/site";

export default function CollectionCards({ collections }: { collections: Collection[] }) {
  const visibleCollections = [...collections]
    .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name, "tr"))
    .slice(0, 4);

  if (visibleCollections.length === 0) return null;

  return (
    <section className="bg-carbon px-4 py-20 text-cream md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.62, ease: "easeOut" }}
          className="mb-10 text-center md:mb-14"
        >
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.22em] text-brick">Keşfet</p>
          <h2 className="font-heading font-editorial text-[clamp(1.9rem,4vw,3.2rem)] font-normal text-cream">
            Koleksiyonlar
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5">
          {visibleCollections.map((collection, index) => {
            const cover = collection.cover_image_url;

            return (
              <motion.div
                key={collection.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: index * 0.06 }}
                className="min-w-0"
              >
                <Link href={`/collections/${collection.slug}`} className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brick">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-[22px] bg-cream shadow-[0_14px_38px_color-mix(in_srgb,var(--rosta-carbon)_52%,transparent)]">
                    {cover ? (
                      <img
                        src={cover}
                        alt={collection.name}
                        className="collection-card-image h-full w-full object-cover transition-transform duration-700"
                      />
                    ) : (
                      <div className="ruth-card-gradient h-full w-full" />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-ink/52 via-ink/5 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                      <p className="mb-1 text-[9px] font-medium uppercase tracking-[0.18em] text-cream/80">Koleksiyon</p>
                      <h3 className="font-heading font-editorial text-xl font-normal text-cream md:text-2xl">{collection.name}</h3>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
      <style>{`
        @media (hover: hover) and (pointer: fine) {
          .group:hover .collection-card-image { transform: scale(1.025); }
        }
        @media (prefers-reduced-motion: reduce) {
          .collection-card-image { transition: none; }
        }
      `}</style>
    </section>
  );
}
