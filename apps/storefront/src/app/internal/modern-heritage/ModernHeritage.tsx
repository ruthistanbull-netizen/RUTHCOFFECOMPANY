"use client";

import Link from "next/link";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useRef } from "react";
import type { Collection, Product } from "@/types/site";
import { formatPrice } from "@/lib/formatPrice";
import styles from "./modern-heritage.module.css";

function primaryProductImage(product?: Product) {
  return product?.main_image_url || product?.image_urls?.[0] || "/hero-ring.png";
}

function secondaryProductImage(product: Product) {
  const primary = primaryProductImage(product);
  return product.image_urls?.find((image) => image && image !== primary) || primary;
}

function collectionImage(collection: Collection, index: number, products: Product[]) {
  return collection.cover_image_url || primaryProductImage(products[index] || products[0]);
}

const revealEase = [0.22, 1, 0.36, 1] as const;

export default function ModernHeritage({
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
  const storyRef = useRef<HTMLElement>(null);
  const atelierRef = useRef<HTMLElement>(null);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const imageX = useSpring(pointerX, { stiffness: 90, damping: 22, mass: 0.7 });
  const imageY = useSpring(pointerY, { stiffness: 90, damping: 22, mass: 0.7 });

  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroCopyY = useTransform(heroProgress, [0, 1], [0, -72]);
  const heroMediaY = useTransform(heroProgress, [0, 1], [0, 90]);
  const heroMediaScale = useTransform(heroProgress, [0, 1], [1, 1.035]);

  const { scrollYProgress: storyProgress } = useScroll({
    target: storyRef,
    offset: ["start start", "end end"],
  });

  const imageOneOpacity = useTransform(storyProgress, [0, 0.27, 0.4], [1, 1, 0]);
  const imageTwoOpacity = useTransform(storyProgress, [0.27, 0.42, 0.61, 0.72], [0, 1, 1, 0]);
  const imageThreeOpacity = useTransform(storyProgress, [0.61, 0.76, 1], [0, 1, 1]);
  const storyImageScale = useTransform(storyProgress, [0, 1], [1.04, 1]);

  const copyOneOpacity = useTransform(storyProgress, [0, 0.22, 0.34], [1, 1, 0]);
  const copyOneY = useTransform(storyProgress, [0, 0.34], [0, -28]);
  const copyTwoOpacity = useTransform(storyProgress, [0.28, 0.43, 0.58, 0.68], [0, 1, 1, 0]);
  const copyTwoY = useTransform(storyProgress, [0.28, 0.43, 0.68], [28, 0, -28]);
  const copyThreeOpacity = useTransform(storyProgress, [0.62, 0.77, 1], [0, 1, 1]);
  const copyThreeY = useTransform(storyProgress, [0.62, 0.77], [28, 0]);

  const { scrollYProgress: atelierProgress } = useScroll({
    target: atelierRef,
    offset: ["start end", "end start"],
  });
  const atelierImageY = useTransform(atelierProgress, [0, 1], [-42, 42]);

  const hero = heroImage || primaryProductImage(products[0]) || collections[0]?.cover_image_url || "/hero-ring.png";
  const storyMedia = [
    storyImages?.[0] || collections[0]?.cover_image_url || primaryProductImage(products[0]),
    storyImages?.[1] || primaryProductImage(products[1] || products[0]),
    storyImages?.[2] || collections[1]?.cover_image_url || primaryProductImage(products[2] || products[0]),
  ];
  const atelierImage =
    storyImages?.[3] || collections[2]?.cover_image_url || primaryProductImage(products[3] || products[0]);

  const shippingLabel = new Intl.NumberFormat("tr-TR").format(freeShippingThreshold);

  return (
    <main className={styles.page}>
      <section
        ref={heroRef}
        className={styles.hero}
        onPointerMove={(event) => {
          if (reduceMotion) return;
          const rect = event.currentTarget.getBoundingClientRect();
          pointerX.set(((event.clientX - rect.left) / rect.width - 0.5) * 10);
          pointerY.set(((event.clientY - rect.top) / rect.height - 0.5) * 10);
        }}
        onPointerLeave={() => {
          pointerX.set(0);
          pointerY.set(0);
        }}
      >
        <motion.div className={styles.heroCopy} style={reduceMotion ? undefined : { y: heroCopyY }}>
          <motion.p
            className={styles.eyebrow}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: revealEase }}
          >
            Ruth Istanbul · Modern Heritage
          </motion.p>

          <h1 className={styles.heroTitle}>
            <span className={styles.titleMask}>
              <motion.span
                initial={reduceMotion ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1, delay: 0.08, ease: revealEase }}
              >
                Geçmişin izleri.
              </motion.span>
            </span>
            <span className={styles.titleMask}>
              <motion.span
                initial={reduceMotion ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 1, delay: 0.18, ease: revealEase }}
              >
                Bugünün takıları.
              </motion.span>
            </span>
          </h1>

          <motion.p
            className={styles.heroBody}
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.42, ease: revealEase }}
          >
            Mitolojiden ve antik formlardan ilham alan parçalar; İstanbul&apos;da tasarlanır,
            günlük hayatın içinde uzun süre yaşaması için tamamlanır.
          </motion.p>

          <motion.div
            className={styles.heroActions}
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.56, ease: revealEase }}
          >
            <Link href="/collections/ruthatelier" className={styles.primaryLink}>
              Koleksiyonu keşfet <span>→</span>
            </Link>
            <Link href="/category/new-arrivals" className={styles.secondaryLink}>
              Yeni gelenler
            </Link>
          </motion.div>

          <motion.div
            className={styles.heroNotes}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.75 }}
          >
            <span>İstanbul&apos;da tasarlandı</span>
            <span>925 gümüş &amp; pirinç</span>
          </motion.div>
        </motion.div>

        <motion.div
          className={styles.heroVisual}
          style={reduceMotion ? undefined : { y: heroMediaY, scale: heroMediaScale }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.1, ease: revealEase }}
        >
          <motion.div className={styles.heroImageLayer} style={reduceMotion ? undefined : { x: imageX, y: imageY }}>
            <motion.img
              src={hero}
              alt="Ruth Istanbul kampanya görseli"
              initial={reduceMotion ? false : { scale: 1.065 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.8, ease: revealEase }}
            />
          </motion.div>
          <div className={styles.heroVeil} />
          <div className={styles.heroVisualTop}>Campaign 01 · 2026</div>
          <div className={styles.heroVisualBottom}>
            <span>Ruth Atelier</span>
            <span>İstanbul</span>
          </div>
        </motion.div>

        <motion.div
          className={styles.scrollPrompt}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.8 }}
        >
          <span>Kaydır</span>
          <i />
        </motion.div>
      </section>

      {collections.length > 0 && (
        <section className={styles.collectionSection}>
          <motion.header
            className={styles.sectionHeader}
            initial={reduceMotion ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: revealEase }}
          >
            <div>
              <p className={styles.sectionKicker}>Koleksiyonlar</p>
              <h2>Dört form, tek bir Ruth dili.</h2>
            </div>
            <Link href="/collections">Tümünü gör <span>→</span></Link>
          </motion.header>

          <div className={styles.collectionGrid}>
            {collections.map((collection, index) => (
              <motion.article
                key={collection.id}
                className={`${styles.collectionCard} ${index === 0 || index === 3 ? styles.collectionWide : styles.collectionNarrow}`}
                initial={reduceMotion ? false : { opacity: 0, y: 42 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.8, delay: index * 0.07, ease: revealEase }}
              >
                <Link href={`/collections/${collection.slug}`}>
                  <div className={styles.collectionMedia}>
                    <img src={collectionImage(collection, index, products)} alt={collection.name} />
                    <div className={styles.collectionWash} />
                    <span className={styles.collectionIndex}>0{index + 1}</span>
                  </div>
                  <div className={styles.collectionMeta}>
                    <div>
                      <span>Koleksiyon</span>
                      <h3>{collection.name}</h3>
                    </div>
                    <span className={styles.arrow}>↗</span>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
        </section>
      )}

      {products.length > 0 && (
        <section className={styles.productsSection}>
          <motion.header
            className={styles.sectionHeader}
            initial={reduceMotion ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: revealEase }}
          >
            <div>
              <p className={styles.sectionKicker}>Yeni gelenler</p>
              <h2>Şimdi Ruth&apos;ta.</h2>
            </div>
            <Link href="/category/new-arrivals">Seçkinin tamamı <span>→</span></Link>
          </motion.header>

          <div className={styles.productGrid}>
            {products.map((product, index) => {
              const primary = primaryProductImage(product);
              const secondary = secondaryProductImage(product);
              const hasSecondary = secondary !== primary;

              return (
                <motion.article
                  key={product.id}
                  className={styles.productCard}
                  initial={reduceMotion ? false : { opacity: 0, y: 34 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-70px" }}
                  transition={{ duration: 0.7, delay: (index % 4) * 0.06, ease: revealEase }}
                >
                  <Link href={`/products/${product.slug}`}>
                    <div className={styles.productMedia}>
                      <img className={styles.productPrimary} src={primary} alt={product.name} />
                      {hasSecondary && (
                        <img className={styles.productSecondary} src={secondary} alt="" aria-hidden="true" />
                      )}
                      {product.is_new && <span className={styles.productBadge}>Yeni</span>}
                      <span className={styles.productDiscover}>İncele ↗</span>
                    </div>
                    <div className={styles.productMeta}>
                      <div>
                        <h3>{product.name}</h3>
                        <p>{product.material || "Ruth Istanbul"}</p>
                      </div>
                      <span>{formatPrice(Number(product.price || 0))}</span>
                    </div>
                  </Link>
                </motion.article>
              );
            })}
          </div>
        </section>
      )}

      <section ref={storyRef} className={styles.storySection}>
        <div className={styles.storySticky}>
          <div className={styles.storyVisual}>
            <motion.div className={styles.storyImageStack} style={reduceMotion ? undefined : { scale: storyImageScale }}>
              <motion.img src={storyMedia[0]} alt="Ruth Istanbul sembol hikâyesi" style={{ opacity: imageOneOpacity }} />
              <motion.img src={storyMedia[1]} alt="Ruth Istanbul malzeme detayı" style={{ opacity: imageTwoOpacity }} />
              <motion.img src={storyMedia[2]} alt="Ruth Istanbul atölye hikâyesi" style={{ opacity: imageThreeOpacity }} />
            </motion.div>
            <div className={styles.storyVisualLabel}>
              <span>Ruth Notes</span>
              <span>01 — 03</span>
            </div>
          </div>

          <div className={styles.storyCopy}>
            <p className={styles.storyEyebrow}>Bir sembolden fazlası</p>
            <div className={styles.storyCopyStage}>
              <motion.article style={{ opacity: copyOneOpacity, y: copyOneY }}>
                <span>01 · Sembol</span>
                <h2>Geçmişten kalan bir form, bugünde yeni bir anlam.</h2>
                <p>Antik motifleri birebir tekrar etmek yerine onları sadeleştiriyor, günlük stile taşıyoruz.</p>
              </motion.article>

              <motion.article style={{ opacity: copyTwoOpacity, y: copyTwoY }}>
                <span>02 · Malzeme</span>
                <h2>Dokunulduğunda yaşayan yüzeyler.</h2>
                <p>925 ayar gümüş ve pirinç; parlak, eskitilmiş ve sıcak bitişlerle her parçada farklı bir karakter kazanır.</p>
              </motion.article>

              <motion.article style={{ opacity: copyThreeOpacity, y: copyThreeY }}>
                <span>03 · İstanbul</span>
                <h2>Tasarımdan son dokunuşa kadar burada.</h2>
                <p>Ruth parçaları İstanbul&apos;da tasarlanır; küçük detaylar ve son kontroller elle tamamlanır.</p>
                <Link href="/pages/hakkimizda">Ruth&apos;un hikâyesi <b>→</b></Link>
              </motion.article>
            </div>
            <motion.div className={styles.storyProgress}>
              <motion.i style={{ scaleX: storyProgress }} />
            </motion.div>
          </div>
        </div>
      </section>

      <section ref={atelierRef} className={styles.atelierSection}>
        <motion.div className={styles.atelierMedia} style={reduceMotion ? undefined : { y: atelierImageY }}>
          <img src={atelierImage} alt="Ruth Atelier koleksiyonu" />
        </motion.div>
        <div className={styles.atelierShade} />
        <motion.div
          className={styles.atelierCopy}
          initial={reduceMotion ? false : { opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.9, ease: revealEase }}
        >
          <p>Ruth Atelier · Chapter I</p>
          <h2>Her parçanın izi elde tamamlanır.</h2>
          <Link href="/collections/ruthatelier">Atelier&apos;i keşfet <span>→</span></Link>
        </motion.div>
        <div className={styles.atelierCorner}>İstanbul · 2026</div>
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
