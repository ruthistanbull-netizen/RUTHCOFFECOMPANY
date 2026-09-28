"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function topStoreDesignDialog() {
  const dialogs = document.querySelectorAll<HTMLElement>(".sd-modal-backdrop .sd-modal-card");
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
}

function visibleFocusable(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
}

export function useStoreDesignDialogExit(onClose: () => void, durationMs = 180, escapeLocked = false) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const escapeLockedRef = useRef(escapeLocked);
  const dialogRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    escapeLockedRef.current = escapeLocked;
  }, [escapeLocked]);

  const requestClose = useCallback(() => {
    if (timerRef.current !== null) return;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onCloseRef.current();
    }, durationMs);
  }, [durationMs]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = topStoreDesignDialog();
      if (!dialog) return;
      dialogRef.current = dialog;

      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      if (!dialog.hasAttribute("aria-label") && !dialog.hasAttribute("aria-labelledby")) {
        const title = dialog.querySelector("header p")?.textContent?.trim();
        if (title) dialog.setAttribute("aria-label", title);
      }
      if (!dialog.hasAttribute("tabindex")) dialog.tabIndex = -1;

      const preferred = dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]");
      const first = preferred || visibleFocusable(dialog)[0] || dialog;
      first.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || topStoreDesignDialog() !== dialog) return;

      if (event.key === "Escape") {
        if (escapeLockedRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = visibleFocusable(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      dialogRef.current = null;
      const returnTarget = returnFocusRef.current;
      if (returnTarget?.isConnected) {
        window.requestAnimationFrame(() => returnTarget.focus({ preventScroll: true }));
      }
    };
  }, [requestClose]);

  return { closing, requestClose };
}
