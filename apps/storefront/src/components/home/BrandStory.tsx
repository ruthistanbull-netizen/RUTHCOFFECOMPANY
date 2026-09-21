"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

export default function BrandStory() {
  const [storyOpen, setStoryOpen] = useState(false);

  return (
    <section className="bg-ivory px-4 py-24 md:px-8 md:py-36">
      <div className="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2 md:gap-20">
        <motion.div
          initial={{ opacity: 0, x: -35 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8 }}
          className="relative overflow-hidden rounded-lg ruth-glow"
        >
          <img
            src="/brand-rings-story.jpg"
            alt="Ruth Istanbul yüzükleri"
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
          <p className="mb-4 text-xs uppercase tracking-wide-luxe text-gold-dark">Ruth Istanbul’un Hikayesi</p>
          <h2 className="font-heading font-editorial text-balance" style={{ fontSize: "clamp(2rem, 5vw, 4rem)", color: "var(--ink)" }}>
            Antik semboller, modern anlar için yeniden yorumlandı.
          </h2>
          <p className="mt-6 max-w-xl leading-8 text-muted-ruth">
            Ruth Atelier; sıcak altın tonlarını, heykelsi formları ve sembolik detayları bir araya getirir.
            Her parça kişisel, sade ve akılda kalıcı bir his bırakmak için tasarlanır.
          </p>

          <button
            type="button"
            onClick={() => setStoryOpen((current) => !current)}
            className="mt-9 inline-flex rounded-full border border-gold/30 px-8 py-4 text-xs uppercase tracking-wide-luxe transition hover:border-gold active:scale-[0.98]"
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
                <div className="mt-6 rounded-2xl border border-gold/15 bg-cream/70 p-6 leading-8 text-muted-ruth">
                  <p>
                    Ruth Istanbul, 2023 yılında 925 ayar gümüş takıları mitolojik sembollerle buluşturma vizyonuyla kuruldu.
                  </p>
                  <p className="mt-4">
                    Markanın çıkış noktası, yalnızca estetik bir takı üretmek değil; geçmişten gelen sembolleri, bugünün sade ve güçlü tasarım diliyle yeniden yorumlamaktı. Bu vizyon, Istanbul’un köklü zanaat kültürüyle ve Kapalıçarşı’daki ustaların el işçiliğiyle birleşti.
                  </p>
                  <p className="mt-4">
                    Zamanla Ruth Istanbul, 925 ayar gümüş tasarımlarının yanında Brass ürünler de üretmeye başladı. Böylece markanın sembolik dünyası daha geniş formlara, daha sıcak altın tonlarına ve daha özgün tasarım detaylarına taşındı.
                  </p>
                  <p className="mt-4">
                    Bugün Ruth Istanbul, özellikle Mısır mitolojisinden ilham alan yenilikçi ve tarihi parçalar üretmeye devam ediyor. Her tasarım; bir sembolün, bir hikâyenin ve zamansız bir estetik anlayışın modern takı formuna dönüşmüş halini taşıyor.
                  </p>
                  <p className="mt-4">
                    Gelecekte ise Ruth Istanbul, farklı mitolojilerden ve temalardan ilham alarak bu hikâyeyi daha da genişletmeyi hedefliyor.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}
