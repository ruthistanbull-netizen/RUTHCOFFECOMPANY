export {};

declare global {
  /**
   * TypeScript 5.9 models typed arrays with an ArrayBufferLike generic while
   * the DOM analyser overloads are still narrowed to ArrayBuffer. Browsers
   * accept the Uint8Array produced for Ruthie's analyser buffers, so keep the
   * compatibility overloads explicit until the DOM typings converge.
   */
  interface AnalyserNode {
    getByteFrequencyData(dataArray: Uint8Array<ArrayBufferLike>): void;
    getByteTimeDomainData(dataArray: Uint8Array<ArrayBufferLike>): void;
  }
}
