"use client";

import * as React from "react";
import { acquireBackgroundInteractionLock } from "./background-interaction-lock";
import { ruthMotion, ruthMotionEase } from "./motion";
import { IconButton } from "./primitives";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const OVERLAY_EASE = `cubic-bezier(${ruthMotionEase.join(", ")})`;
const activeOverlayStack: symbol[] = [];
const OVERLAY_ACTIVE_ATTRIBUTE = "data-ruth-overlay-active";

function syncOverlayDocumentState() {
  if (typeof document === "undefined") return;
  if (activeOverlayStack.length > 0) {
    document.documentElement.setAttribute(OVERLAY_ACTIVE_ATTRIBUTE, "true");
  } else {
    document.documentElement.removeAttribute(OVERLAY_ACTIVE_ATTRIBUTE);
  }
  document.dispatchEvent(new CustomEvent("ruth-overlay-stack-change", {
    detail: { active: activeOverlayStack.length > 0, depth: activeOverlayStack.length },
  }));
}

function isTopOverlay(id: symbol) {
  return activeOverlayStack[activeOverlayStack.length - 1] === id;
}

function registerOverlay(id: symbol) {
  const existingIndex = activeOverlayStack.indexOf(id);
  if (existingIndex >= 0) activeOverlayStack.splice(existingIndex, 1);
  activeOverlayStack.push(id);
  syncOverlayDocumentState();
}

function unregisterOverlay(id: symbol) {
  const index = activeOverlayStack.lastIndexOf(id);
  if (index >= 0) activeOverlayStack.splice(index, 1);
  syncOverlayDocumentState();
}

export type OverlayDismissalPolicy = "light-dismiss" | "explicit-dismiss" | "protected-action";
export type OverlayDismissReason = "backdrop" | "escape" | "close-button";

export function overlayDismissalCapabilities(policy: OverlayDismissalPolicy) {
  return {
    backdrop: policy === "light-dismiss",
    escape: policy !== "protected-action",
  };
}

function resolveDismissalPolicy(input: {
  dismissalPolicy?: OverlayDismissalPolicy;
  dismissible: boolean;
  legacyCloseOnBackdrop?: boolean;
  fullscreen?: boolean;
}): OverlayDismissalPolicy {
  if (!input.dismissible) return "protected-action";
  if (input.dismissalPolicy) return input.dismissalPolicy;
  if (input.legacyCloseOnBackdrop === false || input.fullscreen) return "explicit-dismiss";
  return "light-dismiss";
}

export interface OverlayBehaviorOptions {
  active: boolean;
  onClose: () => void;
  dismissalPolicy?: OverlayDismissalPolicy;
  dismissible?: boolean;
  legacyCloseOnBackdrop?: boolean;
  fullscreen?: boolean;
}

export function useOverlayBehavior({
  active,
  onClose,
  dismissalPolicy,
  dismissible = true,
  legacyCloseOnBackdrop,
  fullscreen = false,
}: OverlayBehaviorOptions) {
  const containerNodeRef = React.useRef<HTMLElement | null>(null);
  const containerRef = React.useCallback((node: HTMLElement | null) => {
    containerNodeRef.current = node;
  }, []);
  const previousActiveElementRef = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const overlayIdRef = React.useRef(Symbol("ruth-overlay"));
  const resolvedPolicy = resolveDismissalPolicy({
    dismissalPolicy,
    dismissible,
    legacyCloseOnBackdrop,
    fullscreen,
  });
  const capabilities = overlayDismissalCapabilities(resolvedPolicy);
  const dismissibleRef = React.useRef(dismissible);
  const capabilitiesRef = React.useRef(capabilities);

  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;
  capabilitiesRef.current = capabilities;

  React.useEffect(() => {
    if (!active) return;

    const overlayId = overlayIdRef.current;
    previousActiveElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    registerOverlay(overlayId);
    const releaseBackgroundLock = acquireBackgroundInteractionLock();

    const focusFrame = window.requestAnimationFrame(() => {
      if (!isTopOverlay(overlayId)) return;
      const container = containerNodeRef.current;
      if (!container) return;
      const initialTarget =
        container.querySelector<HTMLElement>("[data-autofocus]") ??
        container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (initialTarget ?? container).focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(overlayId)) return;

      if (event.key === "Escape") {
        if (!dismissibleRef.current || !capabilitiesRef.current.escape) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const container = containerNodeRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
      );

      if (focusable.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = document.activeElement;

      if (event.shiftKey && (focused === first || !container.contains(focused))) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      const wasTop = isTopOverlay(overlayId);
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      unregisterOverlay(overlayId);
      releaseBackgroundLock();

      if (!wasTop) return;
      const previous = previousActiveElementRef.current;
      window.requestAnimationFrame(() => {
        if (activeOverlayStack.length > 0) return;
        if (previous?.isConnected) previous.focus({ preventScroll: true });
      });
    };
  }, [active]);

  const onBackdropClick = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!isTopOverlay(overlayIdRef.current)) return;
    if (!dismissibleRef.current || !capabilitiesRef.current.backdrop || event.target !== event.currentTarget) return;
    onCloseRef.current();
  }, []);

  return {
    containerRef,
    dismissalPolicy: resolvedPolicy,
    onBackdropClick,
    canDismissWithBackdrop: dismissible && capabilities.backdrop,
    canDismissWithEscape: dismissible && capabilities.escape,
  };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  return reduced;
}

