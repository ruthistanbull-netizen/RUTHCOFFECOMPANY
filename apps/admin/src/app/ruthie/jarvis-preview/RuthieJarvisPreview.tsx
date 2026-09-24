"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RuthieVoiceOrb,
  type RuthieVoiceVisualPhase,
} from "../RuthieVoiceOrb";
import styles from "./RuthieJarvisPreview.module.css";

const PHASES: Array<{
  id: RuthieVoiceVisualPhase;
  label: string;
  description: string;
}> = [
  { id: "connecting", label: "Hazır", description: "Düşük enerjili neural çekirdek" },
  { id: "listening", label: "Dinliyor", description: "Mikrofon girişine tepki verir" },
  { id: "thinking", label: "Düşünüyor", description: "Bağlantılar ve veri akışı yoğunlaşır" },
  { id: "acting", label: "İşlem yapıyor", description: "Orbitler ve görev akışı açılır" },
  { id: "speaking", label: "Konuşuyor", description: "Çıkış sesine göre çekirdek hareket eder" },
  { id: "error", label: "Hata", description: "Kontrollü kırmızı hata davranışı" },
];

export function RuthieJarvisPreview() {
  const [phase, setPhase] = useState<RuthieVoiceVisualPhase>("connecting");
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [microphoneError, setMicrophoneError] = useState("");
  const [autoDemo, setAutoDemo] = useState(false);
  const phaseIndex = PHASES.findIndex((item) => item.id === phase);
  const streamRef = useRef<MediaStream | null>(null);

  const stopMicrophone = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setMicrophoneStream(null);
  }, []);

  useEffect(() => stopMicrophone, [stopMicrophone]);

  useEffect(() => {
    if (!autoDemo) return;
    const timer = window.setInterval(() => {
      setPhase((current) => {
        const currentIndex = PHASES.findIndex((item) => item.id === current);
        return PHASES[(currentIndex + 1) % PHASES.length].id;
      });
    }, 3_200);
    return () => window.clearInterval(timer);
  }, [autoDemo]);

  const toggleMicrophone = async () => {
    if (streamRef.current) {
      stopMicrophone();
      setPhase("connecting");
      return;
    }

    setMicrophoneError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      setMicrophoneStream(stream);
      setAutoDemo(false);
      setPhase("listening");
    } catch {
      setMicrophoneError("Mikrofon izni verilmedi. Durum animasyonlarını yine de deneyebilirsin.");
    }
  };

  const active = PHASES[Math.max(0, phaseIndex)];

  return (
    <main
      className={styles.page}
      data-ruthie-jarvis-preview
      data-phase={phase}
      style={{ zIndex: 2_147_483_647 }}
    >
      <div className={styles.grid} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.brand} style={{ paddingLeft: 58 }}>
          <div>
            <strong>RUTHIE</strong>
            <small>NEURAL ASSISTANT CORE</small>
          </div>
        </div>
        <div className={styles.online}><i /> PANEL ÖNİZLEME</div>
      </header>

      <section className={styles.stage}>
        <div className={styles.orbShell} data-phase={phase}>
          <RuthieVoiceOrb
            phase={phase}
            inputStream={microphoneStream}
            outputStream={phase === "speaking" ? microphoneStream : null}
            muted={false}
          />
        </div>

        <div className={styles.statusCopy}>
          <small>{active.label}</small>
          <h1>{active.description}</h1>
          <p>Gerçek panel bileşeni · Canvas tabanlı özgün renderer · Harici Jarvis kodu kullanılmadı</p>
        </div>
      </section>

      <aside className={styles.panel} aria-label="Ruthie animasyon durumları">
        <div className={styles.panelHeading}>
          <div>
            <small>ANİMASYON DURUMLARI</small>
            <h2>Ruthie’yi test et</h2>
          </div>
          <button
            type="button"
            className={autoDemo ? styles.activeToggle : ""}
            onClick={() => setAutoDemo((value) => !value)}
          >
            {autoDemo ? "Demoyu durdur" : "Otomatik demo"}
          </button>
        </div>

        <div className={styles.phaseList}>
          {PHASES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={phase === item.id ? styles.activePhase : ""}
              data-phase-button={item.id}
              onClick={() => {
                setAutoDemo(false);
                setPhase(item.id);
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><strong>{item.label}</strong><small>{item.description}</small></div>
              <i />
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`${styles.microphone} ${microphoneStream ? styles.microphoneActive : ""}`}
          onClick={() => void toggleMicrophone()}
        >
          <span className={styles.micIcon} aria-hidden="true" />
          <div>
            <strong>{microphoneStream ? "Mikrofon aktif" : "Mikrofonla dene"}</strong>
            <small>{microphoneStream ? "Sesin neural çekirdeğe aktarılıyor" : "Tarayıcı ses izni isteyecek"}</small>
          </div>
        </button>
        {microphoneError ? <p className={styles.error}>{microphoneError}</p> : null}
      </aside>
    </main>
  );
}
