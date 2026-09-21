"use client";

import Link from "next/link";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import type { Collection, Product } from "@/types/site";
import { RING_RENDER_IMAGE } from "./ring-render-image";
import styles from "./scroll-jewelry-experience.module.css";

export default function ScrollJewelryExperience({
  products,
  collections,
}: {
  products: Product[];
  collections: Collection[];
  heroImage?: string | null;
  storyImages?: string[] | null;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const leadProduct = products[0];
  const productHref = leadProduct
    ? `/products/${leadProduct.slug}`
    : collections[0]
      ? `/collections/${collections[0].slug}`
      : "/collections";
  const collectionHref = collections[0] ? `/collections/${collections[0].slug}` : "/collections";

  // One render, five camera positions: hero, front, side, back and final three-quarter view.
  const renderScale = useTransform(
    scrollYProgress,
    [0, 0.14, 0.29, 0.46, 0.63, 0.8, 1],
    [0.95, 1.08, 1.55, 1.55, 1.52, 1.52, 1.42],
  );
  const renderX = useTransform(
    scrollYProgress,
    [0, 0.14, 0.29, 0.46, 0.63, 0.8, 1],
    ["6vw", "7vw", "19vw", "-13vw", "19vw", "-14vw", "-8vw"],
  );
  const renderY = useTransform(
    scrollYProgress,
    [0, 0.14, 0.29, 0.46, 0.63, 0.8, 1],
    ["27vh", "21vh", "-2vh", "-2vh", "-47vh", "-47vh", "-38vh"],
  );
  const renderRotate = useTransform(
    scrollYProgress,
    [0, 0.29, 0.46, 0.63, 0.8, 1],
    [-1.4, 0, 0.6, -0.5, 0.5, 0],
  );
  const renderBrightness = useTransform(
    scrollYProgress,
    [0, 0.23, 0.5, 0.76, 1],
    [0.9, 1.08, 0.94, 1.08, 1],
  );
  const renderFilter = useTransform(
    renderBrightness,
    (value) => `brightness(${value}) contrast(1.04) saturate(1.03)`,
  );

  const introOpacity = useTransform(scrollYProgress, [0, 0.09, 0.19], [1, 1, 0]);
  const introY = useTransform(scrollYProgress, [0, 0.19], [0, -30]);

  const frontOpacity = useTransform(scrollYProgress, [0.19, 0.27, 0.37, 0.44], [0, 1, 1, 0]);
  const frontY = useTransform(scrollYProgress, [0.19, 0.27, 0.44], [28, 0, -22]);

  const sideOpacity = useTransform(scrollYProgress, [0.38, 0.46, 0.55, 0.62], [0, 1, 1, 0]);
  const sideY = useTransform(scrollYProgress, [0.38, 0.46, 0.62], [28, 0, -22]);

  const backOpacity = useTransform(scrollYProgress, [0.57, 0.65, 0.74, 0.81], [0, 1, 1, 0]);
  const backY = useTransform(scrollYProgress, [0.57, 0.65, 0.81], [28, 0, -22]);

  const finalOpacity = useTransform(scrollYProgress, [0.79, 0.88, 1], [0, 1, 1]);
  const finalY = useTransform(scrollYProgress, [0.79, 0.9, 1], [26, 0, 0]);
  const progressScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section ref={sectionRef} className={styles.scrollSection}>
      <div className={styles.stickyStage}>
        <div className={styles.ambientGlow} />
        <div className={styles.leftShade} />
        <div className={styles.noise} />

        <motion.div
          className={styles.renderStage}
          style={
            reducedMotion
              ? { x: "6vw", y: "27vh", scale: 0.95, rotate: -1.4 }
              : { x: renderX, y: renderY, scale: renderScale, rotate: renderRotate, filter: renderFilter }
          }
        >
          <img
            src={RING_RENDER_IMAGE}
            alt="Lotus motifli Ruth Istanbul yüzüğünün ön, yan, arka ve çapraz görünümleri"
            draggable={false}
          />
        </motion.div>

        <motion.header
          className={styles.introCopy}
          style={reducedMotion ? undefined : { opacity: introOpacity, y: introY }}
        >
          <p>Ruth Istanbul · Signature Piece</p>
          <h1>Her açıdan<br />bir sembol.</h1>
          <span>Kaydırarak yaklaş</span>
        </motion.header>

        <motion.article
          className={styles.featureCopy}
          style={reducedMotion ? { display: "none" } : { opacity: frontOpacity, y: frontY }}
        >
          <span>01 · Ön görünüm</span>
          <h2>Yeniden<br />doğuş.</h2>
          <p>Lotus motifi, karanlığın içinden yükselen dönüşümü ve yeni başlangıçları taşır.</p>
        </motion.article>

        <motion.article
          className={styles.featureCopy}
          style={reducedMotion ? { display: "none" } : { opacity: sideOpacity, y: sideY }}
        >
          <span>02 · Yan profil</span>
          <h2>Heykelsi<br />bir form.</h2>
          <p>Yumuşatılmış köşeler, katmanlı çerçeve ve güçlü profil; ışık değiştikçe yeni bir yüz gösterir.</p>
        </motion.article>

        <motion.article
          className={styles.featureCopy}
          style={reducedMotion ? { display: "none" } : { opacity: backOpacity, y: backY }}
        >
          <span>03 · Arka görünüm</span>
          <h2>Detay,<br />her yerde.</h2>
          <p>Ayarlanabilir açık form ve küre bitişler, parçanın karakterini arka görünümde de sürdürür.</p>
        </motion.article>

        <motion.div
          className={styles.finalCopy}
          style={reducedMotion ? { display: "none" } : { opacity: finalOpacity, y: finalY }}
        >
          <p>Ruth Signature</p>
          <h2>{leadProduct?.name || "The Lotus Ring"}</h2>
          <div className={styles.finalMeta}>
            <span>{leadProduct?.material || "Sembolik tasarım"}</span>
            <Link href={productHref}>Ürünü incele <b>↗</b></Link>
          </div>
        </motion.div>

        <div className={styles.sceneIndex} aria-hidden="true">
          <span>01</span>
          <i><motion.b style={{ scaleY: progressScale }} /></i>
          <span>05</span>
        </div>

        <div className={styles.bottomMeta}>
          <span>Ruth Istanbul</span>
          <Link href={collectionHref}>Koleksiyona git ↗</Link>
        </div>
      </div>
    </section>
  );
}
