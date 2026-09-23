"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  exactItemIsActive,
  exactNavStructure,
  type ExactNavGroup,
  type ExactNavItem,
} from "@/components/base44-exact/nav-config";
import styles from "./AdminMudrenokQuarterMenu.module.css";

const VIEWBOX = 360;
const CENTER = 360;
const START_DEG = 182;
const END_DEG = 268;
const MAIN_INNER = 108;
const MAIN_OUTER = 234;
const SUB_INNER = 241;
const SUB_OUTER = 302;
const SEGMENT_GAP = 0.65;
const SUB_GAP = 0.78;
const MOBILE_VISIBLE_COUNT = 3;

const LABELS: Record<string, string> = {
  GENEL: "Genel",
  "SİPARİŞ VE OPERASYON": "Operasyon",
  "ÜRÜN VE STOK": "Ürün & Stok",
  MÜŞTERİ: "Müşteri",
  PAZARLAMA: "Pazarlama",
  "Meta Reklamları": "Meta",
  MAĞAZA: "Mağaza",
  RAPORLAMA: "Analitik",
  Ruthie: "Ruthie",
  SİSTEM: "Sistem",
};

type Point = { x: number; y: number };
type Segment = { start: number; end: number; mid: number; path: string; icon: Point };
type Viewport = { width: number; height: number };
type VisibleGroup = { group: ExactNavGroup; index: number };
type Bezier = [number, number, number, number];

function groupLabel(group: ExactNavGroup) {
  return LABELS[group.label] || group.label;
}

function polar(radius: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(rad) * radius,
    y: CENTER + Math.sin(rad) * radius,
  };
}

