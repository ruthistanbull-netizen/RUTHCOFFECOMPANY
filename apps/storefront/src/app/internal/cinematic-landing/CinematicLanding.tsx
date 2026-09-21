"use client";

import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import { useRef } from "react";
import { formatPrice } from "@/lib/formatPrice";
import type { Collection, Product } from "@/types/site";
import styles from "./cinematic-landing.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

function productImage(product?: Product) {
  return product?.main_image_url || product?.image_urls?.[0] || "/hero-ring.png";
}

function secondProductImage(product?: Product) {
  if (!product) return "/hero-ring.png";
  const primary = productImage(product);
  return product.image_urls?.find((image) => image && image !== primary) || primary;
}

function collectionCover(collection?: Collection, fallback?: string) {
  return collection?.cover_image_url || fallback || "/hero-ring.png";
}

export default function CinematicLanding({
  heroImage,
  storyImages,
  collections,
  products,
  freeShippingThreshold,
}: {
  heroImage?: string | null;
  storyImages?: string[] | null;
  collections: Collection[];
  products: Product[];
  freeShippingThreshold: number;
}) {
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const sequenceRef = useRef<HTMLElement>(null);
  const atelierRef = useRef<HTMLElement>(null);

  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroScale = useTransform(heroProgress, [0, 1], [1, 1.12]);
  const heroY = useTransform(heroProgress, [0, 1], [0, 90]);
  const heroCopyY = useTransform(heroProgress, [0, 1], [0, -68]);
  const heroCopyOpacity = useTransform(heroProgress, [0, 0.68, 1], [1, 1, 0]);

  const { scrollYProgress: sequenceProgress } = useScroll({
    target: sequenceRef,
    offset: ["start start", "end end"],
  });

  const sceneOneOpacity = useTransform(sequenceProgress, [0, 0.25, 0.37], [1, 1, 0]);
  const sceneTwoOpacity = useTransform(sequenceProgress, [0.27, 0.41, 0.61, 0.72], [0, 1, 1, 0]);
  const sceneThreeOpacity = useTransform(sequenceProgress, [0.63, 0.77, 1], [0, 1, 1]);
  const sceneScale = useTransform(sequenceProgress, [0, 1], [1.08, 1]);

  const copyOneOpacity = useTransform(sequenceProgress, [0, 0.23, 0.34], [1, 1, 0]);
  const copyOneY = useTransform(sequenceProgress, [0, 0.34], [0, -32]);
  const copyTwoOpacity = useTransform(sequenceProgress, [0.28, 0.42, 0.59, 0.7], [0, 1, 1, 0]);
  const copyTwoY = useTransform(sequenceProgress, [0.28, 0.42, 0.7], [32, 0, -32]);
  const copyThreeOpacity = useTransform(sequenceProgress, [0.64, 0.78, 1], [0, 1, 1]);
  const copyThreeY = useTransform(sequenceProgress, [0.64, 0.78], [32, 0]);

  const { scrollYProgress: atelierProgress } = useScroll({
    target: atelierRef,
    offset: ["start end", "end start"],
  });
  const atelierScale = useTransform(atelierProgress, [0, 1], [1.1, 1]);
  const atelierY = useTransform(atelierProgress, [0, 1], [-36, 36]);

  const atelierCollection = collections.find((collection) => collection.slug === "ruthatelier") || collections[0];
  const nazarCollection = collections.find((collection) => collection.slug === "nazar") || collections[3];
  const sunCollection = collections.find((collection) => collection.slug === "sunkissed") || collections[2];

  const hero = collectionCover(
    atelierCollection,
    storyImages?.[0] || heroImage || productImage(products[0]),
  );
  const sceneImages = [
    collectionCover(sunCollection, storyImages?.[1] || productImage(products[1])),
    collectionCover(nazarCollection, storyImages?.[2] || productImage(products[2])),
    storyImages?.[3] || collectionCover(collections[4], productImage(products[3])),
  ];
  const atelierImage = storyImages?.[4] || collectionCover(collections[1], secondProductImage(products[0]));
  const leadProduct = products[0];
  const supportingProducts = products.slice(1, 5);
  const shippingLabel = new Intl.NumberFormat("tr-TR").format(freeShippingThreshold);

  return (
    <main className={styles.page}>
      <section ref={heroRef} className={styles.hero}>
        <motion.div
          className={styles.heroMedia}
          style={reduceMotion ? undefined : { scale: heroScale, y: heroY }}
          initial={reduceMotion ? false : { clipPath: "inset(7% 7% 7% 7%)", opacity: 0 }}
          animate={{ clipPath: "inset(0% 0% 0% 0%)", opacity: 1 }}
          transition={{ duration: 1.5, ease }}
        >
          <img src={hero} alt="Ruth Istanbul sinematik kampanya görseli" />
        </motion.div>
        <div className={styles.heroShade} />
        <div className={styles.heroGrain} />

        <motion.div
          className={styles.heroCopy}
          style={reduceMotion ? undefined : { y: heroCopyY, opacity: heroCopyOpacity }}
        >
          <motion.p
            className={styles.heroKicker}
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.35, ease }}
          >
            Ruth Istanbul · Film 01
          </motion.p>
          <h1 aria-label="Ruth Istanbul">
            <span className={styles.wordMask}>
              <motion.span
                initial={reduceMotion ? false : { y: "112%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1.15, delay: 0.18, ease }}
              >
                RUTH
              </motion.span>
            </span>
            <span className={styles.wordMask}>
              <motion.span
                initial={reduceMotion ? false : { y: "112%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1.15, delay: 0.3, ease }}
              >
                ISTANBUL
              </motion.span>
            </span>
          </h1>
          <motion.div
            className={styles.heroBottom}
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.72, ease }}
          >
            <p>Antik formlar. Modern ritüeller.</p>
            <Link href="/collections/ruthatelier">Koleksiyonu keşfet <span>↗</span></Link>
          </motion.div>
        </motion.div>

        <motion.div
          className={styles.heroFrameMeta}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
        >
          <span>İstanbul · 2026</span>
          <span>Kaydır</span>
        </motion.div>
      </section>

      <section className={styles.openingStatement}>
        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.9, ease }}
        >
          Geçmişten kalan sembolleri tekrar etmiyoruz.
          <br />Onlara bugün yeniden bakıyoruz.
        </motion.p>
        <div className={styles.openingMeta}>
          <span>925 ayar gümüş</span>
          <span>Pirinç</span>
          <span>İstanbul&apos;da tasarlandı</span>
        </div>
      </section>

      <section ref={sequenceRef} className={styles.sequenceSection}>
        <div className={styles.sequenceSticky}>
          <motion.div className={styles.sequenceImages} style={reduceMotion ? undefined : { scale: sceneScale }}>
            <motion.img src={sceneImages[0]} alt="Ruth Istanbul koleksiyon sahnesi" style={{ opacity: sceneOneOpacity }} />
            <motion.img src={sceneImages[1]} alt="Ruth Istanbul sembol sahnesi" style={{ opacity: sceneTwoOpacity }} />
            <motion.img src={sceneImages[2]} alt="Ruth Istanbul atölye sahnesi" style={{ opacity: sceneThreeOpacity }} />
          </motion.div>
          <div className={styles.sequenceShade} />
          <div className={styles.sequenceGrain} />

          <div className={styles.sequenceCopy}>
            <p className={styles.sequenceLabel}>Three scenes · One language</p>
            <div className={styles.sequenceStage}>
              <motion.article style={{ opacity: copyOneOpacity, y: copyOneY }}>
                <span>Scene 01 · Form</span>
                <h2>Işığın yüzeyde bıraktığı iz.</h2>
                <p>Heykelsi çizgiler, dokulu yüzeyler ve günlük stile taşınan antik referanslar.</p>
              </motion.article>
              <motion.article style={{ opacity: copyTwoOpacity, y: copyTwoY }}>
                <span>Scene 02 · Symbol</span>
                <h2>Bir süsten daha fazlası.</h2>
                <p>Nazar, güneş ve kadim işaretler; kişisel bir anlam taşıyan modern parçalara dönüşür.</p>
              </motion.article>
              <motion.article style={{ opacity: copyThreeOpacity, y: copyThreeY }}>
                <span>Scene 03 · Istanbul</span>
                <h2>Tasarım burada başlar.</h2>
                <p>Her parça İstanbul&apos;da tasarlanır; son dokunuşları ve kontrolleri elde tamamlanır.</p>
                <Link href="/about">Ruth&apos;un hikâyesi <b>↗</b></Link>
              </motion.article>
            </div>
          </div>

          <div className={styles.sequenceCounter}>
            <span>01</span><i /><span>03</span>
          </div>
          <motion.div className={styles.sequenceProgress}><motion.i style={{ scaleX: sequenceProgress }} /></motion.div>
        </div>
      </section>

      {collections.length > 0 && (
        <section className={styles.collectionsSection}>
          <motion.header
            className={styles.sectionHeader}
            initial={reduceMotion ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.85, ease }}
          >
            <div>
              <p>Collections</p>
              <h2>Her koleksiyon, ayrı bir sahne.</h2>
            </div>
            <Link href="/collections">Tüm koleksiyonlar <span>↗</span></Link>
          </motion.header>

          <div className={styles.collectionReel}>
            {collections.slice(0, 4).map((collection, index) => (
              <motion.article
                key={collection.id}
                className={styles.collectionPanel}
                initial={reduceMotion ? false : { opacity: 0, y: 42 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.8, delay: index * 0.08, ease }}
              >
                <Link href={`/collections/${collection.slug}`}>
                  <div className={styles.collectionImage}>
                    <img src={collectionCover(collection, productImage(products[index]))} alt={collection.name} />
                    <div />
                  </div>
                  <div className={styles.collectionText}>
                    <span>0{index + 1}</span>
                    <h3>{collection.name}</h3>
                    <b>↗</b>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
        </section>
      )}

      {leadProduct && (
        <section className={styles.spotlightSection}>
          <motion.div
            className={styles.spotlightMedia}
            initial={reduceMotion ? false : { opacity: 0, scale: 1.035 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 1, ease }}
          >
            <img src={productImage(leadProduct)} alt={leadProduct.name} />
            <span>Product study · 01</span>
          </motion.div>
          <motion.div
            className={styles.spotlightCopy}
            initial={reduceMotion ? false : { opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.85, ease }}
          >
            <p>Featured piece</p>
            <h2>{leadProduct.name}</h2>
            <div className={styles.spotlightDetails}>
              <span>{leadProduct.material || "Ruth Istanbul"}</span>
              <span>{formatPrice(Number(leadProduct.price || 0))}</span>
            </div>
            <p className={styles.spotlightBody}>
              {leadProduct.short_description || "Ruth Istanbul seçkisinden zamansız bir parça."}
            </p>
            <Link href={`/products/${leadProduct.slug}`}>Ürünü incele <span>↗</span></Link>
          </motion.div>

          <div className={styles.supportingGrid}>
            {supportingProducts.map((product, index) => (
              <motion.article
                key={product.id}
                initial={reduceMotion ? false : { opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.72, delay: index * 0.06, ease }}
              >
                <Link href={`/products/${product.slug}`}>
                  <div className={styles.supportingMedia}>
                    <img className={styles.supportingPrimary} src={productImage(product)} alt={product.name} />
                    {secondProductImage(product) !== productImage(product) && (
                      <img className={styles.supportingSecondary} src={secondProductImage(product)} alt="" aria-hidden="true" />
                    )}
                  </div>
                  <div className={styles.supportingMeta}>
                    <h3>{product.name}</h3>
                    <span>{formatPrice(Number(product.price || 0))}</span>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
        </section>
      )}

      <section ref={atelierRef} className={styles.atelierSection}>
        <motion.div
          className={styles.atelierMedia}
          style={reduceMotion ? undefined : { scale: atelierScale, y: atelierY }}
        >
          <img src={atelierImage} alt="Ruth Atelier kampanya sahnesi" />
        </motion.div>
        <div className={styles.atelierShade} />
        <motion.div
          className={styles.atelierCopy}
          initial={reduceMotion ? false : { opacity: 0, y: 38 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.9, ease }}
        >
          <p>Ruth Atelier · Final scene</p>
          <h2>Her parçanın izi elde tamamlanır.</h2>
          <Link href="/collections/ruthatelier">Atelier&apos;i keşfet <span>↗</span></Link>
        </motion.div>
        <div className={styles.atelierMeta}><span>İstanbul</span><span>2026</span></div>
      </section>

      <section className={styles.closingStatement}>
        <motion.h2
          initial={reduceMotion ? false : { opacity: 0, y: 34 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.9, ease }}
        >
          Takı değil yalnızca.
          <br />Taşınan bir hikâye.
        </motion.h2>
        <Link href="/products">Tüm parçaları keşfet <span>↗</span></Link>
      </section>

      <section className={styles.serviceStrip}>
        <div><span>01</span><p>3–5 iş gününde kargo</p></div>
        <div><span>02</span><p>{shippingLabel} TL üzeri ücretsiz kargo</p></div>
        <div><span>03</span><p>Güvenli ödeme</p></div>
        <div><span>04</span><p>Kolay değişim</p></div>
      </section>
    </main>
  );
}
