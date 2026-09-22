"use client";

import { ImagePlus } from "lucide-react";

const ACCEPTED_THEME_IMAGES = "image/*,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif";

export function ThemeImageInput({
  busy,
  hasValue,
  onFile,
  compact = false,
}: {
  busy: boolean;
  hasValue?: boolean;
  onFile: (file: File) => void;
  compact?: boolean;
}) {
  return (
    <label
      className={compact
        ? "relative flex h-9 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg border border-black/10 bg-[#fafafa] text-[9px] font-medium"
        : "relative mt-2 flex h-9 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-black/10 bg-white text-[9px] font-medium hover:border-[#b28c43]/40"}
    >
      {compact ? <ImagePlus className="h-3.5 w-3.5" /> : null}
      {busy ? "Yükleniyor…" : hasValue ? "Değiştir" : "Görsel seç"}
      <input
        type="file"
        accept={ACCEPTED_THEME_IMAGES}
        disabled={busy}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}
