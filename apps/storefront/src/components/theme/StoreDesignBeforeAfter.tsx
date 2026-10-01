"use client";
import { StoreDesignEditableMedia } from "@/components/theme/StoreDesignEditableMedia";

import { useState } from "react";

type Props = {
  editorId: string;
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  initialPosition?: number;
};

function clamp(value: number) {
  return Math.min(90, Math.max(10, Number.isFinite(value) ? value : 50));
}

export function StoreDesignBeforeAfter({
  editorId,
  beforeUrl,
  afterUrl,
  beforeLabel = "Önce",
  afterLabel = "Sonra",
  initialPosition = 50,
}: Props) {
  const [position, setPosition] = useState(() => clamp(initialPosition));

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-black/[0.04]">
      <StoreDesignEditableMedia editorId={`${editorId}.before`}  src={beforeUrl}  alt={beforeLabel} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-y-0 right-0 overflow-hidden" style={{ width: `${100 - position}%` }}>
        <StoreDesignEditableMedia editorId={`${editorId}.after`}  src={afterUrl}  alt={afterLabel} className="absolute inset-y-0 right-0 h-full max-w-none object-cover" style={{ width: `${10000 / Math.max(1, 100 - position)}%` }} />
      </div>

      <div className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,.12)]" style={{ left: `${position}%` }}>
        <span className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-black/10 bg-white text-[11px] text-black shadow-md">↔</span>
      </div>

      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-white">{beforeLabel}</span>
      <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-white">{afterLabel}</span>

      <input
        aria-label="Önce sonra karşılaştırma"
        type="range"
        min={10}
        max={90}
        value={position}
        onChange={(event) => setPosition(clamp(Number(event.target.value)))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
