"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import type { Collection, Product } from "@/types/site";
import { formatPrice } from "@/lib/formatPrice";
import styles from "./immersive-editorial.module.css";

function productImage(product?: Product) {
  return product?.main_image_url || product?.image_urls?.[0] || "/hero-ring.png";
}

export default function ImmersiveEditorial({
  heroImage,
  collections,
  products,
}: {
  heroImage?: string | null;
  collections: Collection[];
  products: Product[];
}) {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroScale = useTransform(scrollYProgress, [0, 1], [1.12, 1]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.82, 1], [1, 1, 0.35]);
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  const mainHero = heroImage || products[0]?.main_image_url || collections[0]?.cover_image_url || "/hero-ring.png";
  const editorialImages = [
    collections[0]?.cover_image_url,
    productImage(products[1] || products[0]),
    collections[1]?.cover_image_url,
    productImage(products[2] || products[0]),
    collections[2]?.cover_image_url,
  ].filter(Boolean) as string[];

  return (
    <main className={styles.page}>
      <section ref={heroRef} className={styles.hero}>
        <motion.div className={styles.heroMedia} style={{ scale: heroScale, y: heroY, opacity: heroOpacity }}>
          <img src={mainHero} alt="Ruth Istanbul editorial campaign" />
          <div className={styles.heroVeil} />
        </motion.div>

        <div className={styles.topBar}>
          <span>Ruth Istanbul</span>
          <span>Editorial Study 02</span>
        </div>

        <motion.div className={styles.heroCopy} style={{ y: titleY, opacity: titleOpacity }}>
          <motion.span
            className={styles.monogram}
            initial={{ opacity: 0, scale: 0.82 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            R
          </motion.span>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.8 }}
          >
            Jewelry shaped by symbols,
            <br />made for the present.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.8 }}
          >
            <Link href="#story">Discover the campaign <span>↘</span></Link>
          </motion.div>
        </motion.div>

        <div className={styles.heroIndex}>01 / 05</div>
      </section>

      <section id="story" className={styles.statementSection}>
        <p className={styles.eyebrow}>A living mythology</p>
        <h1>
          Not found in the past.
          <br />Carried into the future.
        </h1>
        <div className={styles.statementMeta}>
          <span>İstanbul · 2026</span>
          <p>Ancient forms, intimate details and objects that change meaning when they meet the body.</p>
        </div>
      </section>

      <section className={styles.editorialCanvas}>
        {editorialImages.map((image, index) => (
          <motion.figure
            key={`${image}-${index}`}
            className={`${styles.editorialFrame} ${styles[`frame${index + 1}`] || ""}`}
            initial={{ opacity: 0, y: 70 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.95, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            <img src={image} alt={`Ruth Istanbul editorial image ${index + 1}`} />
            <figcaption>
              <span>0{index + 1}</span>
              <span>{index % 2 === 0 ? "Form / Shadow" : "Object / Body"}</span>
            </figcaption>
          </motion.figure>
        ))}

        <div className={styles.floatingWords} aria-hidden="true">
          <span>RINGS</span>
          <span>NECKLACES</span>
          <span>OBJECTS</span>
        </div>
      </section>

      <section className={styles.collectionChapter}>
        <header>
          <p>Chapter II</p>
          <h2>Collections, framed as stories.</h2>
        </header>

        <div className={styles.collectionList}>
          {collections.map((collection, index) => (
            <motion.article
              key={collection.id}
              initial={{ opacity: 0, y: 45 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.75, delay: index * 0.08 }}
            >
              <Link href={`/collections/${collection.slug}`}>
                <div className={styles.collectionNumber}>0{index + 1}</div>
                <div className={styles.collectionImage}>
                  {collection.cover_image_url ? <img src={collection.cover_image_url} alt={collection.name} /> : <div />}
                </div>
                <div className={styles.collectionName}>
                  <span>Collection</span>
                  <h3>{collection.name}</h3>
                </div>
                <span className={styles.collectionArrow}>↗</span>
              </Link>
            </motion.article>
          ))}
        </div>
      </section>

      <section className={styles.productsSection}>
        <div className={styles.productsHeading}>
          <p>Selected objects</p>
          <h2>Designed to be lived with.</h2>
        </div>

        <div className={styles.productGrid}>
          {products.map((product, index) => (
            <motion.article
              key={product.id}
              className={index === 0 || index === 4 ? styles.productLarge : ""}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8, delay: (index % 3) * 0.08 }}
            >
              <Link href={`/products/${product.slug}`}>
                <div className={styles.productImage}>
                  <img src={productImage(product)} alt={product.name} />
                </div>
                <div className={styles.productMeta}>
                  <h3>{product.name}</h3>
                  <span>{formatPrice(Number(product.price || 0))}</span>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>
      </section>

      <section className={styles.finalFrame}>
        <div>
          <p>Ruth Istanbul</p>
          <h2>Wear what remains.</h2>
          <Link href="/collections/ruthatelier">Explore Ruth Atelier <span>→</span></Link>
        </div>
      </section>
    </main>
  );
}
