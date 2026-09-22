"use client";

import type { ImgHTMLAttributes, SyntheticEvent } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string;
};

export default function FallbackImage({ fallbackSrc = "/panel-r-logo.png", onError, ...props }: Props) {
  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.src = fallbackSrc;
    onError?.(event);
  };

  return <img {...props} onError={handleError} />;
}
