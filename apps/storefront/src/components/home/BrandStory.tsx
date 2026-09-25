"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

export default function BrandStory() {
  const [storyOpen, setStoryOpen] = useState(false);

  return (
    <section className="bg-carbon-soft px-4 py-24 text-cream md:px-8 md:py-36">
      <div className="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2 md:gap-20">
        <motion.div
          initial={{ opacity: 0, x: -35 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="relative overflow-hidden rounded-lg ruth-glow"
        >
          <img
            src="/home/rosta-under-hero-photo.jpg"
            alt="ROSTA Coffee Co. kahve"
            className="aspect-[4/5] h-full w-full object-cover"
            loading="lazy"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 35 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
        >
          <p className="mb-4 text-xs uppercase tracking-wide-luxe text-brick">ROSTA’nın Hikayesi</p>
          <h2 className="font-heading font-editorial text-balance" style={{ fontSize: "clamp(2rem, 5vw, 4rem)", color: "var(--rosta-cream)" }}>
            Kahveyi sadeleştir, karakterini koru.
          </h2>
          <p className="mt-6 max-w-xl leading-8 text-cream/70">
            ROSTA Coffee Co.; günlük kahve deneyimi, doğru ürün seçimi ve tutarlı lezzet üzerine kurulu.
            Amacımız kahveyi gereksiz karmaşadan uzaklaştırıp çekirdeğin karakterini öne çıkarmak.
          </p>

          <button
            type="button"
            onClick={() => setStoryOpen((current) => !current)}
            className="brand-story-toggle mt-9 inline-flex rounded-full border border-kraft/45 px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream transition active:border-espresso active:bg-espresso active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
            aria-expanded={storyOpen}
          >
            {storyOpen ? "Hikayeyi Kapat" : "Hikayeyi Oku"}
          </button>

          <AnimatePresence initial={false}>
            {storyOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0, y: -6 }}
                animate={{ height: "auto", opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-6 rounded-2xl border border-kraft/35 bg-carbon p-6 leading-8 text-cream/70">
                  <p>ROSTA, kahveyi ürünün kendisinden başlayarak ele alır: doğru çekirdek, doğru kavrum ve doğru kullanım.</p>
                  <p className="mt-4">Perakende tarafta evde iyi kahve hazırlamayı kolaylaştıran ürünler sunarken; profesyonel tarafta işletmelerin kahve standardını geliştirecek çözümler üretmeyi hedefler.</p>
                  <p className="mt-4">Her ürünün arkasında anlaşılır bilgi, izlenebilir operasyon ve sürdürülebilir bir alışveriş deneyimi bulunması ROSTA’nın temel yaklaşımıdır.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
      <style>{`
        @media (hover: hover) and (pointer: fine) {
          .brand-story-toggle:hover {
            border-color: var(--rosta-brick-b);
            background: color-mix(in srgb, var(--rosta-brick-b) 10%, transparent);
          }
        }
      `}</style>
    </section>
  );
}
