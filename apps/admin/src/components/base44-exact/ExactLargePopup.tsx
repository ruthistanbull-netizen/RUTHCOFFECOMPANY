"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { type ReactNode, useId, useRef } from "react";
import { useOverlayBehavior, type OverlayDismissalPolicy } from "@ruth-commerce/ui";
import { ruthMotion, ruthMotionEase } from "@ruth-commerce/ui/motion";

export type ExactLargePopupSize = "sm" | "md" | "lg" | "xl" | "wide" | "workspace";

const sizeClasses: Record<ExactLargePopupSize, string> = {
  sm: "md:max-w-sm",
  md: "md:max-w-md",
  lg: "md:max-w-xl",
  xl: "md:max-w-4xl",
  wide: "md:h-[min(78vh,680px)] md:w-[min(86vw,960px)]",
  workspace: "md:w-[min(96vw,1380px)]",
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function ExactLargePopup({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  headerActions,
  toolbar,
  size = "xl",
  dismissalPolicy = "light-dismiss",
  bodyClassName,
  surfaceClassName,
  headerClassName,
  footerClassName,
  labelledBy,
  closeAutofocus = true,
  surfaceData,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  toolbar?: ReactNode;
  size?: ExactLargePopupSize;
  dismissalPolicy?: OverlayDismissalPolicy;
  bodyClassName?: string;
  surfaceClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
  labelledBy?: string;
  closeAutofocus?: boolean;
  surfaceData?: Record<`data-${string}`, string | undefined>;
}) {
  const generatedTitleId = useId();
  const reduceMotion = useReducedMotion();
  const overlay = useOverlayBehavior({ active: open, onClose, dismissalPolicy });
  const pointerCloseAtRef = useRef(0);
  const surfaceDuration = reduceMotion ? ruthMotion.duration.none : ruthMotion.duration.slow;
  const backdropDuration = reduceMotion ? ruthMotion.duration.none : ruthMotion.duration.normal;
  const titleId = labelledBy || generatedTitleId;

  const closeOnPressStart = () => {
    pointerCloseAtRef.current = Date.now();
    onClose();
  };

  const closeOnClickFallback = () => {
    // Pointer interactions already close on pointerdown so the exit motion starts
    // on the first frame of the press. Keep click only for keyboard/assistive-tech
    // activation without firing onClose twice for the same physical press.
    if (Date.now() - pointerCloseAtRef.current < 500) return;
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="admin-large-popup-layer"
          initial="closed"
          animate="open"
          exit="closed"
          variants={{
            open: { transition: { when: "beforeChildren" } },
            closed: { transition: { when: "afterChildren" } },
          }}
          className="fixed inset-0 z-[2147483500] flex items-end justify-center overflow-hidden p-0 md:items-center md:p-4"
          data-admin-large-popup-layer
          data-dismissal-policy={overlay.dismissalPolicy}
        >
          <motion.button
            type="button"
            aria-label="Pencere arka planını kapat"
            variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
            transition={{ duration: backdropDuration, ease: ruthMotionEase }}
            onClick={overlay.onBackdropClick}
            className="absolute inset-0 bg-black/35"
          />

          <motion.section
            {...surfaceData}
            ref={overlay.containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-admin-large-popup
            data-popup-size={size}
            data-overlay-owner="canonical"
            data-dismissal-policy={overlay.dismissalPolicy}
            variants={reduceMotion
              ? { open: { opacity: 1 }, closed: { opacity: 0 } }
              : { open: { y: "0%", opacity: 1 }, closed: { y: "100%", opacity: 1 } }}
            transition={{ duration: surfaceDuration, ease: ruthMotionEase }}
            style={reduceMotion ? undefined : { willChange: "transform" }}
            className={cx(
              "relative flex w-full min-w-0 flex-col overflow-hidden border border-border-subtle bg-surface-primary shadow-overlay",
              "max-h-[calc(100dvh-4.75rem)] rounded-t-[var(--radius-container)]",
              "md:max-h-[88vh] md:rounded-[var(--radius-card)]",
              sizeClasses[size],
              surfaceClassName,
            )}
          >
            <header
              className={cx(
                "flex min-h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface-primary px-4 py-3 md:px-5",
                headerClassName,
              )}
            >
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="ruth-type-section-title truncate text-main">{title}</h2>
                {subtitle ? <p className="ruth-type-caption mt-0.5 truncate text-muted">{subtitle}</p> : null}
              </div>
              {headerActions ? <div className="flex min-w-0 shrink-0 items-center gap-2">{headerActions}</div> : null}
              <button
                {...(closeAutofocus ? { "data-autofocus": true } : {})}
                type="button"
                aria-label="Kapat"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  closeOnPressStart();
                }}
                onClick={closeOnClickFallback}
                className="touch-manipulation inline-flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-[var(--radius-small)] text-muted transition-colors hover:bg-surface-secondary hover:text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:h-8 md:w-8"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            {toolbar ? (
              <div className="shrink-0 border-b border-border-subtle bg-surface-primary px-4 py-2.5 md:px-5">
                {toolbar}
              </div>
            ) : null}

            <div
              className={cx(
                "ruth-type-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-5 md:py-4",
                bodyClassName,
              )}
            >
              {children}
            </div>

            {footer ? (
              <footer
                className={cx(
                  "ruth-type-control shrink-0 border-t border-border-subtle bg-surface-primary px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5",
                  footerClassName,
                )}
              >
                {footer}
              </footer>
            ) : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
