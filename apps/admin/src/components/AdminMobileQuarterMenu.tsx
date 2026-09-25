"use client";

import {
  beginInteraction,
  endInteraction,
  moveInteraction,
  useBackgroundInteractionLock,
  type InteractionCandidate,
  type InteractionPointerType,
} from "@ruth-commerce/ui";
import {
  animate as animateValue,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  exactItemIsActive,
  exactNavStructure,
  type ExactNavGroup,
  type ExactNavItem,
} from "@/components/base44-exact/nav-config";
import styles from "./AdminMobileQuarterMenu.module.css";

const VIEWBOX = 360;
const CENTER = 360;
const START_DEG = 180;
const END_DEG = 270;
const MAIN_INNER = 110;
const MAIN_OUTER = 252;
const SUB_INNER = 259;
const SUB_OUTER = 328;
const MAIN_GAP = 0;
const SUB_GAP = 0;
const VISIBLE = 3;
const BREAKPOINT = 1024;
const CODEPEN_VIEWBOX = 320;
const CODEPEN_BASE_RADIUS = 150;
const CODEPEN_CENTER_DEG = 225;
const CODEPEN_SCALE = VIEWBOX / CODEPEN_VIEWBOX;
const CODEPEN_SHIFT = 120 * CODEPEN_SCALE;
const CODEPEN_LINK_ORIGIN = 300 * CODEPEN_SCALE;

type Point = { x: number; y: number };
type Segment = { start: number; end: number; mid: number; path: string; icon: Point };
type EaseFn = (value: number) => number;
type MenuGesture = {
  pointerId: number;
  interaction: InteractionCandidate | null;
  startPosition: number;
  lastY: number;
  lastAt: number;
  velocity: number;
  captured: boolean;
};

type ArcMotion = {
  shift: number;
  initialDash: string;
  initialOffset: number;
  finalDash: string;
  finalOffset: number;
  closeDash: string;
  closeOffset: number;
};

const LABELS: Record<string, string> = {
  GENEL: "Kontrol Merkezi",
  "SİPARİŞ VE OPERASYON": "Operasyon",
  "ÜRÜN VE STOK": "Ürün & Stok",
  MÜŞTERİ: "Müşteri",
  PAZARLAMA: "Pazarlama",
  "Meta Reklamları": "Meta",
  MAĞAZA: "Mağaza",
  RAPORLAMA: "Analitik",
  Ruthie: "ROSTA Insight",
  SİSTEM: "Sistem",
};

const power1Out: EaseFn = (t) => 1 - Math.pow(1 - t, 2);
const power1In: EaseFn = (t) => t * t;
const power3Out: EaseFn = (t) => 1 - Math.pow(1 - t, 4);
const power4Out: EaseFn = (t) => 1 - Math.pow(1 - t, 5);
const power4In: EaseFn = (t) => Math.pow(t, 5);
const backIn = (overshoot = 3): EaseFn => (t) => t * t * ((overshoot + 1) * t - overshoot);
const elasticOut = (amplitude: number, period: number): EaseFn => (t) => {
  if (t === 0 || t === 1) return t;
  const safeAmplitude = Math.max(1, amplitude);
  const s = (period / (2 * Math.PI)) * Math.asin(1 / safeAmplitude);
  return safeAmplitude * Math.pow(2, -10 * t) * Math.sin(((t - s) * 2 * Math.PI) / period) + 1;
};

const MAIN_ELASTIC = elasticOut(1.2, 0.5);
const CORE_ELASTIC = elasticOut(5, 1);
const BACK_IN_3 = backIn(3);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function interactionPointerType(value: string): InteractionPointerType {
  if (value === "touch" || value === "pen") return value;
  return "mouse";
}

function emptyGesture(): MenuGesture {
  return {
    pointerId: -1,
    interaction: null,
    startPosition: 0,
    lastY: 0,
    lastAt: 0,
    velocity: 0,
    captured: false,
  };
}

