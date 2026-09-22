"use client";

import { GradientOrb } from "@/components/ui/gradient-orb";
import styles from "./RuthieGradientOrb.module.css";

export type RuthieGradientOrbPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

type Props = {
  phase?: RuthieGradientOrbPhase;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
  compact?: boolean;
  className?: string;
  title?: string;
};

export function RuthieGradientOrb({
  phase = "idle",
  compact = false,
  className,
  title = "ROSTA Insight",
}: Props) {
  return (
    <div
      className={`${styles.root}${className ? ` ${className}` : ""}`}
      data-phase={phase}
      data-compact={compact ? "true" : "false"}
      role="img"
      aria-label={`${title} · ${phase}`}
    >
      <GradientOrb activity={phase} className={styles.originalOrb} />
    </div>
  );
}
