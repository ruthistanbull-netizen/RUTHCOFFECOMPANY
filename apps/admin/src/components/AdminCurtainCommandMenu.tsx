"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  exactItemIsActive,
  exactNavStructure,
  type ExactNavGroup,
} from "@/components/base44-exact/nav-config";
import styles from "./AdminCurtainCommandMenu.module.css";

const COMMAND_MENU_EVENT = "ruth:command-menu-toggle";
const COMMAND_MENU_CLASS = "ruth-command-menu-open";
const NAVY = "#111111";
const PINK = "#C94A40";

const GROUP_LABELS: Record<string, string> = {
  GENEL: "Genel",
  "SİPARİŞ VE OPERASYON": "Operasyon",
  "ÜRÜN VE STOK": "Ürün & Stok",
  MÜŞTERİ: "Müşteri",
  PAZARLAMA: "Pazarlama",
  "Meta Reklamları": "Meta Reklamları",
  MAĞAZA: "Mağaza",
  RAPORLAMA: "Analitik",
  Ruthie: "ROSTA Insight",
  "YAPAY ZEKA": "Yapay Zeka",
  SİSTEM: "Sistem",
};

type Viewport = { width: number; height: number };
type Point = { x: number; y: number };

type PositionedStyle = CSSProperties & {
  "--item-index"?: number;
};

function groupTitle(group: ExactNavGroup) {
  return GROUP_LABELS[group.label] || group.label;
}

