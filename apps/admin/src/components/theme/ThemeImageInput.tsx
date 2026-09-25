"use client";

import { ImagePlus } from "lucide-react";

const ACCEPTED_THEME_IMAGES = "image/*,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif";
const ACCEPTED_THEME_VIDEOS = "video/*,.mp4,.m4v,.mov,.webm";

export function ThemeImageInput({
  busy,
  hasValue,
  onFile,
  compact = false,
  media = "image",
}: {
  busy: boolean;
  hasValue?: boolean;
  onFile: (file: File) => void;
  compact?: boolean;
  media?: "image" | "video" | "any";
}) {
  const accept = media === "video"
    ? ACCEPTED_THEME_VIDEOS
    : media === "any"
      ? `${ACCEPTED_THEME_IMAGES},${ACCEPTED_THEME_VIDEOS}`
      : ACCEPTED_THEME_IMAGES;
  const emptyLabel = media === "video" ? "Video seç" : media === "any" ? "Fotoğraf / video seç" : "Görsel seç";
  return (
    <label
      className={compact
        ? "relative flex h-9 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg border border-border-subtle bg-surface-secondary text-[9px] font-medium text-main"
        : "relative mt-2 flex h-9 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-surface-primary text-[9px] font-medium focus-within:border-accent"}
    >
      {compact ? <ImagePlus className="h-3.5 w-3.5" /> : null}
      {busy ? "Yükleniyor…" : hasValue ? "Değiştir" : emptyLabel}
      <input
        type="file"
        accept={accept}
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
