"use client";

import { useSyncExternalStore, type CSSProperties, type HTMLAttributes } from "react";
import { useSemanticMedia } from "./SemanticThemeRuntimeProvider";

type Props = Omit<HTMLAttributes<HTMLElement>, "onLoad"> & {
  editorId: string;
  editorLabel?: string;
  aliases?: readonly string[];
  src: string;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  preload?: string;
  mobileSrc?: string;
  type?: "image" | "video";
  alt?: string;
  className?: string;
  style?: CSSProperties;
  poster?: string;
  themeId?: string;
  priority?: boolean;
  onReady?: () => void;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
};

const subscribeMobile = (notify: () => void) => {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const getMobile = () => window.matchMedia("(max-width: 767px)").matches;

export function StoreDesignEditableMedia({ editorId, editorLabel = "Medya", aliases = [], src, mobileSrc, type, alt = "", className, style, poster, themeId, priority = false, onReady, controls = false, autoPlay = true, loop = true, muted = true, ...rest }: Props) {
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, () => false);
  const source = mobile && mobileSrc ? mobileSrc : src;
  const media = useSemanticMedia(editorId, source, aliases, type ? type === "video" : undefined);
  const attributes = {
    ...rest,
    "data-editor-id": editorId,
    "data-editor-type": media.video ? "video" : "image",
    "data-editor-label": editorLabel,
    "data-editor-aliases": aliases.join(" "),
    "data-editor-media-owned": "true",
    "data-theme-id": themeId,
    "data-theme-label": themeId ? editorLabel : undefined,
    className,
    style,
  };
  return media.video
    ? <video {...attributes} key={media.src} src={media.src} poster={poster} aria-label={alt || editorLabel} autoPlay={autoPlay} muted={muted} loop={loop} playsInline controls={controls} preload="metadata" onLoadedData={onReady} />
    : <img {...attributes} src={media.src} alt={alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" draggable={false} onLoad={onReady} />;
}
