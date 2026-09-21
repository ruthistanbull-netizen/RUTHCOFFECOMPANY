"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import type { Collection, Product } from "@/types/site";
import { formatPrice } from "@/lib/formatPrice";
import styles from "./mythology-journey.module.css";

function productImage(product: Product) {
  return product.main_image_url || product.image_urls?.[0] || "/hero-ring.png";
}

export default function MythologyJourney({
  heroImage,
  collections,
  products,
}: {
  heroImage?: string | null;
  collections: Collection[];
  products: Product[];
}) {
  const journeyRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: journeyRef,
    offset: ["start start", "end end"],
  });

  const artifactScale = useTransform(scrollYProgress, [0, 0.18, 0.45, 0.7], [1, 1.08, 0.72, 0.4]);
  const artifactY = useTransform(scrollYProgress, [0, 0.4, 0.7], [0, -20, -160]);
  const artifactRotate = useTransform(scrollYProgress, [0, 0.45, 0.8], [0, -5, 8]);
  const artifactOpacity = useTransform(scrollYProgress, [0, 0.76, 0.88], [1, 1, 0]);
  const introOpacity = useTransform(scrollYProgress, [0, 0.12, 0.23], [1, 1, 0]);
  const statementOpacity = useTransform(scrollYProgress, [0.18, 0.32, 0.52], [0, 1, 0]);
  const statementY = useTransform(scrollYProgress, [0.18, 0.34, 0.52], [70, 0, -70]);
  const image = heroImage || products[0]?.main_image_url || "/hero-ring.png";

  return (
    <main className={styles.page}>
      <div ref={journeyRef} className={styles.journey}>
        <section className={styles.stage}>
          <div className={styles.noise} />
          <div className={styles.light} />

          <motion.div className={styles.intro} style={{ opacity: introOpacity }}>
            <p className={styles.kicker}>Ruth Istanbul · Digital Exhibition 01</p>
            <h1>Artifacts<br />come to life.</h1>
            <span className={styles.scrollCue}>Scroll to awaken</span>
          </motion.div>

          <motion.div
            className={styles.artifactWrap}
            style={{
              scale: artifactScale,
              y: artifactY,
              rotate: artifactRotate,
              opacity: artifactOpacity,
            }}
          >
            <div className={styles.orbit} />
            <div className={styles.artifactShadow} />
            <img src={image} alt="Ruth Istanbul artifact" className={styles.artifact} />
            <span className={styles.index}>01</span>
          </motion.div>

          <motion.div className={styles.statement} style={{ opacity: statementOpacity, y: statementY }}>
            <p>Some symbols are never lost.</p>
            <h2>They wait<br />to be worn again.</h2>
          </motion.div>

          <div className={styles.coordinates}>
            <span>41.0082° N</span>
            <span>28.9784° E</span>
          </div>
        </section>
      </div>

      <section className={styles.collectionsSection}>
        <div className={styles.sectionHeader}>
          <p>Chapter II</p>
          <h2>The archive opens.</h2>
          <span>Three rooms. Three stories. One living mythology.</span>
        </div>

        <div className={styles.collectionGrid}>
          {collections.map((collection, index) => (
            <motion.article
              key={collection.id}
              className={`${styles.collectionCard} ${styles[`card${index + 1}`] || ""}`}
              initial={{ opacity: 0, y: 80 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 0.9, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link href={`/collections/${collection.slug}`}>
                <div className={styles.collectionImage}>
                  {collection.cover_image_url ? (
                    <img src={collection.cover_image_url} alt={collection.name} />
                  ) : (
                    <div className={styles.fallback} />
                  )}
                </div>
                <div className={styles.collectionMeta}>
                  <span>Room 0{index + 1}</span>
                  <h3>{collection.name}</h3>
                  <b>Enter room ↗</b>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>
      </section>

      <section className={styles.objectsSection}>
        <div className={styles.objectsLead}>
          <p>Chapter III</p>
          <h2>Objects for the present.</h2>
        </div>

        <div className={styles.objectRail}>
          {products.map((product, index) => (
            <motion.article
              key={product.id}
              className={styles.objectCard}
              initial={{ opacity: 0, x: 45 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: index * 0.08 }}
            >
              <Link href={`/products/${product.slug}`}>
                <span className={styles.objectNumber}>0{index + 1}</span>
                <div className={styles.objectImage}>
                  <img src={productImage(product)} alt={product.name} />
                </div>
                <div className={styles.objectInfo}>
                  <h3>{product.name}</h3>
                  <span>{formatPrice(Number(product.price || 0))}</span>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>
      </section>

      <section className={styles.finalSection}>
        <p>The exhibition continues in motion.</p>
        <h2>Wear the symbol.<br />Continue the story.</h2>
        <Link href="/collections/ruthatelier">Enter Ruth Atelier <span>→</span></Link>
      </section>
    </main>
  );
}
