"use client";

import { Crop, GripVertical, Trash2 } from "lucide-react";
import { reorderIndexForKey, reorderItem } from "@ruth-commerce/ui";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import styles from "./SortableProductMedia.module.css";

type PointerDrag = {
  pointerId: number;
  index: number;
  image: string;
  grabOffsetX: number;
  grabOffsetY: number;
  width: number;
  height: number;
  active: boolean;
};

type DragPreview = {
  image: string;
  width: number;
  height: number;
};

type DragPoint = { x: number; y: number };

function isVideoUrl(value: string) {
  const clean = String(value || "").split("?")[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(clean) || clean.includes("/videos/");
}

function normalizeMedia(images: string[]) {
  const unique = [...new Set(images.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!unique.length || !isVideoUrl(unique[0])) return unique;
  const firstImageIndex = unique.findIndex((value) => !isVideoUrl(value));
  if (firstImageIndex <= 0) return unique;
  const [firstImage] = unique.splice(firstImageIndex, 1);
  return [firstImage, ...unique];
}

function findVerticalScrollParent(element: HTMLElement | null) {
  let current = element?.parentElement || null;
  while (current) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

function previewTransform(point: DragPoint, lifted: boolean) {
  return `translate3d(${point.x}px, ${point.y}px, 0)${lifted ? " scale(1.06) rotate(-1.1deg)" : " scale(1) rotate(0deg)"}`;
}

function MediaPreview({ src }: { src: string }) {
  if (isVideoUrl(src)) {
    return (
      <video
        src={src}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        draggable={false}
      />
    );
  }
  return <img src={src} alt="" draggable={false} loading="lazy" decoding="async" />;
}

export function SortableProductMediaGrid({
  images,
  onChange,
  onRemove,
  onEdit,
  mainLabel = "ANA",
}: {
  images: string[];
  onChange: (images: string[]) => void;
  onRemove?: (index: number) => void;
  onEdit?: (index: number) => void;
  mainLabel?: string;
}) {
  const dragRef = useRef<PointerDrag | null>(null);
  const orderRef = useRef<string[]>(normalizeMedia(images));
  const dropIndexRef = useRef(0);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const previewPointRef = useRef<DragPoint>({ x: 0, y: 0 });
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const suppressClickUntilRef = useRef(0);
  const settlingRef = useRef(false);
  const [visualImages, setVisualImages] = useState<string[]>(() => normalizeMedia(images));
  const [draggingImage, setDraggingImage] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  useEffect(() => {
    const next = normalizeMedia(images);
    if (dragRef.current?.active || settlingRef.current) return;
    orderRef.current = next;
    setVisualImages(next);
  }, [images]);

  useEffect(() => () => {
    if (previewFrameRef.current != null) window.cancelAnimationFrame(previewFrameRef.current);
  }, []);

  const clearDrag = () => {
    if (previewFrameRef.current != null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    dragRef.current = null;
    scrollParentRef.current = null;
    settlingRef.current = false;
    setDraggingImage(null);
    setDragPreview(null);
  };

  const schedulePreviewPosition = (point: DragPoint) => {
    previewPointRef.current = point;
    if (previewFrameRef.current != null) return;
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null;
      if (previewRef.current) {
        previewRef.current.style.transform = previewTransform(previewPointRef.current, true);
      }
    });
  };

  const pointInsideSurface = (clientX: number, clientY: number, drag: PointerDrag): DragPoint => {
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    return {
      x: clientX - (surfaceRect?.left || 0) - drag.grabOffsetX,
      y: clientY - (surfaceRect?.top || 0) - drag.grabOffsetY,
    };
  };

  const autoScroll = (clientY: number) => {
    const scrollParent = scrollParentRef.current;
    if (!scrollParent) return;
    const rect = scrollParent === document.documentElement
      ? { top: 0, bottom: window.innerHeight, height: window.innerHeight }
      : scrollParent.getBoundingClientRect();
    const edge = Math.min(82, Math.max(52, rect.height * 0.12));
    let delta = 0;
    if (clientY < rect.top + edge) {
      delta = -Math.min(22, Math.max(5, (rect.top + edge - clientY) * 0.34));
    } else if (clientY > rect.bottom - edge) {
      delta = Math.min(22, Math.max(5, (clientY - (rect.bottom - edge)) * 0.34));
    }
    if (delta) scrollParent.scrollTop += delta;
  };

  const resolveDropIndex = (drag: PointerDrag, clientX: number, clientY: number) => {
    let insideIndex: number | null = null;
    let nearestIndex = drag.index;
    let nearestDistance = Number.POSITIVE_INFINITY;

    visualImages.forEach((image, index) => {
      if (image === drag.image) return;
      const card = cardRefs.current.get(image);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(clientX - centerX, clientY - centerY);
      if (inside) {
        insideIndex = index;
        return;
      }
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return insideIndex ?? nearestIndex;
  };

  const onHandlePointerDown = (
    index: number,
    image: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0 || settlingRef.current) return;
    const card = cardRefs.current.get(image);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const currentOrder = [...visualImages];
    orderRef.current = currentOrder;
    dropIndexRef.current = index;
    scrollParentRef.current = findVerticalScrollParent(surfaceRef.current);
    dragRef.current = {
      pointerId: event.pointerId,
      index,
      image,
      grabOffsetX: event.clientX - rect.left,
      grabOffsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || settlingRef.current) return;

    const initialX = drag.grabOffsetX + (surfaceRef.current?.getBoundingClientRect().left || 0);
    const initialY = drag.grabOffsetY + (surfaceRef.current?.getBoundingClientRect().top || 0);
    const moved = Math.hypot(event.clientX - initialX, event.clientY - initialY);
    if (!drag.active) {
      if (moved < 5) return;
      drag.active = true;
      suppressClickUntilRef.current = Date.now() + 360;
      setDraggingImage(drag.image);
      previewPointRef.current = pointInsideSurface(event.clientX, event.clientY, drag);
      setDragPreview({ image: drag.image, width: drag.width, height: drag.height });
    }

    event.preventDefault();
    const point = pointInsideSurface(event.clientX, event.clientY, drag);
    schedulePreviewPosition(point);
    autoScroll(event.clientY);

    // During the drag the grid stays completely stable. We only remember
    // the closest destination; the real order changes once the pointer is released.
    dropIndexRef.current = resolveDropIndex(drag, event.clientX, event.clientY);
  };

  const finishDrag = (element?: HTMLElement | null) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (element?.hasPointerCapture(drag.pointerId)) element.releasePointerCapture(drag.pointerId);

    if (!drag.active) {
      clearDrag();
      return;
    }

    const targetIndex = Math.max(0, Math.min(dropIndexRef.current, orderRef.current.length - 1));
    const finalOrder = normalizeMedia(reorderItem(orderRef.current, drag.index, targetIndex));
    const finalIndex = finalOrder.indexOf(drag.image);
    orderRef.current = finalOrder;
    setVisualImages(finalOrder);
    onChange(finalOrder);
    suppressClickUntilRef.current = Date.now() + 420;
    settlingRef.current = true;
    dragRef.current = null;

    const preview = previewRef.current;
    if (!preview) {
      clearDrag();
      return;
    }

    const target = cardRefs.current.get(drag.image);
    if (!target) {
      clearDrag();
      return;
    }

    const measureAndAnimate = () => {
      const destination = target.getBoundingClientRect();
      const surface = surfaceRef.current?.getBoundingClientRect();
      const destinationPoint = {
        x: destination.left - (surface?.left || 0),
        y: destination.top - (surface?.top || 0),
      };
      const current = previewPointRef.current;
      const animation = preview.animate(
        [
          { transform: previewTransform(current, true), opacity: 1 },
          { transform: previewTransform(destinationPoint, false), opacity: 1 },
        ],
        {
          duration: finalIndex === drag.index ? 170 : 240,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      void animation.finished.catch(() => undefined).then(clearDrag);
    };

    window.requestAnimationFrame(() => window.requestAnimationFrame(measureAndAnimate));
  };

  const reorderFromKeyboard = (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const key = event.key;
    const axis = key === "ArrowUp" || key === "ArrowDown" ? "y" : "x";
    const nextIndex = reorderIndexForKey({ key, index, length: visualImages.length, axis });
    if (nextIndex == null) return;
    event.preventDefault();
    const next = normalizeMedia(reorderItem(visualImages, index, nextIndex));
    orderRef.current = next;
    setVisualImages(next);
    onChange(next);
  };

  const editOnTap = (index: number) => {
    const media = visualImages[index];
    if (!onEdit || !media || isVideoUrl(media) || Date.now() < suppressClickUntilRef.current || settlingRef.current) return;
    onEdit(index);
  };

  return (
    <div ref={surfaceRef} style={{ position: "relative", minWidth: 0, isolation: "isolate" }}>
      <div className={styles.grid} data-sortable-axis="grid">
        {visualImages.map((image, index) => {
          const isDragging = draggingImage === image;
          const video = isVideoUrl(image);
          return (
            <article
              ref={(node) => {
                if (node) cardRefs.current.set(image, node);
                else cardRefs.current.delete(image);
              }}
              key={image}
              className={styles.card}
              data-sortable-media-grid-index={index}
              data-sortable-media-grid-image={image}
              data-ruth-dragging={isDragging ? "true" : "false"}
              aria-grabbed={isDragging}
              style={{
                zIndex: isDragging ? 1 : undefined,
                transition: "box-shadow 180ms ease, opacity 180ms ease",
                visibility: isDragging ? "hidden" : "visible",
              }}
            >
              <div className={styles.media} onClick={() => editOnTap(index)}>
                <MediaPreview src={image} />
                {index === 0 && !video ? <strong>{mainLabel}</strong> : null}
                {video ? <strong>VİDEO</strong> : null}
                <button
                  type="button"
                  className={styles.handle}
                  data-sortable-media-handle
                  aria-label={`${index + 1}. medyayı sırala. Ok tuşlarıyla da taşıyabilirsin.`}
                  onPointerDown={(event) => onHandlePointerDown(index, image, event)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={(event) => finishDrag(event.currentTarget)}
                  onPointerCancel={(event) => finishDrag(event.currentTarget)}
                  onKeyDown={(event) => reorderFromKeyboard(index, event)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <GripVertical aria-hidden="true" />
                </button>
              </div>
              {onEdit && !video ? (
                <button className={styles.edit} type="button" onClick={() => onEdit(index)} aria-label={`${index + 1}. görseli düzenle`}>
                  <Crop />
                </button>
              ) : null}
              {onRemove ? (
                <button
                  className={styles.remove}
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label={`${index + 1}. medyayı kaldır`}
                  style={{
                    backgroundColor: "#ffffff",
                    opacity: 1,
                    transform: "none",
                    WebkitBackdropFilter: "none",
                    backdropFilter: "none",
                  }}
                >
                  <Trash2 />
                </button>
              ) : null}
            </article>
          );
        })}
      </div>

      {dragPreview ? (
        <div
          ref={previewRef}
          className={`${styles.card} ${styles.dragging}`}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            zIndex: 20,
            width: dragPreview.width,
            height: dragPreview.height,
            pointerEvents: "none",
            userSelect: "none",
            transformOrigin: "center",
            willChange: "transform",
            contain: "layout paint style",
            opacity: 1,
            filter: "none",
            transform: previewTransform(previewPointRef.current, true),
          }}
          aria-hidden="true"
        >
          <div className={styles.media}>
            <MediaPreview src={dragPreview.image} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
