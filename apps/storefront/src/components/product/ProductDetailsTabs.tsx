"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Drawer } from "@ruth-commerce/ui";
import { ruthMotion, ruthTransition } from "@ruth-commerce/ui/motion";
import { useId, useState } from "react";
import styles from "./product-details-tabs.module.css";

type DetailKey = "description" | "material" | "size";

type ProductDetailsTabsProps = {
  description: string;
  material: string;
  sizeUsage: string;
  care: string;
  showNecklaceGuide: boolean;
  freeShippingThreshold: number;
};

function Copy({ text }: { text: string }) {
  return (
    <div className={styles.copy}>
      {text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
    </div>
  );
}

export function ProductDetailsTabs({
  description,
  material,
  sizeUsage,
  care,
  showNecklaceGuide,
  freeShippingThreshold,
}: ProductDetailsTabsProps) {
  const prefersReducedMotion = useReducedMotion();
  const contentId = useId();
  const [active, setActive] = useState<DetailKey | null>(null);
  const [shippingOpen, setShippingOpen] = useState(false);

  const tabs: Array<{ key: DetailKey; label: string }> = [
    { key: "description", label: "Açıklama" },
    { key: "material", label: "Materyal" },
    { key: "size", label: "Ölçü ve Kullanım" },
  ];

  const renderContent = () => {
    if (active === "description") {
      return <Copy text={description || "Ruth Istanbul’un zamansız ve sembolik tasarım diliyle hazırlandı."} />;
    }

    if (active === "material") {
      return (
        <div className={styles.copy}>
          <Copy text={material || "Materyal bilgisi ürün bazında değişebilir."} />
          <div className={styles.subsection}>
            <span>Bakım</span>
            <Copy text={care || "Parfüm, su ve kimyasal temasından kaçının. Kullanmadığınızda kutusunda saklayın."} />
          </div>
        </div>
      );
    }

    if (active === "size") {
      return (
        <div className={styles.copy}>
          <Copy text={sizeUsage || "Günlük kullanıma uygun zarif form."} />
          {showNecklaceGuide ? (
            <img
              className={styles.sizeGuide}
              src="/necklace-size-guide.jpg"
              alt="Kolye ve zincir ölçü rehberi"
              loading="lazy"
            />
          ) : null}
        </div>
      );
    }

    return null;
  };

  return (
    <div className={styles.root} data-product-swipe-ignore>
      <div className={styles.tabRow} role="group" aria-label="Ürün bilgileri">
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={styles.tab}
              aria-expanded={isActive}
              aria-controls={contentId}
              onClick={() => setActive((current) => (current === tab.key ? null : tab.key))}
            >
              <span>{tab.label}</span>
              <ChevronDown aria-hidden="true" data-open={isActive} />
            </button>
          );
        })}

        <button
          type="button"
          className={styles.tab}
          aria-expanded={shippingOpen}
          onClick={() => setShippingOpen(true)}
        >
          <span>Kargo, Değişim, İade</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <div id={contentId} className={styles.content} aria-live="polite">
        <AnimatePresence initial={false} mode="wait">
          {active ? (
            <motion.div
              key={active}
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: ruthMotion.distance.subtle }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -ruthMotion.distance.subtle }
              }
              transition={ruthTransition("normal")}
            >
              {renderContent()}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <Drawer
        side="right"
        open={shippingOpen}
        title="Kargo, Değişim ve İade"
        description="Sipariş öncesi bilmeniz gereken teslimat ve satış sonrası koşulları."
        onClose={() => setShippingOpen(false)}
        footer={
          <Link className={styles.drawerLink} href="/shipping-returns">
            Tüm detayları görüntüle
            <ArrowRight aria-hidden="true" />
          </Link>
        }
      >
        <div className={styles.drawerContent}>
          <section>
            <span>Hazırlık ve Kargo</span>
            <p>Ürünler üretim süreci nedeniyle 3–5 iş günü içerisinde kargoya verilir.</p>
            <p>
              {freeShippingThreshold.toLocaleString("tr-TR")} TL ve üzeri siparişlerde kargo ücretsizdir.
            </p>
          </section>
          <section>
            <span>Değişim</span>
            <p>Uygun koşulları sağlayan ürünler için teslimattan sonra değişim desteği sunulur.</p>
          </section>
          <section>
            <span>İade</span>
            <p>İade talebinizi ürünün kullanılmamış ve yeniden satışa uygun durumda olması koşuluyla oluşturabilirsiniz.</p>
          </section>
          <section>
            <span>Destek</span>
            <p>Süreç boyunca sipariş numaranızla müşteri hizmetlerimize ulaşabilirsiniz.</p>
          </section>
        </div>
      </Drawer>
    </div>
  );
}