function useOverlayPresence(open: boolean, durationMs: number) {
  const [rendered, setRendered] = React.useState(open);
  const [state, setState] = React.useState<"open" | "closed">(open ? "open" : "closed");

  React.useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = window.requestAnimationFrame(() => setState("open"));
      return () => window.cancelAnimationFrame(frame);
    }

    setState("closed");
    if (!rendered || durationMs <= 0) {
      setRendered(false);
      return;
    }
    const timer = window.setTimeout(() => setRendered(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, open, rendered]);

  return { rendered, state };
}

function overlayRootStyle(state: "open" | "closed", durationMs: number): React.CSSProperties {
  return {
    animation: "none",
    opacity: state === "open" ? 1 : 0,
    pointerEvents: state === "open" ? "auto" : "none",
    transition: `opacity ${durationMs}ms ${OVERLAY_EASE}`,
  };
}

function modalPanelStyle(state: "open" | "closed", durationMs: number): React.CSSProperties {
  return {
    animation: "none",
    opacity: state === "open" ? 1 : 0,
    transform: state === "open"
      ? "translate3d(0, 0, 0) scale(1)"
      : `translate3d(0, ${ruthMotion.distance.standard}px, 0) scale(${ruthMotion.scale.enter})`,
    transition: `opacity ${durationMs}ms ${OVERLAY_EASE}, transform ${durationMs}ms ${OVERLAY_EASE}`,
    willChange: "opacity, transform",
  };
}

function drawerPanelStyle(
  side: "left" | "right",
  state: "open" | "closed",
  durationMs: number,
): React.CSSProperties {
  const direction = side === "right" ? 1 : -1;
  return {
    animation: "none",
    opacity: state === "open" ? 1 : 0,
    transform: state === "open"
      ? "translate3d(0, 0, 0)"
      : `translate3d(${direction * ruthMotion.distance.emphatic}px, 0, 0)`,
    transition: `opacity ${durationMs}ms ${OVERLAY_EASE}, transform ${durationMs}ms ${OVERLAY_EASE}`,
    willChange: "opacity, transform",
  };
}

function fullscreenPanelStyle(state: "open" | "closed", durationMs: number): React.CSSProperties {
  return {
    opacity: state === "open" ? 1 : 0,
    transform: state === "open"
      ? "translate3d(0, 0, 0)"
      : `translate3d(0, ${ruthMotion.distance.subtle}px, 0)`,
    transition: `opacity ${durationMs}ms ${OVERLAY_EASE}, transform ${durationMs}ms ${OVERLAY_EASE}`,
    willChange: "opacity, transform",
  };
}

function OverlayCloseButton({
  onClose,
  label = "Kapat",
  className = "",
}: {
  onClose: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <IconButton
      className={`ruth-overlay__close ${className}`.trim()}
      variant="surface"
      size="md"
      onClick={onClose}
      aria-label={label}
    >
      <span aria-hidden="true">×</span>
    </IconButton>
  );
}

