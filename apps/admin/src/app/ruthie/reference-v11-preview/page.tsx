import type { Metadata } from "next";
import { RuthieVoiceOrbReference3D } from "../RuthieVoiceOrbReference3D";

export const metadata: Metadata = {
  title: "ROSTA Insight Reference v11 Preview",
  robots: { index: false, follow: false },
};

export default function RuthieReferenceV11PreviewPage() {
  return (
    <main
      data-ruthie-reference-v11-preview
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(ellipse 48% 48% at 50% 47%, color-mix(in srgb, var(--rosta-espresso, #38251C) 8%, transparent), transparent 72%), linear-gradient(180deg, var(--rosta-carbon, #111111), var(--rosta-carbon-soft, #242424) 58%, var(--rosta-carbon, #111111))",
      }}
    >
      <section
        data-ruthie-orb-shell
        style={{
          position: "relative",
          width: "min(82vh, 900px, 88vw)",
          height: "min(82vh, 900px, 88vw)",
          minWidth: 280,
          minHeight: 280,
        }}
      >
        <RuthieVoiceOrbReference3D
          phase="listening"
          muted
          compact={false}
          showWaveform={false}
        />
      </section>
      <div
        style={{
          position: "fixed",
          left: 20,
          bottom: 16,
          color: "color-mix(in srgb, var(--rosta-kraft, #C8A77D) 64%, transparent)",
          fontSize: 10,
          letterSpacing: ".12em",
          textTransform: "uppercase",
        }}
      >
        ROSTA Insight v11 · Reference QA
      </div>
    </main>
  );
}