function annularSector(inner: number, outer: number, startDeg: number, endDeg: number) {
  const outerStart = polar(outer, startDeg);
  const outerEnd = polar(outer, endDeg);
  const innerEnd = polar(inner, endDeg);
  const innerStart = polar(inner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${outerStart.x.toFixed(3)} ${outerStart.y.toFixed(3)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x.toFixed(3)} ${outerEnd.y.toFixed(3)}`,
    `L ${innerEnd.x.toFixed(3)} ${innerEnd.y.toFixed(3)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${innerStart.x.toFixed(3)} ${innerStart.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function buildSegments(count: number, inner: number, outer: number, gap: number): Segment[] {
  if (!count) return [];
  const width = (END_DEG - START_DEG) / count;
  return Array.from({ length: count }, (_, index) => {
    const start = START_DEG + width * index + gap / 2;
    const end = START_DEG + width * (index + 1) - gap / 2;
    const mid = (start + end) / 2;
    const icon = polar((inner + outer) / 2, mid);
    return { start, end, mid, path: annularSector(inner, outer, start, end), icon };
  });
}

function activateWithKeyboard(event: ReactKeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

const ELASTIC_MAIN = [0.42, 1.12, 0.94, 1.04, 0.985, 1];
const ELASTIC_CORE = [1, 1.46, 1.23, 1.33, 1.28, 1.3];
const ELASTIC_SUB = [0.76, 1.08, 0.95, 1.025, 1];
const ELASTIC_TIMES = [0, 0.34, 0.52, 0.7, 0.86, 1];
const POWER1_OUT: Bezier = [0.25, 0.46, 0.45, 0.94];
const POWER2_IN: Bezier = [0.55, 0.085, 0.68, 0.53];
const POWER3_OUT: Bezier = [0.215, 0.61, 0.355, 1];
const POWER4_OUT: Bezier = [0.165, 0.84, 0.44, 1];
const BACK_IN: Bezier = [0.6, -0.28, 0.735, 0.045];

export function AdminMudrenokQuarterMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 390, height: 844 });
  const [mobileOffset, setMobileOffset] = useState(0);
  const [mobileDirection, setMobileDirection] = useState<1 | -1>(1);
  const swipeStartY = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const scrollLocked = useRef(false);

  const mobile = viewport.width < 768;
  const menuSize = mobile
    ? Math.min(338, Math.max(306, viewport.width * 0.865))
    : Math.min(444, Math.max(396, viewport.width * 0.29));

  const visibleGroups = useMemo<VisibleGroup[]>(() => {
    if (!mobile) return exactNavStructure.map((group, index) => ({ group, index }));
    return Array.from({ length: Math.min(MOBILE_VISIBLE_COUNT, exactNavStructure.length) }, (_, slot) => {
      const index = (mobileOffset + slot) % exactNavStructure.length;
      return { group: exactNavStructure[index], index };
    });
  }, [mobile, mobileOffset]);

  const mainSegments = useMemo(
    () => buildSegments(visibleGroups.length, MAIN_INNER, MAIN_OUTER, SEGMENT_GAP),
    [visibleGroups.length],
  );

  const featuredSlot = Math.floor(Math.max(0, visibleGroups.length - 1) / 2);
  const featuredSegment = mainSegments[featuredSlot] || null;
  const selected = selectedGroup === null ? null : exactNavStructure[selectedGroup];
  const subSegments = useMemo(
    () => buildSegments(selected?.items.length || 0, SUB_INNER, SUB_OUTER, SUB_GAP),
    [selected],
  );

  const close = useCallback(() => {
    setSelectedGroup(null);
    setOpen(false);
  }, []);

  const chooseGroup = useCallback((index: number) => {
    if (suppressClick.current) return;
    setSelectedGroup((current) => current === index ? null : index);
  }, []);

  const navigate = useCallback((item: ExactNavItem) => {
    if (suppressClick.current) return;
    close();
    router.push(item.path);
  }, [close, router]);

  const shiftMobile = useCallback((direction: 1 | -1) => {
    if (!mobile || !open || exactNavStructure.length <= MOBILE_VISIBLE_COUNT || scrollLocked.current) return;
    scrollLocked.current = true;
    suppressClick.current = true;
    setSelectedGroup(null);
    setMobileDirection(direction);
    setMobileOffset((current) => (current + direction + exactNavStructure.length) % exactNavStructure.length);
    window.setTimeout(() => {
      scrollLocked.current = false;
      suppressClick.current = false;
    }, reduceMotion ? 20 : 300);
  }, [mobile, open, reduceMotion]);

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
    const paths = new Set<string>();
    exactNavStructure.forEach((group) => group.items.forEach((item) => paths.add(item.path)));
    paths.forEach((path) => router.prefetch(path));
  }, [router]);

  useEffect(() => {
    const activeIndex = exactNavStructure.findIndex((group) => group.items.some((item) => exactItemIsActive(pathname, item)));
    if (activeIndex >= 0) setMobileOffset(activeIndex);
    setSelectedGroup(null);
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" && mobile) {
        event.preventDefault();
        shiftMobile(1);
        return;
      }
      if (event.key === "ArrowDown" && mobile) {
        event.preventDefault();
        shiftMobile(-1);
        return;
      }
      if (event.key !== "Escape") return;
      if (selectedGroup !== null) setSelectedGroup(null);
      else close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, mobile, open, selectedGroup, shiftMobile]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <>
      <AnimatePresence>
        {open ? (
          <motion.button
            type="button"
            className={styles.backdrop}
            aria-label="Menüyü kapat"
            onClick={close}
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(10px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
          />
        ) : null}
      </AnimatePresence>

      <div
        className={styles.root}
        style={{ width: menuSize, height: menuSize }}
        data-open={open ? "true" : "false"}
        data-has-submenu={selected ? "true" : "false"}
        onTouchStart={(event) => {
          if (!mobile || !open) return;
          swipeStartY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(event) => {
          if (!mobile || !open || swipeStartY.current === null) return;
          const endY = event.changedTouches[0]?.clientY ?? swipeStartY.current;
          const delta = endY - swipeStartY.current;
          swipeStartY.current = null;
          if (Math.abs(delta) < 34) return;
          shiftMobile(delta < 0 ? 1 : -1);
        }}
        onWheel={(event) => {
          if (!mobile || !open || Math.abs(event.deltaY) < 16) return;
          event.preventDefault();
          shiftMobile(event.deltaY > 0 ? 1 : -1);
        }}
      >
        <svg className={styles.menuSvg} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} aria-label="ROSTA Coffee Co. menüsü">
          <defs>
            <radialGradient id="ruth-mudrenok-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(0,0,0,0)" />
              <stop offset="0.85" stopColor="rgba(0,0,0,0.72)" />
              <stop offset="1" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>

          <AnimatePresence>
            {open ? (
              <motion.path
                key="main-ring-base"
                d={annularSector(MAIN_INNER - 2, MAIN_OUTER + 2, START_DEG, END_DEG)}
                className={styles.mainRingBase}
                initial={{ opacity: 0.96, scale: reduceMotion ? 1 : ELASTIC_MAIN[0] }}
                animate={{ opacity: 1, scale: reduceMotion ? 1 : ELASTIC_MAIN }}
                exit={{ opacity: 0, scale: 0.42, transition: { duration: reduceMotion ? 0.01 : 0.55, ease: BACK_IN } }}
                transition={reduceMotion ? { duration: 0.01 } : { duration: 1.2, times: ELASTIC_TIMES }}
                style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {open && featuredSegment ? (
              <motion.path
                key={`accent-${mobile ? mobileOffset : "desktop"}`}
                d={featuredSegment.path}
                className={styles.accentWedge}
                initial={{ x: 72, y: 72, opacity: 0, scale: 0.86 }}
                animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                exit={{ x: 72, y: 72, opacity: 0, scale: 0.86, transition: { duration: reduceMotion ? 0.01 : 0.4, ease: POWER2_IN } }}
                transition={reduceMotion ? { duration: 0.01 } : { duration: 0.4, delay: 0.2, ease: POWER3_OUT }}
                style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence mode="popLayout" initial={false}>
            {open ? (
              <motion.g
                key={mobile ? `main-mobile-${mobileOffset}` : "main-desktop"}
                initial={mobile
                  ? { opacity: 0, y: mobileDirection > 0 ? 18 : -18 }
                  : { opacity: 1 }}
                animate={{ opacity: 1, y: 0 }}
                exit={mobile
                  ? { opacity: 0, y: mobileDirection > 0 ? -18 : 18 }
                  : { opacity: 0 }}
                transition={reduceMotion ? { duration: 0.01 } : { duration: 0.25, ease: POWER1_OUT }}
              >
                {visibleGroups.map(({ group, index: groupIndex }, slotIndex) => {
                  const segment = mainSegments[slotIndex];
                  const Icon = group.items[0]?.icon;
                  if (!segment || !Icon) return null;
                  const routeActive = group.items.some((item) => exactItemIsActive(pathname, item));
                  const selectedNow = selectedGroup === groupIndex;
                  const featured = slotIndex === featuredSlot;
                  const iconSize = mobile ? 22 : 18;
                  const iconY = mobile ? segment.icon.y - 8 : segment.icon.y;
                  const action = () => chooseGroup(groupIndex);
                  return (
                    <motion.g
                      key={`${group.label}:${groupIndex}`}
                      className={styles.segmentButton}
                      role="button"
                      tabIndex={0}
                      aria-label={`${groupLabel(group)} alt menüsünü aç`}
                      aria-expanded={selectedNow}
                      onClick={action}
                      onKeyDown={(event) => activateWithKeyboard(event, action)}
                      initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.18 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.18 }}
                      transition={reduceMotion ? { duration: 0.01 } : {
                        duration: 0.25,
                        delay: 0.34 + slotIndex * 0.1,
                        ease: POWER1_OUT,
                      }}
                      style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
                    >
                      <path
                        d={segment.path}
                        className={`${styles.mainSegment} ${routeActive ? styles.activeSegment : ""} ${selectedNow ? styles.selectedSegment : ""}`}
                      />
                      <Icon
                        x={segment.icon.x - iconSize / 2}
                        y={iconY - iconSize / 2}
                        width={iconSize}
                        height={iconSize}
                        className={`${styles.segmentIcon} ${featured ? styles.featuredIcon : ""} ${selectedNow ? styles.selectedIcon : ""}`}
                        aria-hidden="true"
                      />
                      {mobile ? (
                        <text
                          x={segment.icon.x}
                          y={segment.icon.y + 14}
                          className={`${styles.segmentLabel} ${featured ? styles.featuredLabel : ""} ${selectedNow ? styles.selectedLabel : ""}`}
                        >
                          {groupLabel(group)}
                        </text>
                      ) : null}
                      <title>{groupLabel(group)}</title>
                    </motion.g>
                  );
                })}
              </motion.g>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {open && selected ? (
              <motion.g
                key={`submenu-${selected.label}`}
                initial={{ opacity: 0, scale: reduceMotion ? 1 : ELASTIC_SUB[0] }}
                animate={{ opacity: 1, scale: reduceMotion ? 1 : ELASTIC_SUB }}
                exit={{ opacity: 0, scale: 0.76, transition: { duration: reduceMotion ? 0.01 : 0.36, ease: BACK_IN } }}
                transition={reduceMotion ? { duration: 0.01 } : { duration: 0.72, times: [0, 0.34, 0.58, 0.78, 1] }}
                style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
              >
                <path
                  d={annularSector(SUB_INNER - 2, SUB_OUTER + 2, START_DEG, END_DEG)}
                  className={styles.subRingBase}
                />

                {selected.items.map((item, index) => {
                  const segment = subSegments[index];
                  if (!segment) return null;
                  const Icon = item.icon;
                  const routeActive = exactItemIsActive(pathname, item);
                  const iconSize = mobile ? 14 : 16;
                  const action = () => navigate(item);
                  return (
                    <motion.g
                      key={`${item.path}:${item.label}`}
                      className={styles.segmentButton}
                      role="button"
                      tabIndex={0}
                      aria-label={item.label}
                      onClick={action}
                      onKeyDown={(event) => activateWithKeyboard(event, action)}
                      initial={{ opacity: 0, scale: 0.28 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.28 }}
                      transition={reduceMotion ? { duration: 0.01 } : {
                        duration: 0.25,
                        delay: 0.08 + index * 0.055,
                        ease: POWER1_OUT,
                      }}
                      style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
                    >
                      <path d={segment.path} className={`${styles.subSegment} ${routeActive ? styles.activeSubSegment : ""}`} />
                      <Icon
                        x={segment.icon.x - iconSize / 2}
                        y={segment.icon.y - iconSize / 2}
                        width={iconSize}
                        height={iconSize}
                        className={styles.subIcon}
                        aria-hidden="true"
                      />
                      <title>{item.label}</title>
                    </motion.g>
                  );
                })}
              </motion.g>
            ) : null}
          </AnimatePresence>

          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r="101"
            fill="url(#ruth-mudrenok-shadow)"
            className={styles.coreShadow}
            animate={{ scale: open ? (reduceMotion ? 1.3 : ELASTIC_CORE) : 1 }}
            transition={open
              ? { duration: reduceMotion ? 0.01 : 0.8, delay: reduceMotion ? 0 : 0.1, times: ELASTIC_TIMES }
              : { duration: reduceMotion ? 0.01 : 0.45, delay: reduceMotion ? 0 : 0.15, ease: BACK_IN }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />
          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r="96"
            className={styles.core}
            animate={{
              scale: open ? (reduceMotion ? 1.3 : ELASTIC_CORE) : 1,
              fill: open ? "hsl(var(--text-main))" : "hsl(var(--surface-primary))",
            }}
            transition={open
              ? {
                  scale: { duration: reduceMotion ? 0.01 : 0.8, delay: reduceMotion ? 0 : 0.1, times: ELASTIC_TIMES },
                  fill: { duration: reduceMotion ? 0.01 : 0.6, delay: reduceMotion ? 0 : 0.1, ease: POWER4_OUT },
                }
              : {
                  scale: { duration: reduceMotion ? 0.01 : 0.45, delay: reduceMotion ? 0 : 0.15, ease: BACK_IN },
                  fill: { duration: reduceMotion ? 0.01 : 0.45, delay: reduceMotion ? 0 : 0.15, ease: POWER2_IN },
                }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />

          <motion.g
            className={styles.burger}
            animate={{ x: open ? -10 : 0, y: open ? -10 : 0 }}
            transition={{ duration: reduceMotion ? 0.01 : open ? 0.3 : 0.4, delay: open && !reduceMotion ? 0.2 : 0, ease: open ? POWER1_OUT : POWER2_IN }}
          >
            <motion.line
              x1="306" y1="306" x2="334" y2="306"
              className={styles.burgerLine}
              animate={{ y: open ? 12 : 0, rotate: open ? 45 : 0, stroke: open ? "#fff" : "hsl(var(--text-main))" }}
              transition={{ duration: reduceMotion ? 0.01 : open ? 0.4 : 0.3, delay: open && !reduceMotion ? 0.1 : 0.2, ease: open ? POWER1_OUT : POWER2_IN }}
              style={{ transformOrigin: "320px 306px" }}
            />
            <motion.line
              x1="306" y1="318" x2="334" y2="318"
              className={styles.burgerLine}
              animate={{ rotate: open ? 45 : 0, opacity: open ? 0 : 1, stroke: open ? "rgba(255,255,255,0)" : "hsl(var(--text-main))" }}
              transition={{ duration: reduceMotion ? 0.01 : open ? 0.4 : 0.3, delay: open && !reduceMotion ? 0.1 : 0.2, ease: open ? POWER1_OUT : POWER2_IN }}
              style={{ transformOrigin: "320px 318px" }}
            />
            <motion.line
              x1="306" y1="330" x2="334" y2="330"
              className={styles.burgerLine}
              animate={{ y: open ? -12 : 0, rotate: open ? -45 : 0, stroke: open ? "#fff" : "hsl(var(--text-main))" }}
              transition={{ duration: reduceMotion ? 0.01 : open ? 0.4 : 0.3, delay: open && !reduceMotion ? 0.1 : 0.2, ease: open ? POWER1_OUT : POWER2_IN }}
              style={{ transformOrigin: "320px 330px" }}
            />
          </motion.g>
        </svg>

        <button
          type="button"
          className={styles.coreHit}
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
          onClick={() => {
            if (open) setSelectedGroup(null);
            setOpen((value) => !value);
          }}
        />
      </div>
    </>,
    document.body,
  );
}