function groupLabel(group: ExactNavGroup) {
  return LABELS[group.label] || group.label;
}

function polar(radius: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: CENTER + Math.cos(rad) * radius, y: CENTER + Math.sin(rad) * radius };
}

function annularSector(inner: number, outer: number, startDeg: number, endDeg: number) {
  const os = polar(outer, startDeg);
  const oe = polar(outer, endDeg);
  const ie = polar(inner, endDeg);
  const is = polar(inner, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${os.x.toFixed(3)} ${os.y.toFixed(3)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${oe.x.toFixed(3)} ${oe.y.toFixed(3)}`,
    `L ${ie.x.toFixed(3)} ${ie.y.toFixed(3)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${is.x.toFixed(3)} ${is.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}

function arcPath(radius: number, startDeg: number, endDeg: number) {
  const start = polar(radius, startDeg);
  const end = polar(radius, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function buildSegments(count: number, inner: number, outer: number, gap: number): Segment[] {
  if (!count) return [];
  const width = (END_DEG - START_DEG) / count;
  return Array.from({ length: count }, (_, index) => {
    const start = START_DEG + width * index + gap / 2;
    const end = START_DEG + width * (index + 1) - gap / 2;
    const mid = (start + end) / 2;
    return {
      start,
      end,
      mid,
      path: annularSector(inner, outer, start, end),
      icon: polar((inner + outer) / 2, mid),
    };
  });
}

function codepenArc(radius: number): ArcMotion {
  const ratio = radius / CODEPEN_BASE_RADIUS;
  return {
    shift: CODEPEN_SHIFT,
    initialDash: `${10 * ratio} ${350 * ratio}`,
    initialOffset: -230 * ratio,
    finalDash: `${85 * ratio} ${275 * ratio}`,
    finalOffset: -186 * ratio,
    closeDash: `0 ${359 * ratio}`,
    closeOffset: -240 * ratio,
  };
}

function activateWithKeyboard(event: ReactKeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

const MAIN_ARC_RADIUS = (MAIN_INNER + MAIN_OUTER) / 2;
const SUB_ARC_RADIUS = (SUB_INNER + SUB_OUTER) / 2;
const MAIN_ARC = codepenArc(MAIN_ARC_RADIUS);
const SUB_ARC = codepenArc(SUB_ARC_RADIUS);

function submenuArcForSegment(segment: Segment): ArcMotion {
  const ratio = SUB_ARC_RADIUS / CODEPEN_BASE_RADIUS;
  const sourceDash = 85 * ratio;
  const sourceGap = 275 * ratio;
  const angularLength = SUB_ARC_RADIUS * ((segment.end - segment.start) * Math.PI / 180);
  const finalLength = Math.max(sourceDash, angularLength + sourceDash);
  const finalOffset = SUB_ARC.finalOffset + (finalLength - sourceDash) / 2;
  return {
    ...SUB_ARC,
    finalDash: `${finalLength} ${sourceGap}`,
    finalOffset,
  };
}

function TrackItem({
  group,
  index,
  position,
  selected,
  compact,
}: {
  group: ExactNavGroup;
  index: number;
  position: MotionValue<number>;
  selected: boolean;
  compact: boolean;
}) {
  const slotWidth = (END_DEG - START_DEG) / VISIBLE;
  const x = useTransform(position, (value) => polar(MAIN_ARC_RADIUS, START_DEG + slotWidth * (index - value + 0.5)).x);
  const y = useTransform(position, (value) => polar(MAIN_ARC_RADIUS, START_DEG + slotWidth * (index - value + 0.5)).y);
  const opacity = useTransform(position, (value) => {
    const relative = index - value;
    if (relative < -0.85 || relative > VISIBLE - 0.15) return 0;
    const edge = Math.min(relative + 0.85, VISIBLE - 0.15 - relative);
    return clamp(edge / 0.42, 0, 1);
  });
  const featured = useTransform(position, (value) => Math.abs(index - value - 1) < 0.5 ? 1 : 0);
  const darkOpacity = useTransform(featured, [0, 1], [1, 0]);
  const lightOpacity = useTransform(featured, [0, 1], [0, 1]);
  const Icon = group.items[0]?.icon;
  if (!Icon) return null;
  const iconSize = compact ? 22 : 23;

  const initialPosition = position.get();
  const relativeAtOpen = index - initialPosition;
  const slotAtOpen = Math.round(relativeAtOpen);
  const visibleAtOpen = slotAtOpen >= 0 && slotAtOpen < VISIBLE && Math.abs(relativeAtOpen - slotAtOpen) < 0.5;
  const initialPoint = polar(MAIN_ARC_RADIUS, START_DEG + slotWidth * (relativeAtOpen + 0.5));
  const enterX = CODEPEN_LINK_ORIGIN - initialPoint.x;
  const enterY = CODEPEN_LINK_ORIGIN - initialPoint.y;
  const enterDelay = 0.15 + clamp(slotAtOpen, 0, VISIBLE - 1) * 0.1;

  return (
    <motion.g style={{ x, y, opacity, pointerEvents: "none" }}>
      <motion.g
        initial={visibleAtOpen ? { x: enterX, y: enterY } : false}
        animate={{ x: 0, y: 0 }}
        transition={visibleAtOpen ? { duration: 0.25, delay: enterDelay, ease: power1Out } : { duration: 0 }}
      >
        <motion.g style={{ opacity: darkOpacity }}>
          <Icon x={-iconSize / 2} y={-10 - iconSize / 2} width={iconSize} height={iconSize} className={`${styles.segmentIcon} ${selected ? styles.selectedIcon : ""}`} aria-hidden="true" />
          <text x={0} y={15} className={`${styles.segmentLabel} ${selected ? styles.selectedLabel : ""}`}>{groupLabel(group)}</text>
        </motion.g>
        <motion.g style={{ opacity: lightOpacity }}>
          <Icon x={-iconSize / 2} y={-10 - iconSize / 2} width={iconSize} height={iconSize} className={styles.featuredIcon} aria-hidden="true" />
          <text x={0} y={15} className={styles.featuredLabel}>{groupLabel(group)}</text>
        </motion.g>
      </motion.g>
    </motion.g>
  );
}

export function AdminMobileQuarterMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [viewport, setViewport] = useState({ width: 390, height: 844 });
  const [open, setOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [settled, setSettled] = useState(0);
  const position = useMotionValue(0);
  const animationRef = useRef<ReturnType<typeof animateValue> | null>(null);
  const gesture = useRef<MenuGesture>(emptyGesture());
  const suppressClick = useRef(false);

  const mobile = viewport.width < BREAKPOINT;
  useBackgroundInteractionLock(open && mobile);
  const menuSize = clamp(Math.min(viewport.width * 1.035, viewport.height * 0.64), 306, 430);
  const compact = viewport.width <= 390 || viewport.height <= 720;
  const pixelsPerItem = clamp(menuSize * 0.23, 70, 98);
  const maxPosition = Math.max(0, exactNavStructure.length - VISIBLE);
  const mainSegments = useMemo(() => buildSegments(VISIBLE, MAIN_INNER, MAIN_OUTER, MAIN_GAP), []);
  const selected = selectedGroup == null ? null : exactNavStructure[selectedGroup];
  const subSegments = useMemo(() => buildSegments(selected?.items.length || 0, SUB_INNER, SUB_OUTER, SUB_GAP), [selected]);

  const stopAnimation = useCallback(() => {
    animationRef.current?.stop();
    animationRef.current = null;
  }, []);

  const snapTo = useCallback((target: number, initialVelocity = 0) => {
    const bounded = clamp(target, 0, maxPosition);
    stopAnimation();
    if (reduceMotion) {
      position.set(bounded);
      setSettled(Math.round(bounded));
      return;
    }
    animationRef.current = animateValue(position, bounded, {
      type: "spring",
      stiffness: compact ? 570 : 520,
      damping: compact ? 45 : 42,
      mass: 0.58,
      velocity: initialVelocity,
      restDelta: 0.002,
      restSpeed: 0.01,
      onComplete: () => {
        position.set(bounded);
        setSettled(Math.round(bounded));
        animationRef.current = null;
      },
    });
  }, [compact, maxPosition, position, reduceMotion, stopAnimation]);

  const close = useCallback(() => {
    stopAnimation();
    setOpen(false);
  }, [stopAnimation]);

  const chooseSlot = useCallback((slot: number) => {
    if (suppressClick.current) return;
    const base = clamp(Math.round(position.get()), 0, maxPosition);
    const index = clamp(base + slot, 0, exactNavStructure.length - 1);
    const group = exactNavStructure[index];
    if (!group) return;
    if (group.label === "GENEL") {
      close();
      router.push("/dashboard");
      return;
    }
    setSelectedGroup((current) => current === index ? null : index);
  }, [close, maxPosition, position, router]);

  const navigate = useCallback((item: ExactNavItem) => {
    if (suppressClick.current) return;
    close();
    router.push(item.path);
  }, [close, router]);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      const next = { width: window.innerWidth, height: window.innerHeight };
      setViewport(next);
      if (next.width >= BREAKPOINT) close();
      setMounted(true);
    };
    const resize = () => {
      if (frame) return;
      frame = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("orientationchange", resize, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, [close]);

  useEffect(() => {
    exactNavStructure.forEach((group) => group.items.forEach((item) => router.prefetch(item.path)));
    router.prefetch("/dashboard");
  }, [router]);

  useEffect(() => {
    const activeIndex = exactNavStructure.findIndex((group) => group.items.some((item) => exactItemIsActive(pathname, item)));
    const target = activeIndex < 0 ? 0 : clamp(activeIndex - 1, 0, maxPosition);
    stopAnimation();
    position.set(target);
    setSettled(Math.round(target));
    setSelectedGroup(null);
    setOpen(false);
  }, [maxPosition, pathname, position, stopAnimation]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopAnimation();
    const at = performance.now();
    gesture.current = {
      pointerId: event.pointerId,
      interaction: beginInteraction({
        pointerType: interactionPointerType(event.pointerType),
        x: event.clientX,
        y: event.clientY,
        at,
        startedOnHandle: true,
      }),
      startPosition: position.get(),
      lastY: event.clientY,
      lastAt: at,
      velocity: 0,
      captured: false,
    };
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!open || current.pointerId !== event.pointerId || !current.interaction) return;
    const now = performance.now();
    const resolution = moveInteraction(
      current.interaction,
      { x: event.clientX, y: event.clientY, at: now },
      {
        axis: "y",
        customDrag: true,
        touchDragHoldMs: 0,
        tapSlopPx: 4,
        dragThresholdPx: 6,
        scrollThresholdPx: 10,
      },
    );

    if (resolution.phase === "candidate") return;
    if (resolution.phase !== "custom-drag") {
      suppressClick.current = true;
      return;
    }

    if (!current.captured) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        current.captured = true;
      } catch {}
    }

    event.preventDefault();
    suppressClick.current = true;
    setSelectedGroup(null);
    const raw = current.startPosition + resolution.deltaY / pixelsPerItem;
    const bounded = clamp(raw, -0.12, maxPosition + 0.12);
    position.set(bounded < 0 ? bounded * 0.28 : bounded > maxPosition ? maxPosition + (bounded - maxPosition) * 0.28 : bounded);
    const elapsed = Math.max(1, now - current.lastAt);
    current.velocity = (event.clientY - current.lastY) / elapsed;
    current.lastY = event.clientY;
    current.lastAt = now;
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = gesture.current;
    if (current.pointerId !== event.pointerId || !current.interaction) return;
    if (cancelled) current.interaction.phase = "cancelled";
    const resolution = endInteraction(
      current.interaction,
      { x: event.clientX, y: event.clientY, at: performance.now() },
      {
        axis: "y",
        customDrag: true,
        touchDragHoldMs: 0,
        tapSlopPx: 4,
        dragThresholdPx: 6,
        scrollThresholdPx: 10,
      },
    );
    if (current.captured && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gesture.current = emptyGesture();

    const currentPos = position.get();
    if (resolution.phase !== "custom-drag") {
      snapTo(Math.round(currentPos));
      if (resolution.phase === "tap") {
        suppressClick.current = false;
      } else {
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 90);
      }
      return;
    }

    event.preventDefault();
    const projected = currentPos + (current.velocity * (compact ? 126 : 145)) / pixelsPerItem;
    const target = clamp(Math.round(projected), 0, maxPosition);
    snapTo(target, (current.velocity * 1000) / pixelsPerItem);
    window.setTimeout(() => { suppressClick.current = false; }, 40);
  };

  if (!mounted || !mobile || typeof document === "undefined") return null;

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
            animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: reduceMotion ? 0.01 : 0.18 }}
          />
        ) : null}
      </AnimatePresence>

      <div
        className={styles.root}
        style={{ width: menuSize, height: menuSize }}
        data-open={open ? "true" : "false"}
        data-has-submenu={selected ? "true" : "false"}
        data-ruth-mobile-quarter-menu="true"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={(event) => finishPointer(event)}
        onPointerCancel={(event) => finishPointer(event, true)}
        onWheel={(event) => {
          if (!open || Math.abs(event.deltaY) < 8) return;
          event.preventDefault();
          snapTo(Math.round(position.get()) + (event.deltaY > 0 ? 1 : -1));
        }}
      >
        <svg className={styles.menuSvg} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} aria-label="ROSTA Coffee Co. mobil menüsü">
          <defs>
            <radialGradient id="ruth-mobile-quarter-menu-shadow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="rgba(0,0,0,0)" />
              <stop offset="0.85" stopColor="rgba(0,0,0,0.72)" />
              <stop offset="1" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <clipPath id="ruth-mobile-main-ring-clip">
              <path d={annularSector(MAIN_INNER - 1, MAIN_OUTER + 1, START_DEG, END_DEG)} />
            </clipPath>
            {selected ? subSegments.map((segment, index) => (
              <clipPath key={`sub-clip-${index}`} id={`ruth-mobile-sub-${selectedGroup}-${index}`}>
                <path d={segment.path} />
              </clipPath>
            )) : null}
          </defs>

          <AnimatePresence>
            {open ? (
              <motion.path
                key="main-ring"
                d={annularSector(MAIN_INNER, MAIN_OUTER, START_DEG, END_DEG)}
                className={styles.mainRingBase}
                initial={{ scale: reduceMotion ? 1 : 0.4 }}
                animate={{ scale: 1 }}
                exit={{
                  scale: reduceMotion ? 1 : 0.4,
                  transition: { duration: reduceMotion ? 0.01 : 0.55, delay: reduceMotion ? 0 : 0.05, ease: BACK_IN_3 },
                }}
                transition={{ duration: reduceMotion ? 0.01 : 1.2, ease: MAIN_ELASTIC }}
                style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {open ? (
              <motion.circle
                key="codepen-main-arc"
                cx={CENTER}
                cy={CENTER}
                r={MAIN_ARC_RADIUS}
                fill="none"
                className={styles.accentWedge}
                strokeWidth={MAIN_OUTER - MAIN_INNER}
                initial={reduceMotion ? { x: 0, y: 0, strokeDasharray: MAIN_ARC.finalDash, strokeDashoffset: MAIN_ARC.finalOffset } : {
                  x: MAIN_ARC.shift,
                  y: MAIN_ARC.shift,
                  strokeDasharray: MAIN_ARC.initialDash,
                  strokeDashoffset: MAIN_ARC.initialOffset,
                }}
                animate={{ x: 0, y: 0, strokeDasharray: MAIN_ARC.finalDash, strokeDashoffset: MAIN_ARC.finalOffset }}
                exit={{
                  strokeDasharray: MAIN_ARC.closeDash,
                  strokeDashoffset: MAIN_ARC.closeOffset,
                  x: MAIN_ARC.shift,
                  y: MAIN_ARC.shift,
                  transition: reduceMotion ? { duration: 0.01 } : {
                    strokeDasharray: { duration: 0.4, delay: 0.1, ease: power1Out },
                    strokeDashoffset: { duration: 0.4, delay: 0.1, ease: power1Out },
                    x: { duration: 0.01, delay: 0.51 },
                    y: { duration: 0.01, delay: 0.51 },
                  },
                }}
                transition={reduceMotion ? { duration: 0.01 } : {
                  x: { duration: 0.4, delay: 0.2, ease: power3Out },
                  y: { duration: 0.4, delay: 0.2, ease: power3Out },
                  strokeDasharray: { duration: 0.3, delay: 0.6, ease: power1Out },
                  strokeDashoffset: { duration: 0.3, delay: 0.6, ease: power1Out },
                }}
                style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
              />
            ) : null}
          </AnimatePresence>

          {open ? mainSegments.map((segment, slot) => {
            const base = clamp(settled, 0, maxPosition);
            const groupIndex = clamp(base + slot, 0, exactNavStructure.length - 1);
            const group = exactNavStructure[groupIndex];
            const selectedNow = selectedGroup === groupIndex;
            const active = group.items.some((item) => exactItemIsActive(pathname, item));
            const action = () => chooseSlot(slot);
            return (
              <g key={`hit-${slot}`} className={styles.segmentButton} role="button" tabIndex={0} aria-label={group.label === "GENEL" ? "Kontrol Merkezi" : `${groupLabel(group)} alt menüsünü aç`} aria-expanded={group.label === "GENEL" ? undefined : selectedNow} onClick={action} onKeyDown={(event) => activateWithKeyboard(event, action)}>
                <path d={segment.path} className={`${styles.mainSegment} ${active ? styles.activeSegment : ""} ${selectedNow ? styles.selectedSegment : ""}`} />
                {selectedNow ? (
                  <path d={arcPath(MAIN_OUTER + 2.7, segment.start, segment.end)} className={styles.selectedOuterArc} />
                ) : null}
              </g>
            );
          }) : null}

          {open ? (
            <motion.g clipPath="url(#ruth-mobile-main-ring-clip)">
              {exactNavStructure.map((group, index) => (
                <TrackItem key={`${group.label}:${index}`} group={group} index={index} position={position} selected={selectedGroup === index} compact={compact} />
              ))}
            </motion.g>
          ) : null}

          <AnimatePresence
            onExitComplete={() => {
              if (!open) setSelectedGroup(null);
            }}
          >
            {open && selected ? (
              <motion.g
                key={`sub-${selected.label}`}
                initial={{ scale: 1 }}
                animate={{ scale: 1 }}
                exit={{ scale: reduceMotion ? 1 : 0.4 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.55, delay: reduceMotion ? 0 : 0.05, ease: BACK_IN_3 }}
                style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
              >
                <path d={annularSector(SUB_INNER, SUB_OUTER, START_DEG, END_DEG)} className={styles.subRingBase} />
                {selected.items.map((item, index) => {
                  const segment = subSegments[index];
                  if (!segment) return null;
                  const Icon = item.icon;
                  const active = exactItemIsActive(pathname, item);
                  const accented = active || (selected.items.length > 2 && index % 2 === 0);
                  const size = compact ? 14 : 15;
                  const action = () => navigate(item);
                  const delay = index * 0.045;
                  const subArc = submenuArcForSegment(segment);
                  return (
                    <g key={`${item.path}:${item.label}`} className={styles.segmentButton} role="button" tabIndex={0} aria-label={item.label} onClick={action} onKeyDown={(event) => activateWithKeyboard(event, action)}>
                      <path d={segment.path} className={accented ? styles.subHitSegment : styles.subSegment} />
                      {accented ? (
                        <g clipPath={`url(#ruth-mobile-sub-${selectedGroup}-${index})`}>
                          <motion.g
                            initial={reduceMotion ? { x: 0, y: 0 } : { x: subArc.shift, y: subArc.shift }}
                            animate={{ x: 0, y: 0 }}
                            exit={{
                              x: subArc.shift,
                              y: subArc.shift,
                              transition: reduceMotion ? { duration: 0.01 } : {
                                x: { duration: 0.01, delay: 0.51 },
                                y: { duration: 0.01, delay: 0.51 },
                              },
                            }}
                            transition={reduceMotion ? { duration: 0.01 } : {
                              x: { duration: 0.4, delay: 0.2 + delay, ease: power3Out },
                              y: { duration: 0.4, delay: 0.2 + delay, ease: power3Out },
                            }}
                          >
                            <g transform={`rotate(${segment.mid - CODEPEN_CENTER_DEG} ${CENTER} ${CENTER})`}>
                              <motion.circle
                                cx={CENTER}
                                cy={CENTER}
                                r={SUB_ARC_RADIUS}
                                fill="none"
                                className={active ? styles.subAccentArcActive : styles.subAccentArc}
                                strokeWidth={SUB_OUTER - SUB_INNER}
                                initial={reduceMotion ? { strokeDasharray: subArc.finalDash, strokeDashoffset: subArc.finalOffset } : {
                                  strokeDasharray: subArc.initialDash,
                                  strokeDashoffset: subArc.initialOffset,
                                }}
                                animate={{ strokeDasharray: subArc.finalDash, strokeDashoffset: subArc.finalOffset }}
                                exit={{
                                  strokeDasharray: subArc.closeDash,
                                  strokeDashoffset: subArc.closeOffset,
                                  transition: reduceMotion ? { duration: 0.01 } : {
                                    strokeDasharray: { duration: 0.4, delay: 0.1, ease: power1Out },
                                    strokeDashoffset: { duration: 0.4, delay: 0.1, ease: power1Out },
                                  },
                                }}
                                transition={reduceMotion ? { duration: 0.01 } : {
                                  strokeDasharray: { duration: 0.3, delay: 0.6 + delay, ease: power1Out },
                                  strokeDashoffset: { duration: 0.3, delay: 0.6 + delay, ease: power1Out },
                                }}
                              />
                            </g>
                          </motion.g>
                        </g>
                      ) : null}
                      <Icon x={segment.icon.x - size / 2} y={segment.icon.y - size / 2} width={size} height={size} className={`${styles.subIcon} ${active ? styles.activeSubIcon : ""}`} aria-hidden="true" />
                      <title>{item.label}</title>
                    </g>
                  );
                })}
              </motion.g>
            ) : null}
          </AnimatePresence>

          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r="108"
            fill="url(#ruth-mobile-quarter-menu-shadow)"
            className={styles.coreShadow}
            animate={{ scale: open ? 1.3 : 1 }}
            transition={open
              ? { duration: reduceMotion ? 0.01 : 0.8, delay: reduceMotion ? 0 : 0.1, ease: CORE_ELASTIC }
              : { duration: reduceMotion ? 0.01 : 0.45, delay: reduceMotion ? 0 : 0.15, ease: BACK_IN_3 }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />
          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r="102"
            className={styles.core}
            animate={{ scale: open ? 1.3 : 1, fill: open ? "hsl(var(--text-main))" : "hsl(var(--surface-primary))" }}
            transition={open
              ? {
                  scale: { duration: reduceMotion ? 0.01 : 0.8, delay: reduceMotion ? 0 : 0.1, ease: CORE_ELASTIC },
                  fill: { duration: reduceMotion ? 0.01 : 0.6, delay: reduceMotion ? 0 : 0.1, ease: power4Out },
                }
              : {
                  scale: { duration: reduceMotion ? 0.01 : 0.45, delay: reduceMotion ? 0 : 0.15, ease: BACK_IN_3 },
                  fill: { duration: reduceMotion ? 0.01 : 0.45, delay: reduceMotion ? 0 : 0.15, ease: power4In },
                }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
          />

          <motion.g
            className={styles.burger}
            animate={{ x: open ? -10 : 0, y: open ? -10 : 0 }}
            transition={open
              ? { duration: reduceMotion ? 0.01 : 0.3, delay: reduceMotion ? 0 : 0.2 }
              : { duration: reduceMotion ? 0.01 : 0.4, delay: reduceMotion ? 0 : 0.2, ease: power1In }}
          >
            <motion.line
              x1="306" y1="306" x2="336" y2="306" className={styles.burgerLine}
              animate={{ y: open ? 12 : 0, rotate: open ? 45 : 0, stroke: open ? "#fff" : "hsl(var(--text-main))" }}
              transition={open ? {
                y: { duration: reduceMotion ? 0.01 : 0.2, delay: reduceMotion ? 0 : 0.1 },
                rotate: { duration: reduceMotion ? 0.01 : 0.4, delay: reduceMotion ? 0 : 0.1 },
                stroke: { duration: reduceMotion ? 0.01 : 0.4, delay: reduceMotion ? 0 : 0.1 },
              } : {
                y: { duration: reduceMotion ? 0.01 : 0.1, delay: reduceMotion ? 0 : 0.5 },
                rotate: { duration: reduceMotion ? 0.01 : 0.3, delay: reduceMotion ? 0 : 0.2, ease: power1In },
                stroke: { duration: reduceMotion ? 0.01 : 0.3, delay: reduceMotion ? 0 : 0.2, ease: power1In },
              }}
              style={{ transformOrigin: "321px 306px" }}
            />
            <motion.line
              x1="306" y1="319" x2="336" y2="319" className={styles.burgerLine}
              animate={{ rotate: open ? 45 : 0, stroke: open ? "rgba(255,255,255,0)" : "hsl(var(--text-main))" }}
              transition={open
                ? { duration: reduceMotion ? 0.01 : 0.4, delay: reduceMotion ? 0 : 0.1 }
                : { duration: reduceMotion ? 0.01 : 0.3, delay: reduceMotion ? 0 : 0.2, ease: power1In }}
              style={{ transformOrigin: "321px 319px" }}
            />
            <motion.line
              x1="306" y1="332" x2="336" y2="332" className={styles.burgerLine}
              animate={{ y: open ? -12 : 0, rotate: open ? -45 : 0, stroke: open ? "#fff" : "hsl(var(--text-main))" }}
              transition={open ? {
                y: { duration: reduceMotion ? 0.01 : 0.2, delay: reduceMotion ? 0 : 0.1 },
                rotate: { duration: reduceMotion ? 0.01 : 0.4, delay: reduceMotion ? 0 : 0.1 },
                stroke: { duration: reduceMotion ? 0.01 : 0.4, delay: reduceMotion ? 0 : 0.1 },
              } : {
                y: { duration: reduceMotion ? 0.01 : 0.1, delay: reduceMotion ? 0 : 0.5 },
                rotate: { duration: reduceMotion ? 0.01 : 0.3, delay: reduceMotion ? 0 : 0.2, ease: power1In },
                stroke: { duration: reduceMotion ? 0.01 : 0.3, delay: reduceMotion ? 0 : 0.2, ease: power1In },
              }}
              style={{ transformOrigin: "321px 332px" }}
            />
          </motion.g>
        </svg>

        <button
          type="button"
          className={styles.coreHit}
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
          onClick={() => {
            if (open) {
              close();
              return;
            }
            setSelectedGroup(null);
            setOpen(true);
          }}
        />
      </div>
    </>,
    document.body,
  );
}
