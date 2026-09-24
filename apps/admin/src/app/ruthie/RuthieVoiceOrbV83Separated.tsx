"use client";

import { useEffect, useRef } from "react";

export type RuthieVoiceVisualPhase =
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "error";

type RuthieVoiceOrbV83SeparatedProps = {
  phase: RuthieVoiceVisualPhase;
  stream?: MediaStream | null;
  inputStream?: MediaStream | null;
  outputStream?: MediaStream | null;
  muted: boolean;
  compact?: boolean;
  showWaveform?: boolean;
};

type RuthieV83Module = {
  mountRuthieOrbV83: (
    canvas: HTMLCanvasElement,
    options: {
      getPhase: () => RuthieVoiceVisualPhase;
      getMuted: () => boolean;
      stream?: MediaStream | null;
      inputStream?: MediaStream | null;
      outputStream?: MediaStream | null;
      assetBasePath: string;
      interactivePointer: boolean;
      onError: (error: Error) => void;
    },
  ) => () => void;
};

const ENGINE_CHUNK_COUNT = 6;
const RUNTIME_MODULE_KEY = "__RuthieV83Module";
let modulePromise: Promise<RuthieV83Module> | null = null;

function loadRuthieV83Module() {
  if (modulePromise) return modulePromise;

  modulePromise = (async () => {
    const chunks = await Promise.all(
      Array.from({ length: ENGINE_CHUNK_COUNT }, async (_, index) => {
        const suffix = String(index).padStart(2, "0");
        const response = await fetch(`/ruthie/v8-3/packed/engine-${suffix}.txt`, {
          cache: "force-cache",
        });
        if (!response.ok) {
          throw new Error(`Ruthie v8.3 engine chunk failed: ${response.status}`);
        }
        return response.text();
      }),
    );

    const engineSource = chunks.join("");
    const classicScriptSource = engineSource.replace(
      /\bexport\s+(?=function\s+mountRuthieOrbV83\b)/,
      "",
    );

    if (classicScriptSource === engineSource) {
      throw new Error("Ruthie v8.3 engine export could not be prepared.");
    }

    const runtimeSource = `${classicScriptSource}\n;globalThis.${RUNTIME_MODULE_KEY} = { mountRuthieOrbV83 };\n`;
    const blob = new Blob([runtimeSource], { type: "text/javascript" });
    const scriptUrl = URL.createObjectURL(blob);
    Reflect.deleteProperty(window, RUNTIME_MODULE_KEY);

    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = scriptUrl;
        script.async = true;
        script.dataset.ruthieV83Engine = "true";
        script.onload = () => {
          script.remove();
          resolve();
        };
        script.onerror = () => {
          script.remove();
          reject(new Error("Ruthie v8.3 engine script could not be executed."));
        };
        document.head.appendChild(script);
      });

      const loadedModule = Reflect.get(window, RUNTIME_MODULE_KEY) as RuthieV83Module | undefined;
      if (!loadedModule || typeof loadedModule.mountRuthieOrbV83 !== "function") {
        throw new Error("Ruthie v8.3 engine did not expose its renderer.");
      }
      return loadedModule;
    } finally {
      URL.revokeObjectURL(scriptUrl);
    }
  })().catch((error) => {
    modulePromise = null;
    throw error;
  });

  return modulePromise;
}

export function RuthieVoiceOrbV83Separated({
  phase,
  stream,
  inputStream,
  outputStream,
  muted,
}: RuthieVoiceOrbV83SeparatedProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
    if (!canvas) return;

    let cancelled = false;
    let dispose: (() => void) | undefined;

    void loadRuthieV83Module()
      .then(({ mountRuthieOrbV83 }) => {
        if (cancelled) return;
        dispose = mountRuthieOrbV83(canvas, {
          getPhase: () => phaseRef.current,
          getMuted: () => mutedRef.current,
          stream,
          inputStream,
          outputStream,
          assetBasePath: "/ruthie/v8-3",
          interactivePointer: true,
          onError: (error) => {
            console.error("Ruthie v8.3 supplied renderer error", error);
          },
        });
      })
      .catch((error) => {
        canvas.dataset.renderError = "supplied-engine-load-failed";
        console.error("Ruthie v8.3 supplied engine could not load", error);
      });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [inputStream, outputStream, stream]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-ruthie-jarvis-orb
      data-ruthie-orb-version="8.3-separated-four-layer-supplied"
      data-renderer="canvas-ruthie-v8-3-separated-supplied"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: "100%",
        minHeight: "100%",
        left: 0,
        top: 0,
        display: "block",
      }}
    />
  );
}
