export {};

declare global {
  interface RTCDataChannel {
    send(data: string | Blob | ArrayBuffer | ArrayBufferView<ArrayBufferLike>): void;
  }
}