function arcPoint(index: number, total: number, radius: number, startDeg: number, endDeg: number): Point {
  const progress = total <= 1 ? 0.5 : index / (total - 1);
  const deg = startDeg + (endDeg - startDeg) * progress;
  const rad = (deg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function childPoint(index: number, total: number, mobile: boolean): Point {
  const perArc = mobile ? 6 : 7;
  const ring = Math.floor(index / perArc);
  const ringStart = ring * perArc;
  const ringCount = Math.min(perArc, total - ringStart);
  const localIndex = index - ringStart;
  const radius = (mobile ? 104 : 122) + ring * (mobile ? 54 : 64);
  return arcPoint(localIndex, ringCount, radius, 205, 335);
}

const itemOpenEase = [0.22, 1, 0.36, 1] as const;

export function AdminCurtainCommandMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 390, height: 844 });

  const mobile = viewport.width < 768;
  const count = exactNavStructure.length;
  const coreX = viewport.width - (mobile ? 72 : 104);
  const coreY = viewport.height - (mobile ? 96 : 104);
  const mainRadius = mobile
    ? Math.min(248, Math.max(218, 176 + count * 6))
    : Math.min(318, Math.max(262, 220 + count * 7));

  const mainPoints = useMemo(
    () => exactNavStructure.map((_, index) => arcPoint(index, count, mainRadius, 165, 270)),
    [count, mainRadius],
  );

  const selected = selectedGroup === null ? null : exactNavStructure[selectedGroup];
  const selectedPoint = selectedGroup === null ? null : mainPoints[selectedGroup];
  const selectedX = selectedPoint ? coreX + selectedPoint.x : coreX;
  const selectedY = selectedPoint ? coreY + selectedPoint.y : coreY;
  const subBgScale = selected && selected.items.length > (mobile ? 6 : 7) ? 3.65 : 2.5;

  const closeMenu = useCallback(() => {
    setSelectedGroup(null);
    setOpen(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    let frame = 0;
    const sync = () => {
      frame = 0;
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const onResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setSelectedGroup(null);
      setOpen((value) => !value);
    };
    window.addEventListener(COMMAND_MENU_EVENT, onToggle);
    return () => window.removeEventListener(COMMAND_MENU_EVENT, onToggle);
  }, []);

  useEffect(() => {
    const paths = new Set<string>();
    for (const group of exactNavStructure) {
      for (const item of group.items) paths.add(item.path);
    }
    for (const path of paths) router.prefetch(path);
  }, [router]);

  useEffect(() => {
    document.documentElement.classList.toggle(COMMAND_MENU_CLASS, open);
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove(COMMAND_MENU_CLASS);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedGroup !== null) setSelectedGroup(null);
      else closeMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMenu, open, selectedGroup]);

  useEffect(() => closeMenu(), [pathname, closeMenu]);

  const navigate = useCallback((href: string) => {
    closeMenu();
    router.push(href);
  }, [closeMenu, router]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          id="ruth-command-orbit-menu"
          className={styles.layer}
          role="dialog"
          aria-modal="true"
          aria-label="ROSTA Coffee Co. radial menüsü"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.18 }}
        >
          <button type="button" className={styles.backdrop} onClick={closeMenu} aria-label="Menüyü kapat" />

          <svg
            className={styles.coreSvg}
            viewBox="-320 -320 640 640"
            style={{ left: coreX, top: coreY }}
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="ruth-mudrenok-shadow">
                <stop offset="0" stopColor="rgba(17,17,17,0)" />
                <stop offset="0.85" stopColor="rgba(17,17,17,0.82)" />
                <stop offset="1" stopColor="rgba(17,17,17,0)" />
              </radialGradient>
            </defs>

            <motion.circle
              className={styles.coreBg}
              cx="0"
              cy="0"
              r="100"
              fill="#FBF3E6"
              initial={{ scale: 1 }}
              animate={reduceMotion ? { scale: 2.5 } : { scale: [1, 2.76, 2.36, 2.58, 2.47, 2.5] }}
              exit={reduceMotion ? { scale: 1 } : { scale: [2.5, 2.64, 1] }}
              transition={reduceMotion ? { duration: 0.01 } : { duration: 1.2, times: [0, 0.34, 0.52, 0.7, 0.86, 1] }}
            />

            <motion.circle
              className={styles.coreArc}
              cx="0"
              cy="0"
              r="150"
              fill="none"
              stroke={PINK}
              strokeWidth="54"
              strokeLinecap="round"
              initial={{ x: 120, y: 120, strokeDasharray: "10 350", strokeDashoffset: -230, opacity: 0.01 }}
              animate={{ x: 0, y: 0, strokeDasharray: "118 242", strokeDashoffset: -176, opacity: 1 }}
              exit={{ x: 120, y: 120, strokeDasharray: "0 359", strokeDashoffset: -240, opacity: 0 }}
              transition={reduceMotion ? { duration: 0.01 } : { duration: 0.62, delay: 0.18, ease: itemOpenEase }}
            />

            <motion.circle
              className={styles.coreShadow}
              cx="0"
              cy="0"
              r="105"
              fill="url(#ruth-mudrenok-shadow)"
              initial={{ scale: 1 }}
              animate={reduceMotion ? { scale: 1.3 } : { scale: [1, 1.44, 1.24, 1.32, 1.29, 1.3] }}
              exit={{ scale: 1 }}
              transition={reduceMotion ? { duration: 0.01 } : { duration: 0.8, delay: 0.1 }}
            />

            <motion.circle
              className={styles.coreSmall}
              cx="0"
              cy="0"
              r="100"
              initial={{ scale: 1, fill: "#FBF3E6" }}
              animate={reduceMotion ? { scale: 1.3, fill: NAVY } : { scale: [1, 1.44, 1.23, 1.32, 1.28, 1.3], fill: NAVY }}
              exit={{ scale: 1, fill: "#FBF3E6" }}
              transition={reduceMotion ? { duration: 0.01 } : { duration: 0.8, delay: 0.1 }}
            />

            <motion.g
              className={styles.burger}
              initial={{ x: 0, y: 0 }}
              animate={{ x: -10, y: -10 }}
              exit={{ x: 0, y: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.3, delay: reduceMotion ? 0 : 0.18 }}
            >
              <motion.line
                className={styles.burgerLine}
                x1="-26" y1="-12" x2="0" y2="-12"
                strokeWidth="5.5" strokeLinecap="round"
                initial={{ y: 0, rotate: 0, stroke: NAVY }}
                animate={{ y: 12, rotate: 45, stroke: "#FBF3E6" }}
                exit={{ y: 0, rotate: 0, stroke: NAVY }}
                transition={{ duration: reduceMotion ? 0.01 : 0.4, delay: reduceMotion ? 0 : 0.1 }}
              />
              <motion.line
                className={styles.burgerLine}
                x1="-26" y1="0" x2="0" y2="0"
                strokeWidth="5.5" strokeLinecap="round"
                initial={{ rotate: 0, stroke: NAVY, opacity: 1 }}
                animate={{ rotate: 45, stroke: "#FBF3E6", opacity: 0 }}
                exit={{ rotate: 0, stroke: NAVY, opacity: 1 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.35, delay: reduceMotion ? 0 : 0.1 }}
              />
              <motion.line
                className={styles.burgerLine}
                x1="-26" y1="12" x2="0" y2="12"
                strokeWidth="5.5" strokeLinecap="round"
                initial={{ y: 0, rotate: 0, stroke: NAVY }}
                animate={{ y: -12, rotate: -45, stroke: "#FBF3E6" }}
                exit={{ y: 0, rotate: 0, stroke: NAVY }}
                transition={{ duration: reduceMotion ? 0.01 : 0.4, delay: reduceMotion ? 0 : 0.1 }}
              />
            </motion.g>
          </svg>

          <motion.button
            type="button"
            className={styles.coreHit}
            style={{ left: coreX, top: coreY }}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.88, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.2, delay: reduceMotion ? 0 : 0.18 }}
            onClick={closeMenu}
            aria-label="Menüyü kapat"
          />

          {exactNavStructure.map((group, index) => {
            const Icon = group.items[0]?.icon;
            if (!Icon) return null;
            const point = mainPoints[index];
            const routeActive = group.items.some((item) => exactItemIsActive(pathname, item));
            const selectedNow = selectedGroup === index;
            const style: PositionedStyle = { left: coreX, top: coreY, "--item-index": index };
            return (
              <motion.button
                key={group.label}
                type="button"
                className={`${styles.mainItem} ${routeActive ? styles.mainItemActive : ""} ${selectedNow ? styles.mainItemSelected : ""}`}
                style={style}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
                animate={{ x: point.x, y: point.y, opacity: 1, scale: 1 }}
                exit={{ x: 0, y: 0, opacity: 0, scale: 0.58 }}
                transition={reduceMotion ? { duration: 0.01 } : {
                  duration: 0.25,
                  delay: 0.38 + index * Math.min(0.048, 0.34 / Math.max(1, count - 1)),
                  ease: itemOpenEase,
                }}
                whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                onClick={() => setSelectedGroup((value) => value === index ? null : index)}
                aria-label={`${groupTitle(group)} alt menüsünü aç`}
                aria-expanded={selectedNow}
              >
                <Icon aria-hidden="true" />
                <span>{groupTitle(group)}</span>
              </motion.button>
            );
          })}

          <AnimatePresence mode="wait">
            {selected && selectedPoint ? (
              <motion.div
                key={selected.label}
                className={styles.subLayer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.14 }}
              >
                <svg
                  className={styles.subSvg}
                  viewBox="-150 -150 300 300"
                  style={{ left: selectedX, top: selectedY }}
                  aria-hidden="true"
                >
                  <motion.circle
                    cx="0" cy="0" r="42" fill="#FBF3E6"
                    initial={{ scale: 0.75 }}
                    animate={reduceMotion ? { scale: subBgScale } : { scale: [0.75, subBgScale * 1.12, subBgScale * 0.94, subBgScale * 1.025, subBgScale] }}
                    exit={{ scale: 0.75 }}
                    transition={reduceMotion ? { duration: 0.01 } : { duration: 0.72 }}
                  />
                  <motion.circle
                    cx="0" cy="0" r="61" fill="none" stroke={PINK} strokeWidth="18" strokeLinecap="round"
                    initial={{ strokeDasharray: "2 160", strokeDashoffset: -88, opacity: 0 }}
                    animate={{ strokeDasharray: "48 112", strokeDashoffset: -58, opacity: 1 }}
                    exit={{ strokeDasharray: "0 160", opacity: 0 }}
                    transition={reduceMotion ? { duration: 0.01 } : { duration: 0.42, delay: 0.12, ease: itemOpenEase }}
                  />
                  <motion.circle
                    cx="0" cy="0" r="42" fill={NAVY}
                    initial={{ scale: 0.72 }}
                    animate={reduceMotion ? { scale: 1 } : { scale: [0.72, 1.12, 0.96, 1.03, 1] }}
                    exit={{ scale: 0.72 }}
                    transition={reduceMotion ? { duration: 0.01 } : { duration: 0.56, delay: 0.05 }}
                  />
                </svg>

                {selected.items.map((item, index) => {
                  const Icon = item.icon;
                  const point = childPoint(index, selected.items.length, mobile);
                  const active = exactItemIsActive(pathname, item);
                  return (
                    <motion.button
                      key={`${selected.label}:${item.path}`}
                      type="button"
                      className={`${styles.childItem} ${active ? styles.childItemActive : ""}`}
                      style={{ left: selectedX, top: selectedY }}
                      initial={{ x: 0, y: 0, opacity: 0, scale: 0.55 }}
                      animate={{ x: point.x, y: point.y, opacity: 1, scale: 1 }}
                      exit={{ x: 0, y: 0, opacity: 0, scale: 0.55 }}
                      transition={reduceMotion ? { duration: 0.01 } : {
                        duration: 0.25,
                        delay: 0.18 + index * 0.045,
                        ease: itemOpenEase,
                      }}
                      whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                      onClick={() => navigate(item.path)}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </motion.button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
