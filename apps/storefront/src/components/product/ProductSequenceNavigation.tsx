"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { ruthMotion } from "@ruth-commerce/ui/motion";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import styles from "./product-sequence-navigation.module.css";

type SequenceProduct = {
  slug: string;
  name: string;
};

function blocksProductSwipe(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-product-swipe-ignore]")) return true;
  return Boolean(
    target.closest(
      "a, input, select, textarea, summary, [contenteditable='true'], button:not([data-product-swipe-surface])",
    ),
  );
}

function sharedOverlayIsOpen() {
  return Boolean(
    document.querySelector(
      ".ruth-overlay, .ruth-fullscreen-overlay-root[data-state='open']",
    ),
  );
}

export function ProductSequenceNavigation({
  previous,
  next,
  children,
}: {
  previous: SequenceProduct | null;
  next: SequenceProduct | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pointerId = useRef<number | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const suppressClickUntil = useRef(0);
  const [direction, setDirection] = useState<"previous" | "next" | null>(null);
  const [targetName, setTargetName] = useState("");

  const navigate = (target: SequenceProduct | null, nextDirection: "previous" | "next") => {
    if (!target || direction) return;
    setTargetName(target.name);
    setDirection(nextDirection);
    window.setTimeout(
      () => router.push(`/products/${target.slug}`),
      ruthMotion.milliseconds.slow,
    );
  };

  useEffect(() => {
    if (previous) router.prefetch(`/products/${previous.slug}`);
    if (next) router.prefetch(`/products/${next.slug}`);
  }, [next, previous, router]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (blocksProductSwipe(event.target)) return;
      if (sharedOverlayIsOpen()) return;
      if (event.key === "ArrowLeft") navigate(previous, "previous");
      if (event.key === "ArrowRight") navigate(next, "next");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (direction || blocksProductSwipe(event.target) || sharedOverlayIsOpen()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerId.current = event.pointerId;
    startX.current = event.clientX;
    startY.current = event.clientY;
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId || direction) return;
    const distanceX = event.clientX - startX.current;
    const distanceY = event.clientY - startY.current;
    pointerId.current = null;

    const horizontalIntent =
      Math.abs(distanceX) >= 76 &&
      Math.abs(distanceX) > Math.abs(distanceY) * 1.4;
    if (!horizontalIntent) return;

    suppressClickUntil.current = Date.now() + ruthMotion.milliseconds.slow;
    if (distanceX > 0) navigate(previous, "previous");
    if (distanceX < 0) navigate(next, "next");
  };

  return (
    <div
      className={`${styles.root} ${direction ? styles[`leaving-${direction}`] : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pointerId.current = null;
      }}
      onClickCapture={(event) => {
        if (Date.now() >= suppressClickUntil.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {previous ? (
        <button
          type="button"
          className={`${styles.edgeButton} ${styles.previous}`}
          onClick={() => navigate(previous, "previous")}
          aria-label={`Önceki ürün: ${previous.name}`}
        >
          <ChevronLeft aria-hidden="true" />
          <span>{previous.name}</span>
        </button>
      ) : null}

      {next ? (
        <button
          type="button"
          className={`${styles.edgeButton} ${styles.next}`}
          onClick={() => navigate(next, "next")}
          aria-label={`Sonraki ürün: ${next.name}`}
        >
          <span>{next.name}</span>
          <ChevronRight aria-hidden="true" />
        </button>
      ) : null}

      <div className={styles.content}>{children}</div>

      {direction ? (
        <div
          className={`${styles.curtain} ${styles[`curtain-${direction}`]}`}
          aria-hidden="true"
        >
          <span>{targetName}</span>
        </div>
      ) : null}
    </div>
  );
}
