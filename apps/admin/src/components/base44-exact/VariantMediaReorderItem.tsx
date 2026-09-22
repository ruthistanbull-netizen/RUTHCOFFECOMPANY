"use client";

import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, X } from "lucide-react";
import { reorderIndexForKey } from "@ruth-commerce/ui";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

export function VariantMediaReorderItem({
  photo,
  index,
  length,
  isMain,
  onMakeMain,
  onRemove,
  onKeyboardMove,
}: {
  photo: string;
  index: number;
  length: number;
  isMain: boolean;
  onMakeMain: () => void;
  onRemove: () => void;
  onKeyboardMove: (fromIndex: number, toIndex: number) => void;
}) {
  const dragControls = useDragControls();

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragControls.start(event);
  };

  const handleKeyboardReorder = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const nextIndex = reorderIndexForKey({
      key: event.key,
      index,
      length,
      axis: "y",
    });
    if (nextIndex == null) return;
    event.preventDefault();
    onKeyboardMove(index, nextIndex);
  };

  return (
    <Reorder.Item
      value={photo}
      dragListener={false}
      dragControls={dragControls}
      whileDrag={{ scale: 1.06, zIndex: 20, boxShadow: "0 16px 40px rgba(0,0,0,.24)" }}
      className="group relative overflow-hidden rounded-[14px] bg-surface-secondary ring-1 ring-border-subtle"
      style={{ touchAction: "pan-y" }}
    >
      <button
        type="button"
        onClick={onMakeMain}
        className="block aspect-[3/4] w-full"
        aria-label={`${index + 1}. görseli ana varyant görseli yap`}
      >
        <img src={photo} alt="" className="h-full w-full object-cover" draggable={false} />
      </button>

      <button
        type="button"
        data-variant-media-drag-handle
        aria-label={`${index + 1}. görseli sırala. Yukarı ve aşağı oklarla da taşıyabilirsin.`}
        onPointerDown={startDrag}
        onKeyDown={handleKeyboardReorder}
        className="absolute left-1.5 top-1.5 flex h-8 w-8 cursor-grab items-center justify-center rounded-[10px] bg-black/55 text-white shadow-sm active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ touchAction: "none" }}
      >
        <GripVertical className="h-4 w-4 pointer-events-none" aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label="Görseli çıkar"
        onClick={onRemove}
        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-[10px] bg-black/55 text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>

      {isMain ? (
        <span className="ruth-type-label pointer-events-none absolute inset-x-1.5 bottom-1.5 rounded-full bg-accent px-1.5 py-1 text-center text-white">
          Ana
        </span>
      ) : null}
    </Reorder.Item>
  );
}
