"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useStoreDesignDialogExit(onClose: () => void, durationMs = 180) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onClose();
    }, durationMs);
  }, [closing, durationMs, onClose]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  return { closing, requestClose };
}