interface OverlayBaseProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dismissalPolicy?: OverlayDismissalPolicy;
  /** @deprecated Prefer dismissalPolicy. Kept for existing callers during migration. */
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  dialogRole?: "dialog" | "alertdialog";
}

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps extends OverlayBaseProps {
  size?: ModalSize;
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  dismissalPolicy,
  closeOnBackdrop,
  dismissible = true,
  dialogRole = "dialog",
  size = "md",
}: ModalProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const reducedMotion = usePrefersReducedMotion();
  const durationMs = reducedMotion ? ruthMotion.milliseconds.none : ruthMotion.milliseconds.normal;
  const { rendered, state } = useOverlayPresence(open, durationMs);
  const overlay = useOverlayBehavior({
    active: open,
    onClose,
    dismissalPolicy,
    dismissible,
    legacyCloseOnBackdrop: closeOnBackdrop,
  });

  if (!rendered) return null;

  return (
    <div
      className="ruth-overlay"
      data-state={state}
      data-dismissal-policy={overlay.dismissalPolicy}
      role="presentation"
      aria-hidden={state === "closed" ? true : undefined}
      style={overlayRootStyle(state, durationMs)}
      onClick={overlay.onBackdropClick}
    >
      <section
        ref={overlay.containerRef}
        className={`ruth-modal ruth-modal--${size}`}
        data-state={state}
        data-overlay-owner="canonical"
        role={state === "open" ? dialogRole : undefined}
        aria-modal={state === "open" ? "true" : undefined}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        style={modalPanelStyle(state, durationMs)}
      >
        <header className="ruth-overlay__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          {dismissible ? <OverlayCloseButton onClose={onClose} /> : null}
        </header>
        <div className="ruth-overlay__body">{children}</div>
        {footer ? <footer className="ruth-overlay__footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export interface DrawerProps extends OverlayBaseProps {
  side?: "left" | "right";
}

export function Drawer({
  side = "right",
  open,
  title,
  description,
  onClose,
  children,
  footer,
  dismissalPolicy,
  closeOnBackdrop,
  dismissible = true,
  dialogRole = "dialog",
}: DrawerProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const reducedMotion = usePrefersReducedMotion();
  const durationMs = reducedMotion ? ruthMotion.milliseconds.none : ruthMotion.milliseconds.normal;
  const { rendered, state } = useOverlayPresence(open, durationMs);
  const overlay = useOverlayBehavior({
    active: open,
    onClose,
    dismissalPolicy,
    dismissible,
    legacyCloseOnBackdrop: closeOnBackdrop,
  });

  if (!rendered) return null;

  return (
    <div
      className="ruth-overlay"
      data-state={state}
      data-dismissal-policy={overlay.dismissalPolicy}
      role="presentation"
      aria-hidden={state === "closed" ? true : undefined}
      style={overlayRootStyle(state, durationMs)}
      onClick={overlay.onBackdropClick}
    >
      <aside
        ref={overlay.containerRef}
        className={`ruth-drawer ruth-drawer--${side}`}
        data-state={state}
        data-overlay-owner="canonical"
        role={state === "open" ? dialogRole : undefined}
        aria-modal={state === "open" ? "true" : undefined}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        style={drawerPanelStyle(side, state, durationMs)}
      >
        <header className="ruth-overlay__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          {dismissible ? <OverlayCloseButton onClose={onClose} /> : null}
        </header>
        <div className="ruth-overlay__body">{children}</div>
        {footer ? <footer className="ruth-overlay__footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export interface FullscreenOverlayProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
  closeLabel?: string;
  dismissalPolicy?: OverlayDismissalPolicy;
  /** @deprecated Prefer dismissalPolicy. Kept for existing callers during migration. */
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  showCloseButton?: boolean;
}

export function FullscreenOverlay({
  open,
  title,
  onClose,
  children,
  className = "",
  panelClassName = "",
  closeLabel = "Kapat",
  dismissalPolicy,
  closeOnBackdrop,
  dismissible = true,
  showCloseButton = true,
}: FullscreenOverlayProps) {
  const titleId = React.useId();
  const reducedMotion = usePrefersReducedMotion();
  const durationMs = reducedMotion ? ruthMotion.milliseconds.none : ruthMotion.milliseconds.slow;
  const { rendered, state } = useOverlayPresence(open, durationMs);
  const overlay = useOverlayBehavior({
    active: open,
    onClose,
    dismissalPolicy,
    dismissible,
    legacyCloseOnBackdrop: closeOnBackdrop,
    fullscreen: dismissalPolicy == null && closeOnBackdrop == null,
  });

  if (!rendered) return null;

  return (
    <div
      className={`ruth-fullscreen-overlay-root ${className}`.trim()}
      data-state={state}
      data-dismissal-policy={overlay.dismissalPolicy}
      role="presentation"
      aria-hidden={state === "closed" ? true : undefined}
      style={overlayRootStyle(state, durationMs)}
      onClick={overlay.onBackdropClick}
    >
      <section
        ref={overlay.containerRef}
        className={`ruth-fullscreen-overlay ${panelClassName}`.trim()}
        data-state={state}
        data-overlay-owner="canonical"
        role={state === "open" ? "dialog" : undefined}
        aria-modal={state === "open" ? "true" : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        style={fullscreenPanelStyle(state, durationMs)}
      >
        <h2 id={titleId} className="ruth-visually-hidden">{title}</h2>
        {showCloseButton && dismissible ? (
          <OverlayCloseButton onClose={onClose} label={closeLabel} className="ruth-fullscreen-overlay__close" />
        ) : null}
        {children}
      </section>
    </div>
  );
}

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "neutral" | "success" | "warning" | "danger";
  title: string;
  description?: string;
  onDismiss?: () => void;
}

export function Toast({ tone = "neutral", title, description, onDismiss, className = "", ...props }: ToastProps) {
  return (
    <div className={`ruth-toast ruth-toast--${tone} ${className}`.trim()} role="status" {...props}>
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {onDismiss ? <OverlayCloseButton onClose={onDismiss} label="Bildirimi kapat" /> : null}
    </div>
  );
}
