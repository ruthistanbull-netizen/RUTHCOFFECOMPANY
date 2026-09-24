"use client";

import { useEffect, useRef, useState } from "react";
import { mountRuthieTrue3DCore } from "./RuthieTrue3DCoreEngine";
import { RuthieVoiceOrbV83Separated } from "./RuthieVoiceOrbV83Separated";
import styles from "./RuthieReferenceCore.module.css";

export type RuthieVoiceVisualPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

type RuthieVoiceOrbTrue3DProps = {
  phase: RuthieVoiceVisualPhase;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
  muted: boolean;
  compact?: boolean;
  showWaveform?: boolean;
};

export function RuthieVoiceOrbTrue3D({
  phase,
  stream,
  inputStream,
  outputStream,
  muted,
  compact = false,
  showWaveform = true,
}: RuthieVoiceOrbTrue3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(phase);
  const mutedRef = useRef(muted);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (fallback) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const dispose = mountRuthieTrue3DCore(canvas, {
        getPhase: () => phaseRef.current,
        getMuted: () => mutedRef.current,
        stream,
        inputStream,
        outputStream,
        compact,
      });

      if (!dispose) {
        setFallback(true);
        return;
      }

      return dispose;
    } catch (error) {
      console.error("Ruthie reference 3D renderer could not start", error);
      canvas.dataset.renderError = "reference-3d-start-failed";
      setFallback(true);
    }
  }, [compact, fallback, inputStream, outputStream, stream]);

  if (fallback) {
    return (
      <RuthieVoiceOrbV83Separated
        phase={phase}
        stream={stream}
        inputStream={inputStream}
        outputStream={outputStream}
        muted={muted}
        compact={compact}
        showWaveform={showWaveform}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={styles.canvas}
      data-ruthie-jarvis-orb
      data-ruthie-orb-version="9.2-reference-metallic-segments"
      data-renderer="webgl2-ruthie-reference-core"
    />
  );
}
