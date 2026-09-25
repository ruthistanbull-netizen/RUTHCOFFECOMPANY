"use client";

import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exactAllNavItems,
  exactItemIsActive,
  exactNavStructure,
  type ExactNavItem,
} from "@/components/base44-exact/nav-config";
import styles from "./DesktopUnifiedNavigation.module.css";

type DesktopSection = {
  label: string;
  items: ExactNavItem[];
  icon: LucideIcon;
};

const SOURCE_SPRING = { mass: 0.1, stiffness: 150, damping: 12 };
const BUBBLE_SPRING = { type: "spring" as const, stiffness: 320, damping: 27, mass: 0.46 };
const BUBBLE_STAGGER = 0.035;

function itemsFor(...labels: string[]) {
  return exactNavStructure
    .filter((group) => labels.includes(group.label))
    .flatMap((group) => group.items);
}

function iconFor(path: string): LucideIcon | null {
  return exactAllNavItems.find((item) => item.path === path)?.icon ?? null;
}

function SectionButton({
  section,
  pointerY,
  pathname,
  active,
  open,
  onToggle,
  onNavigate,
}: {
  section: DesktopSection;
  pointerY: MotionValue<number>;
  pathname: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate: (path: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const distance = useTransform(pointerY, (value) => {
    const rect = ref.current?.getBoundingClientRect();
    return rect ? value - rect.top - rect.height / 2 : Number.POSITIVE_INFINITY;
  });
  const sizeTarget = useTransform(distance, [-115, 0, 115], [42, 56, 42]);
  const size = useSpring(sizeTarget, SOURCE_SPRING);
  const iconSize = useTransform(size, (value) => Math.max(20, value * 0.46));
  const Icon = section.icon;

  return (
    <div className={styles.sectionSlot}>
      <motion.button
        ref={ref}
        type="button"
        className={`${styles.sectionButton} ${active ? styles.sectionActive : ""} ${open ? styles.sectionOpen : ""}`}
        style={{ width: size, height: size }}
        animate={{ x: open ? 2 : 0, scale: open ? 1.03 : active ? 1.02 : 1 }}
        transition={BUBBLE_SPRING}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={onToggle}
        whileTap={{ scale: 0.94 }}
        aria-label={`${section.label} menüsünü ${open ? "kapat" : "aç"}`}
        aria-expanded={open}
      >
        <motion.span className={styles.sectionIcon} style={{ width: iconSize, height: iconSize }}>
          <Icon aria-hidden="true" />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {hovered && !open ? (
          <motion.span
            className={styles.tooltip}
            initial={{ opacity: 0, x: -8, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -5, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          >
            {section.label}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.div
            className={styles.bubblePanel}
            initial={{ opacity: 0, x: -12, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.98 }}
            transition={BUBBLE_SPRING}
            role="group"
            aria-label={`${section.label} alt menüsü`}
          >
            {section.items.map((item, index) => {
              const ChildIcon = item.icon;
              const itemActive = exactItemIsActive(pathname, item);

              return (
                <motion.button
                  key={`${section.label}:${item.path}`}
                  type="button"
                  className={`${styles.bubbleItem} ${itemActive ? styles.bubbleItemActive : ""}`}
                  initial={{ opacity: 0, x: -18, scale: 0.82, filter: "blur(4px)" }}
                  animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -12, scale: 0.86, filter: "blur(3px)" }}
                  transition={{ ...BUBBLE_SPRING, delay: index * BUBBLE_STAGGER }}
                  whileHover={{ x: 4, scale: 1.035 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onNavigate(item.path);
                  }}
                  aria-label={item.label}
                  aria-current={itemActive ? "page" : undefined}
                >
                  <span className={styles.bubbleCircle}>
                    <ChildIcon aria-hidden="true" />
                  </span>
                  <span className={styles.bubbleLabel}>{item.label}</span>
                </motion.button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function DesktopUnifiedNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLElement>(null);
  const pointerY = useMotionValue(Number.POSITIVE_INFINITY);
  const [openSection, setOpenSection] = useState<number | null>(null);

  const sections = useMemo<DesktopSection[]>(() => {
    const definitions = [
      { label: "Genel", groups: ["GENEL", "RAPORLAMA"], primaryPath: "/dashboard" },
      { label: "Siparişler", groups: ["SİPARİŞ VE OPERASYON"], primaryPath: "/orders" },
      { label: "Ürünler", groups: ["ÜRÜN VE STOK"], primaryPath: "/products" },
      { label: "Müşteriler", groups: ["MÜŞTERİ"], primaryPath: "/customers" },
      { label: "E-posta", groups: ["PAZARLAMA"], primaryPath: "/email" },
      { label: "ROSTA Insight", groups: ["ROSTA Insight"], primaryPath: "/rosta-insight/chat" },
      { label: "Meta Reklamları", groups: ["Meta Reklamları"], primaryPath: "/meta-ads" },
      { label: "Ayarlar", groups: ["MAĞAZA", "SİSTEM"], primaryPath: "/settings" },
    ];

    return definitions.flatMap((definition) => {
      const items = itemsFor(...definition.groups);
      const icon = iconFor(definition.primaryPath);
      if (!icon || !items.length) return [];
      return [{ label: definition.label, items, icon }];
    });
  }, []);

  useEffect(() => {
    setOpenSection(null);
    pointerY.set(Number.POSITIVE_INFINITY);
  }, [pathname, pointerY]);

  useEffect(() => {
    document.documentElement.classList.toggle("desktop-submenu-open", openSection !== null);
    return () => document.documentElement.classList.remove("desktop-submenu-open");
  }, [openSection]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenSection(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenSection(null);
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      document.documentElement.classList.remove("desktop-submenu-open");
    };
  }, []);

  const toggleSection = useCallback((index: number) => {
    setOpenSection((current) => current === index ? null : index);
  }, []);

  const navigate = useCallback((path: string) => {
    setOpenSection(null);
    router.push(path);
  }, [router]);

  return (
    <motion.nav
      ref={rootRef}
      className={styles.dock}
      data-desktop-unified-navigation="true"
      data-submenu-open={openSection !== null ? "true" : "false"}
      aria-label="ROSTA Coffee Co. birleşik masaüstü menüsü"
      initial={{ x: -24, opacity: 0, scale: 0.94 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 27 }}
      onMouseMove={(event) => pointerY.set(event.clientY)}
      onMouseLeave={() => pointerY.set(Number.POSITIVE_INFINITY)}
    >
      {sections.map((section, index) => {
        const active = section.items.some((item) => exactItemIsActive(pathname, item));
        return (
          <SectionButton
            key={section.label}
            section={section}
            pointerY={pointerY}
            pathname={pathname}
            active={active}
            open={openSection === index}
            onToggle={() => toggleSection(index)}
            onNavigate={navigate}
          />
        );
      })}
    </motion.nav>
  );
}
