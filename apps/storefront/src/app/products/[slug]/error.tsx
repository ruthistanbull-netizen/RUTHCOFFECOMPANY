"use client";

import { useEffect } from "react";

export default function ProductPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Ürün sayfası yüklenemedi:", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-ivory px-6 py-28 text-center text-ink">
      <div className="max-w-md">
        <p className="text-[9px] uppercase tracking-[0.2em] text-gold-dark">
          Geçici bağlantı sorunu
        </p>
        <h1 className="mt-4 font-heading text-3xl font-normal">
          Ürün şu anda görüntülenemiyor
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted-ruth">
          Sayfa kilitli kalmak yerine güvenli biçimde durduruldu. Bağlantıyı yeniden
          deneyebilirsin.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-7 min-h-12 border border-ink bg-ink px-7 text-[10px] uppercase tracking-[0.18em] text-cream"
        >
          Tekrar Dene
        </button>
      </div>
    </main>
  );
}
