"use client";

import {
  AlertCircle,
  Camera,
  CameraOff,
  Languages,
  LoaderCircle,
  RefreshCcw,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./RuthieCameraVision.module.css";

const LANGUAGE_OPTIONS = [
  "İngilizce",
  "Arnavutça",
  "İtalyanca",
  "Almanca",
  "Fransızca",
  "İspanyolca",
  "Arapça",
  "Rusça",
  "Sırpça",
];

const LIVE_FRAME_INTERVAL_MS = 850;
const LIVE_FRAME_STALE_MS = 2_400;
const LIVE_FRAME_CHANGE_THRESHOLD = 2.5;

type FrameOptions = {
  imageDataUrl: string;
  prompt?: string;
  detail?: "low" | "high" | "auto";
  requestResponse?: boolean;
};

type RuthieCameraVisionProps = {
  connected: boolean;
  translationEnabled: boolean;
  translationLanguage: string;
  onClose: () => void;
  onFrame: (options: FrameOptions) => boolean;
  onTranslation: (enabled: boolean, targetLanguage?: string) => boolean;
};

type FacingMode = "environment" | "user";

function frameSignature(context: CanvasRenderingContext2D, width: number, height: number) {
  const sampleWidth = 16;
  const sampleHeight = 10;
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return [];
  sampleContext.drawImage(context.canvas, 0, 0, width, height, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const values: number[] = [];
  for (let index = 0; index < pixels.length; index += 4) {
    values.push(Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114));
  }
  return values;
}

function signatureDifference(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference += Math.abs(left[index] - right[index]);
  return difference / left.length;
}

export function RuthieCameraVision({
  connected,
  translationEnabled,
  translationLanguage,
  onClose,
  onFrame,
  onTranslation,
}: RuthieCameraVisionProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [sendingFrame, setSendingFrame] = useState(false);
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const [targetLanguage, setTargetLanguage] = useState(translationLanguage || "İngilizce");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSignatureRef = useRef<number[]>([]);
  const lastAutoFrameAtRef = useRef(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async (mode: FacingMode) => {
    stopCamera();
    setCameraError(null);
    setCameraReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Bu tarayıcı kamera erişimini desteklemiyor.");
      return;
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
        },
      });
      streamRef.current = nextStream;
      setStream(nextStream);
      const video = videoRef.current;
      if (video) {
        video.srcObject = nextStream;
        await video.play();
      }
      lastSignatureRef.current = [];
      lastAutoFrameAtRef.current = 0;
      setCameraReady(true);
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === "NotAllowedError"
        ? "Kamerayı kullanabilmem için tarayıcıdan kamera izni vermelisin."
        : "Kamera açılamadı. İzni ve başka uygulamanın kamerayı kullanmadığını kontrol et.";
      setCameraError(message);
    }
  }, [stopCamera]);

  useEffect(() => {
    void startCamera(facingMode);
    return stopCamera;
  }, [facingMode, startCamera, stopCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play().catch(() => undefined);
    }
  }, [stream]);

  const captureFrame = useCallback((highDetail = false) => {
    const video = videoRef.current;
    if (!video || !cameraReady || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return null;
    const maxDimension = highDetail ? 1280 : 512;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) return null;
    if (facingMode === "user") {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", highDetail ? 0.78 : 0.46),
      signature: frameSignature(context, width, height),
    };
  }, [cameraReady, facingMode]);

  const sendManualFrame = useCallback((mode: "inspect" | "translate") => {
    if (!connected || sendingFrame) return;
    const frame = captureFrame(true);
    if (!frame) {
      setCameraError("Kamera görüntüsü henüz hazır değil.");
      return;
    }
    setSendingFrame(true);
    const prompt = mode === "translate"
      ? `Bu en güncel yüksek çözünürlüklü kamera karesidir. Görünen yazıları Türkçe ile ${targetLanguage} arasında çevir ve yalnız kısa çeviriyi söyle.`
      : "Bu en güncel yüksek çözünürlüklü kamera karesidir. Kullanıcının son sorusunu bu görüntüyle cevapla; yalnız görünen ve gerekli ayrıntıyı söyle.";
    const sent = onFrame({ imageDataUrl: frame.dataUrl, prompt, detail: "high", requestResponse: true });
    if (!sent) setCameraError("ROSTA Insight görüntüyü almaya hazır değil.");
    else {
      lastSignatureRef.current = frame.signature;
      lastAutoFrameAtRef.current = Date.now();
      setLastFrameAt(Date.now());
      setCameraError(null);
    }
    window.setTimeout(() => setSendingFrame(false), 550);
  }, [captureFrame, connected, onFrame, sendingFrame, targetLanguage]);

  useEffect(() => {
    if (!connected || !cameraReady) return;
    const sendLiveFrame = () => {
      if (document.visibilityState !== "visible") return;
      const frame = captureFrame(false);
      if (!frame) return;
      const now = Date.now();
      const changed = signatureDifference(lastSignatureRef.current, frame.signature) >= LIVE_FRAME_CHANGE_THRESHOLD;
      const stale = now - lastAutoFrameAtRef.current >= LIVE_FRAME_STALE_MS;
      if (!changed && !stale) return;
      const prompt = translationEnabled
        ? `Canlı kameranın en güncel karesi. Şimdi yanıt verme. Kullanıcı görseldeki metni sorarsa Türkçe ↔ ${targetLanguage} çeviri bağlamı olarak kullan.`
        : "Canlı kameranın en güncel karesi. Şimdi yanıt verme. Kullanıcı gösterdiği şeyi sorarsa bu kareyi kullan.";
      if (onFrame({ imageDataUrl: frame.dataUrl, prompt, detail: "low", requestResponse: false })) {
        lastSignatureRef.current = frame.signature;
        lastAutoFrameAtRef.current = now;
        setLastFrameAt(now);
      }
    };
    const first = window.setTimeout(sendLiveFrame, 250);
    const interval = window.setInterval(sendLiveFrame, LIVE_FRAME_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [cameraReady, captureFrame, connected, onFrame, targetLanguage, translationEnabled]);

  const toggleTranslation = () => {
    const next = !translationEnabled;
    const sent = onTranslation(next, targetLanguage);
    if (!sent && connected) setCameraError("Çeviri modu ROSTA Insight bağlantısına gönderilemedi.");
  };

  const switchCamera = () => setFacingMode((current) => current === "environment" ? "user" : "environment");

  return (
    <section className={styles.cameraSurface} aria-label="ROSTA Insight canlı kamera">
      <video
        ref={videoRef}
        className={`${styles.preview} ${facingMode === "user" ? styles.mirrored : ""}`}
        autoPlay
        muted
        playsInline
        aria-label={facingMode === "environment" ? "Arka kamera görüntüsü" : "Ön kamera görüntüsü"}
      />
      <div className={styles.cameraShade} />
      <div className={styles.scanGlow} aria-hidden="true"><span /><span /><span /></div>

      <div className={styles.topStatus}>
        <span className={connected && cameraReady ? styles.liveDot : styles.waitingDot} />
        <div>
          <strong>{cameraReady ? "Canlı görüş açık" : "Kamera hazırlanıyor"}</strong>
          <small>{lastFrameAt ? "En güncel kare ROSTA Insight’ta" : "Canlı görüntü başlatılıyor"}</small>
        </div>
      </div>

      <div className={styles.focusReticle} aria-hidden="true"><span /><span /><span /><span /></div>

      {cameraError ? (
        <div className={styles.cameraError} role="alert">
          <AlertCircle aria-hidden="true" />
          <span>{cameraError}</span>
          <button type="button" onClick={() => void startCamera(facingMode)}>Tekrar dene</button>
        </div>
      ) : null}

      {!cameraReady && !cameraError ? <div className={styles.loading}><LoaderCircle aria-hidden="true" /><span>Kamera açılıyor</span></div> : null}

      <div className={styles.translationBar}>
        <button
          type="button"
          className={translationEnabled ? styles.translationActive : ""}
          onClick={toggleTranslation}
          disabled={!connected}
          aria-pressed={translationEnabled}
        >
          <Languages aria-hidden="true" />
          <span>{translationEnabled ? "Çeviri açık" : "Canlı çeviri"}</span>
        </button>
        <label>
          <span>Hedef dil</span>
          <select
            value={targetLanguage}
            onChange={(event) => {
              const language = event.target.value;
              setTargetLanguage(language);
              if (translationEnabled) onTranslation(true, language);
            }}
            aria-label="Canlı çeviri hedef dili"
          >
            {LANGUAGE_OPTIONS.map((language) => <option key={language} value={language}>{language}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.cameraControls}>
        <button type="button" onClick={switchCamera} disabled={!cameraReady}>
          <RefreshCcw aria-hidden="true" />
          <span>Kamerayı çevir</span>
        </button>
        <button type="button" className={styles.primaryAction} onClick={() => sendManualFrame("inspect")} disabled={!connected || !cameraReady || sendingFrame}>
          {sendingFrame ? <LoaderCircle aria-hidden="true" /> : <ScanLine aria-hidden="true" />}
          <span>Şimdi incele</span>
        </button>
        <button type="button" onClick={() => sendManualFrame("translate")} disabled={!connected || !cameraReady || sendingFrame}>
          <Languages aria-hidden="true" />
          <span>Metni çevir</span>
        </button>
        <button type="button" onClick={onClose}>
          <CameraOff aria-hidden="true" />
          <span>Kamerayı kapat</span>
        </button>
      </div>

      <div className={styles.privacyNote}>
        <ShieldCheck aria-hidden="true" />
        <span>Kamera yalnız bu görüşmede açık. Kareler panel veritabanına kaydedilmez.</span>
      </div>

      <div className={styles.cameraBadge} aria-hidden="true"><Camera /></div>
    </section>
  );
}
