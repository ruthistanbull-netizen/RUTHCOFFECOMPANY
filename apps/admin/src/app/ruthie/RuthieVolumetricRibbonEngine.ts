import {
  mountRuthieSilkRibbon,
  type RuthieSilkOptions,
  type RuthieSilkPhase,
} from "./RuthieSilkRibbonEngine";

export type RuthieVolumetricPhase = RuthieSilkPhase;

export type RuthieRendererDiagnostics = {
  pixelHits: number;
  attempts: number;
  mobileSafari: boolean;
};

export type RuthieVolumetricOptions = RuthieSilkOptions & {
  onReady?: (diagnostics: RuthieRendererDiagnostics) => void;
  onFallback?: (reason: string) => void;
};

const PRIMARY_RENDERER = "webgl2-glsl-silk-ribbon-v5";
const PRIMARY_VERSION = "silk-ribbon-panel-v5.1";

function isAppleTouchBrowser() {
  const navigatorValue = window.navigator;
  return /iPad|iPhone|iPod/i.test(navigatorValue.userAgent)
    || (navigatorValue.platform === "MacIntel" && navigatorValue.maxTouchPoints > 1);
}

function countVisiblePixels(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
) {
  const size = Math.max(6, Math.min(18, Math.floor(Math.min(canvas.width, canvas.height) / 30)));
  const pixels = new Uint8Array(size * size * 4);
  const positions: Array<[number, number]> = [
    [0.24, 0.5],
    [0.38, 0.36],
    [0.5, 0.5],
    [0.62, 0.64],
    [0.76, 0.5],
    [0.5, 0.28],
    [0.5, 0.72],
  ];
  let hits = 0;

  for (const [xAmount, yAmount] of positions) {
    const x = Math.max(0, Math.min(canvas.width - size, Math.round(canvas.width * xAmount - size / 2)));
    const y = Math.max(0, Math.min(canvas.height - size, Math.round(canvas.height * yAmount - size / 2)));
    gl.readPixels(x, y, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let index = 0; index < pixels.length; index += 4) {
      const light = pixels[index] + pixels[index + 1] + pixels[index + 2];
      if (pixels[index + 3] > 2 && light > 24) hits += 1;
    }
  }

  return hits;
}

export function mountRuthieVolumetricRibbon(
  canvas: HTMLCanvasElement,
  options: RuthieVolumetricOptions,
) {
  const mobileSafari = isAppleTouchBrowser();
  let silkActive = true;
  let disposed = false;
  let verificationFrame = 0;
  let attempts = 0;
  let ready = false;

  canvas.dataset.renderer = PRIMARY_RENDERER;
  canvas.dataset.ruthieOrbVersion = PRIMARY_VERSION;
  canvas.dataset.renderStage = "initializing";
  canvas.dataset.mobileSafari = mobileSafari ? "true" : "false";
  delete canvas.dataset.renderError;

  const disposeSilk = mountRuthieSilkRibbon(canvas, {
    ...options,
    compact: options.compact ?? mobileSafari,
  });
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    disposeSilk();
    throw new Error("WebGL2 context disappeared after renderer initialization.");
  }

  canvas.dataset.renderer = PRIMARY_RENDERER;
  canvas.dataset.ruthieOrbVersion = PRIMARY_VERSION;
  canvas.dataset.renderStage = "verifying";

  const stopSilk = () => {
    if (!silkActive) return;
    silkActive = false;
    disposeSilk();
  };

  const markReady = (pixelHits: number) => {
    if (disposed || ready || !silkActive) return;
    ready = true;
    canvas.dataset.renderStage = "ready";
    canvas.dataset.renderPixelHits = String(pixelHits);
    canvas.dataset.renderAttempts = String(attempts);
    canvas.dataset.renderValidation = mobileSafari
      ? "ios-context-health"
      : "pixel-readback";
    delete canvas.dataset.renderError;
    options.onReady?.({ pixelHits, attempts, mobileSafari });
  };

  const fallback = (reason: string) => {
    if (disposed || ready) return;
    stopSilk();
    canvas.dataset.renderStage = "fallback";
    canvas.dataset.renderError = reason;
    canvas.dataset.renderPixelHits = "0";
    options.onFallback?.(reason);
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    fallback("webgl-context-lost");
  };

  const verifyFrame = () => {
    if (disposed || ready || !silkActive) return;
    if (document.hidden) {
      verificationFrame = window.requestAnimationFrame(verifyFrame);
      return;
    }
    if (gl.isContextLost()) {
      fallback("webgl-context-lost");
      return;
    }
    if (canvas.width < 2 || canvas.height < 2) {
      verificationFrame = window.requestAnimationFrame(verifyFrame);
      return;
    }

    attempts += 1;

    // iOS Safari can return an empty default framebuffer from readPixels even
    // while the WebGL canvas is visibly rendering. That produced a false
    // "blank frame" result and switched Ruthie to the old particle sphere.
    // On Apple touch browsers, verify context health for a few rendered frames
    // instead of relying on default-framebuffer readback.
    if (mobileSafari) {
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        fallback(`webgl-runtime-error-${error}`);
        return;
      }
      canvas.dataset.renderAttempts = String(attempts);
      if (attempts >= 8) {
        markReady(-1);
        return;
      }
      verificationFrame = window.requestAnimationFrame(verifyFrame);
      return;
    }

    let pixelHits = 0;
    try {
      gl.flush();
      pixelHits = countVisiblePixels(gl, canvas);
    } catch {
      fallback("webgl-frame-read-failed");
      return;
    }

    canvas.dataset.renderPixelHits = String(pixelHits);
    canvas.dataset.renderAttempts = String(attempts);

    if (pixelHits >= 8) {
      markReady(pixelHits);
      return;
    }

    if (attempts >= 90) {
      fallback("webgl-blank-frame");
      return;
    }

    verificationFrame = window.requestAnimationFrame(verifyFrame);
  };

  canvas.addEventListener("webglcontextlost", onContextLost, false);
  verificationFrame = window.requestAnimationFrame(verifyFrame);

  return () => {
    disposed = true;
    window.cancelAnimationFrame(verificationFrame);
    canvas.removeEventListener("webglcontextlost", onContextLost, false);
    stopSilk();
  };
}
