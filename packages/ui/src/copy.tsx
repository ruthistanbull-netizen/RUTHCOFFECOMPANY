"use client";

import * as React from "react";

export type CopyState = "idle" | "copying" | "copied" | "error";

export interface CopyButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "value" | "children"> {
  value: string;
  label?: string;
  copiedLabel?: string;
  errorLabel?: string;
  resetMs?: number;
  children?: React.ReactNode | ((state: CopyState, feedback: string) => React.ReactNode);
  onCopied?: (value: string) => void;
  onCopyError?: (error: Error) => void;
}

export async function copyTextToClipboard(value: string) {
  const text = String(value ?? "");
  if (!text) throw new Error("Kopyalanacak değer boş.");
  if (!navigator.clipboard?.writeText) {
    throw new Error("Tarayıcı pano erişimini desteklemiyor.");
  }
  await navigator.clipboard.writeText(text);
}

export function CopyButton({
  value,
  label = "Kopyala",
  copiedLabel = "Kopyalandı",
  errorLabel = "Kopyalanamadı",
  resetMs = 1_600,
  children,
  onCopied,
  onCopyError,
  disabled,
  className = "",
  ...props
}: CopyButtonProps) {
  const [state, setState] = React.useState<CopyState>("idle");
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const resetLater = React.useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setState("idle");
    }, Math.max(400, resetMs));
  }, [resetMs]);

  const handleCopy = React.useCallback(async () => {
    if (disabled || state === "copying") return;
    setState("copying");
    try {
      await copyTextToClipboard(value);
      setState("copied");
      onCopied?.(value);
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error("Kopyalama başarısız oldu.");
      setState("error");
      onCopyError?.(error);
    } finally {
      resetLater();
    }
  }, [disabled, onCopied, onCopyError, resetLater, state, value]);

  const feedback = state === "copied"
    ? copiedLabel
    : state === "error"
      ? errorLabel
      : state === "copying"
        ? "Kopyalanıyor…"
        : label;
  const content = typeof children === "function" ? children(state, feedback) : children ?? <span>{feedback}</span>;

  return (
    <button
      type="button"
      className={`ruth-copy-button ${className}`.trim()}
      onClick={() => void handleCopy()}
      disabled={disabled || state === "copying" || !String(value ?? "")}
      aria-label={feedback}
      data-copy-state={state}
      {...props}
    >
      {content}
      <span className="ruth-visually-hidden" aria-live="polite" aria-atomic="true">
        {state === "copied" || state === "error" ? feedback : ""}
      </span>
    </button>
  );
}
