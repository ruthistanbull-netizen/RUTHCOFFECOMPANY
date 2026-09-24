export {};

declare global {
  interface HTMLAudioElement {
    /** iOS Safari inline media compatibility flag used by ROSTA Insight Realtime audio. */
    playsInline: boolean;
  }
}
