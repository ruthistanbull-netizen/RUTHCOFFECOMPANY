"use client";

import { useEffect, useRef, useState } from "react";
import { RuthieVoiceOrbV83Separated } from "./RuthieVoiceOrbV83Separated";

export type RuthieVoiceVisualPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

type RuthieVoiceOrbReference3DProps = {
  phase: RuthieVoiceVisualPhase;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
  muted: boolean;
  compact?: boolean;
  showWaveform?: boolean;
};

type RuthieReferenceV11Module = {
  mountRuthieReferenceV11: (
    canvas: HTMLCanvasElement,
    options: {
      getPhase: () => RuthieVoiceVisualPhase;
      getMuted: () => boolean;
      stream?: MediaStream | null;
      inputStream?: MediaStream | null;
      outputStream?: MediaStream | null;
      compact: boolean;
    },
  ) => Promise<() => void>;
};

const ENGINE_CHUNK_COUNT = 5;
let modulePromise: Promise<RuthieReferenceV11Module> | null = null;

function decodeBase64Utf8(encoded: string) {
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function loadReferenceModule() {
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    const chunks = await Promise.all(
      Array.from({ length: ENGINE_CHUNK_COUNT }, async (_, index) => {
        const suffix = String(index).padStart(2, "0");
        const response = await fetch(`/ruthie/v11/engine-${suffix}.b64`, {
          cache: "force-cache",
        });
        if (!response.ok) {
          throw new Error(`Ruthie v11 engine chunk failed: ${response.status}`);
        }
        return response.text();
      }),
    );

    const source = decodeBase64Utf8(chunks.join(""));
    const moduleUrl = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );

    try {
      return (await import(/* webpackIgnore: true */ moduleUrl)) as RuthieReferenceV11Module;
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  })();

  return modulePromise;
}

export function RuthieVoiceOrbReference3D({
  phase,
  stream,
  inputStream,
  outputStream,
  muted,
  compact = false,
  showWaveform = true,
}: RuthieVoiceOrbReference3DProps) {
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

    let cancelled = false;
    let dispose: (() => void) | undefined;
    canvas.dataset.renderStage = "loading";
    delete canvas.dataset.renderError;

    void loadReferenceModule()
      .then(async ({ mountRuthieReferenceV11 }) => {
        if (cancelled) return;
        dispose = await mountRuthieReferenceV11(canvas, {
          getPhase: () => phaseRef.current,
          getMuted: () => mutedRef.current,
          stream,
          inputStream,
          outputStream,
          compact,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Ruthie reference renderer could not start", error);
        canvas.dataset.renderError = "reference-threejs-v11-start-failed";
        setFallback(true);
      });

    return () => {
      cancelled = true;
      dispose?.();
    };
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
      data-ruthie-jarvis-orb
      data-ruthie-orb-version="11.0-reference-hierarchy"
      data-renderer="threejs-r185-reference-v11"
      style={{
        width: "100%",
        height: "100%",
        minWidth: "100%",
        minHeight: "100%",
        display: "block",
      }}
    />
  );
}
