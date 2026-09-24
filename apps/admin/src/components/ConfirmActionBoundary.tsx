"use client";

import { type MouseEvent, type ReactNode } from "react";

type ConfirmableElement = HTMLElement & {
  dataset: DOMStringMap & { confirmMessage?: string };
};

export function ConfirmActionBoundary({ children }: { children: ReactNode }) {
  const confirmAction = (event: MouseEvent<HTMLDivElement>) => {
    const source = event.target instanceof Element
      ? event.target.closest<ConfirmableElement>("[data-confirm-message]")
      : null;
    const message = source?.dataset.confirmMessage?.trim();

    if (!source || !message || source.getAttribute("aria-disabled") === "true") return;
    if (source instanceof HTMLButtonElement && source.disabled) return;
    if (window.confirm(message)) return;

    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div style={{ display: "contents" }} onClickCapture={confirmAction}>
      {children}
    </div>
  );
}
