"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./RuthieChatOrbPortal.module.css";

type StaticDot = { x: number; y: number; radius: number; opacity: number };

function createStaticSphereDots(): StaticDot[] {
  const dots: StaticDot[] = [];
  const ringCount = 19;
  const equatorSegments = 42;
  for (let ring = 0; ring <= ringCount; ring += 1) {
    const latitude = -Math.PI / 2 + (ring / ringCount) * Math.PI;
    const ringRadius = Math.max(0.035, Math.cos(latitude));
    const segments = ring === 0 || ring === ringCount ? 1 : Math.max(8, Math.round(equatorSegments * Math.pow(ringRadius, 0.82)));
    const offset = (ring % 2) * (Math.PI / Math.max(1, segments));
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2 + offset;
      const x3 = Math.cos(angle) * ringRadius;
      const z3 = Math.sin(angle) * ringRadius;
      const depth = (z3 + 1) / 2;
      dots.push({ x: 50 + x3 * 42, y: 50 + Math.sin(latitude) * 42, radius: 0.32 + depth * 0.52, opacity: 0.2 + depth * 0.72 });
    }
  }
  return dots;
}

export function RuthieChatOrbPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const dots = useMemo(createStaticSphereDots, []);
  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    const locate = () => {
      const element = document.querySelector('[data-ruthie-chat-shell] [aria-live="polite"]');
      if (element instanceof HTMLElement) {
        element.dataset.ruthieChatMessages = "true";
        setTarget(element);
        return;
      }
      attempts += 1;
      if (attempts < 120) frame = window.requestAnimationFrame(locate);
    };
    locate();
    return () => {
      window.cancelAnimationFrame(frame);
      const element = document.querySelector('[data-ruthie-chat-shell] [data-ruthie-chat-messages="true"]');
      if (element instanceof HTMLElement) delete element.dataset.ruthieChatMessages;
    };
  }, []);
  if (!target) return null;
  return createPortal(
    <div className={styles.orb} data-ruthie-chat-orb-background aria-hidden="true">
      <div className={styles.haze} />
      <svg className={styles.sphere} viewBox="0 0 100 100" role="presentation">
        <ellipse className={styles.orbit} cx="50" cy="50" rx="47" ry="17" transform="rotate(-13 50 50)" />
        <ellipse className={styles.orbitSoft} cx="50" cy="50" rx="44" ry="20" transform="rotate(24 50 50)" />
        {dots.map((dot, index) => <circle key={`${index}-${dot.x.toFixed(2)}-${dot.y.toFixed(2)}`} className={styles.dot} cx={dot.x} cy={dot.y} r={dot.radius} opacity={dot.opacity} />)}
      </svg>
    </div>, target,
  );
}
