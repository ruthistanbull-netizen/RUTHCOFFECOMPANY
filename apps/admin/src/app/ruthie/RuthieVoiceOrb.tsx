"use client";

import { useEffect, useRef } from "react";
import { mountRuthieJarvisNeuralCore } from "./RuthieVoiceOrbJarvisEngine";
import { mountRuthieJarvisParticleSpheres } from "./RuthieVoiceOrbParticleSpheres";
import { mountRuthieJarvisParticleSpheres2D } from "./RuthieVoiceOrbParticleSpheres2D";
import styles from "./RuthieVoiceOrbFullHd.module.css";

export type RuthieVoiceVisualPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

type RuthieVoiceOrbProps = {
  phase: RuthieVoiceVisualPhase;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
  muted: boolean;
  compact?: boolean;
  showWaveform?: boolean;
};

const FULL_HD_ORB_VERSION = "jarvis-neural-core-fullhd-gold-v4-unified";
const WEBGL_SPHERE_VERSION = "webgl-particle-spheres-v4-ultra-hd";
const MOBILE_SPHERE_VERSION = "mobile-webgl-ultra-hd-v1";

export function RuthieVoiceOrb({
  phase,
  stream,
  inputStream,
  outputStream,
  muted,
  compact = false,
  showWaveform = false,
}: RuthieVoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sphereCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(phase);
  const mutedRef = useRef(muted);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const sphereCanvas = sphereCanvasRef.current;
    if (!canvas || !sphereCanvas) return;

    const mountOptions = {
      getPhase: () => phaseRef.current,
      getMuted: () => mutedRef.current,
      stream,
      inputStream,
      outputStream,
    };

    const mobileSingleSphere = window.matchMedia(
      "(max-width: 720px), (pointer: coarse)",
    ).matches;

    const supportsWebGl = Boolean(
      sphereCanvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        depth: false,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      }),
    );

    const disposeCore = mobileSingleSphere
      ? null
      : mountRuthieJarvisNeuralCore(canvas, mountOptions);
    const disposeSpheres = supportsWebGl
      ? mountRuthieJarvisParticleSpheres(sphereCanvas, mountOptions)
      : mountRuthieJarvisParticleSpheres2D(sphereCanvas, mountOptions);

    canvas.dataset.ruthieOrbVersion = FULL_HD_ORB_VERSION;
    canvas.dataset.mobileCoreDisabled = mobileSingleSphere ? "true" : "false";
    sphereCanvas.dataset.ruthieSphereVersion = mobileSingleSphere
      ? MOBILE_SPHERE_VERSION
      : WEBGL_SPHERE_VERSION;
    sphereCanvas.dataset.mobileSingleSphere = mobileSingleSphere ? "true" : "false";
    sphereCanvas.dataset.mobileRenderer = supportsWebGl
      ? mobileSingleSphere ? "webgl-ultra-hd" : "webgl"
      : "canvas2d-fallback";
    sphereCanvas.dataset.mobilePixelDensity = String(Math.min(window.devicePixelRatio || 1, 3));

    return () => {
      disposeSpheres();
      disposeCore?.();
    };
  }, [inputStream, outputStream, stream]);

  return (
    <div
      className={styles.root}
      data-phase={phase}
      data-compact={compact ? "true" : "false"}
      data-show-waveform={showWaveform ? "true" : "false"}
      data-render-mode="jarvis-adaptive-spheres-ultra-hd"
      data-ruthie-visual-root
      data-ruthie-full-hd-orb
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className={styles.coreCanvas}
        data-ruthie-jarvis-orb
        data-ruthie-orb-version={FULL_HD_ORB_VERSION}
        data-renderer="ruthie-jarvis-neural-core-canvas"
      />
      <canvas
        ref={sphereCanvasRef}
        className={styles.sphereCanvas}
        data-ruthie-particle-spheres
        data-ruthie-sphere-version={WEBGL_SPHERE_VERSION}
        data-renderer="ruthie-adaptive-particle-spheres"
      />
    </div>
  );
}
