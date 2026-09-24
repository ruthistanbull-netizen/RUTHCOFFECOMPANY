"use client";

import { useEffect, useRef } from "react";

const DOUBLE_TAP_MS = 360;
const TAP_MAX_MS = 360;
const TAP_DISTANCE = 10;

type TouchCandidate = {
  pointerId: number;
  target: HTMLButtonElement;
  x: number;
  y: number;
  startedAt: number;
  moved: boolean;
};

function ruthieOrbButton(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLButtonElement>('button[data-phase][data-listening][aria-label*="Ruthie"]');
}

export function RuthieMobileDoubleTapGuard() {
  const candidateRef = useRef<TouchCandidate | null>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    const mobile = () => window.matchMedia("(max-width: 760px)").matches;

    const onPointerDown = (event: PointerEvent) => {
      if (!mobile() || event.pointerType !== "touch") return;
      const button = ruthieOrbButton(event.target);
      if (!button) return;
      candidateRef.current = {
        pointerId: event.pointerId,
        target: button,
        x: event.clientX,
        y: event.clientY,
        startedAt: performance.now(),
        moved: false,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const candidate = candidateRef.current;
      if (!candidate || candidate.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > TAP_DISTANCE) candidate.moved = true;
    };

    const onPointerUp = (event: PointerEvent) => {
      const candidate = candidateRef.current;
      if (!candidate || candidate.pointerId !== event.pointerId) return;
      candidateRef.current = null;
      if (!mobile() || candidate.moved || performance.now() - candidate.startedAt > TAP_MAX_MS) return;

      const now = performance.now();
      const secondTap = now - lastTapRef.current <= DOUBLE_TAP_MS;
      if (secondTap) {
        lastTapRef.current = 0;
        return;
      }

      lastTapRef.current = now;
      event.preventDefault();
      event.stopImmediatePropagation();

      window.setTimeout(() => {
        if (!candidate.target.isConnected) return;
        candidate.target.dispatchEvent(new PointerEvent("pointercancel", {
          bubbles: true,
          cancelable: true,
          pointerId: event.pointerId,
          pointerType: "touch",
          clientX: event.clientX,
          clientY: event.clientY,
        }));
      }, 0);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (candidateRef.current?.pointerId === event.pointerId) candidateRef.current = null;
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, []);

  return null;
}
