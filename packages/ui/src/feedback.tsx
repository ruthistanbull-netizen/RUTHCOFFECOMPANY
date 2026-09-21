"use client";

import * as React from "react";
import { Pressable } from "./pressable";

export type NoticeTone = "neutral" | "info" | "success" | "warning" | "danger";
export type NoticeVariant = "inline" | "banner";
export type FeedbackTone = "success" | "danger" | "info" | "warning";
export type FeedbackProgressState = "indeterminate" | "determinate";

export interface LoadingIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function LoadingIndicator({
  size = "sm",
  label,
  className = "",
  ...props
}: LoadingIndicatorProps) {
  return (
    <span
      className={`ruth-feedback-spinner ruth-feedback-spinner--${size} ${className}`.trim()}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...props}
    />
  );
}

export interface NoticeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: NoticeTone;
  variant?: NoticeVariant;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function Notice({
  tone = "neutral",
  variant = "inline",
  title,
  description,
  icon,
  action,
  onDismiss,
  dismissLabel = "Bildirimi kapat",
  className = "",
  children,
  ...props
}: NoticeProps) {
  const role = tone === "danger" ? "alert" : "status";

  return (
    <div className={`ruth-notice ruth-notice--${tone} ruth-notice--${variant} ${className}`.trim()} role={role} {...props}>
      {icon ? <div className="ruth-notice__icon" aria-hidden="true">{icon}</div> : null}
      <div className="ruth-notice__copy">
        {title ? <strong>{title}</strong> : null}
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {action ? <div className="ruth-notice__action">{action}</div> : null}
      {onDismiss ? (
        <Pressable
          type="button"
          pressStrength="icon"
          className="ruth-icon-button ruth-icon-button--ghost ruth-icon-button--sm ruth-feedback-dismiss"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <span aria-hidden="true">×</span>
        </Pressable>
      ) : null}
    </div>
  );
}

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  compact?: boolean;
}

export function LoadingState({
  label = "Yükleniyor",
  description,
  compact = false,
  className = "",
  ...props
}: LoadingStateProps) {
  return (
    <div className={`ruth-loading-state ${compact ? "ruth-loading-state--compact" : ""} ${className}`.trim()} role="status" aria-live="polite" aria-busy="true" {...props}>
      <LoadingIndicator size="md" />
      <div>
        <strong>{label}</strong>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({
  title = "Bir sorun oluştu",
  description,
  action,
  retryLabel = "Tekrar dene",
  onRetry,
  retrying = false,
  className = "",
  ...props
}: ErrorStateProps) {
  const retryAction = onRetry ? (
    <Pressable
      type="button"
      pressStrength="standard"
      className="ruth-button ruth-button--secondary ruth-button--sm"
      onClick={onRetry}
      disabled={retrying}
      aria-busy={retrying || undefined}
    >
      {retrying ? <LoadingIndicator size="sm" /> : null}
      <span>{retryLabel}</span>
    </Pressable>
  ) : undefined;

  return (
    <Notice
      tone="danger"
      title={title}
      description={description}
      className={`ruth-error-state ${className}`.trim()}
      action={action ?? retryAction}
      {...props}
    />
  );
}

export interface InlineFeedbackProps extends Omit<NoticeProps, "variant" | "tone" | "description"> {
  tone?: FeedbackTone;
  message: React.ReactNode;
  retryLabel?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function InlineFeedback({
  tone = "info",
  message,
  retryLabel = "Tekrar dene",
  onRetry,
  retrying = false,
  action,
  ...props
}: InlineFeedbackProps) {
  const retryAction = onRetry ? (
    <Pressable
      type="button"
      pressStrength="standard"
      className="ruth-button ruth-button--secondary ruth-button--sm"
      onClick={onRetry}
      disabled={retrying}
      aria-busy={retrying || undefined}
    >
      {retrying ? <LoadingIndicator size="sm" /> : null}
      <span>{retryLabel}</span>
    </Pressable>
  ) : undefined;

  return <Notice {...props} variant="inline" tone={tone} description={message} action={action ?? retryAction} />;
}

export interface ProgressProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  value?: number;
  max?: number;
  label: string;
  showValue?: boolean;
}

export function Progress({
  value,
  max = 100,
  label,
  showValue = false,
  className = "",
  ...props
}: ProgressProps) {
  const validMax = Number.isFinite(max) && max > 0 ? max : 100;
  const determinate = typeof value === "number" && Number.isFinite(value);
  const boundedValue = determinate ? Math.min(validMax, Math.max(0, value)) : 0;
  const percent = determinate ? Math.round((boundedValue / validMax) * 100) : null;
  const state: FeedbackProgressState = determinate ? "determinate" : "indeterminate";

  return (
    <div className={`ruth-feedback-progress ruth-feedback-progress--${state} ${className}`.trim()} {...props}>
      <div className="ruth-feedback-progress__copy">
        <span>{label}</span>
        {showValue && percent !== null ? <span>{percent}%</span> : null}
      </div>
      <div
        className="ruth-feedback-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={determinate ? validMax : undefined}
        aria-valuenow={determinate ? boundedValue : undefined}
        aria-valuetext={determinate ? `${percent}%` : "İşlem devam ediyor"}
      >
        <span
          className="ruth-feedback-progress__bar"
          style={determinate ? { width: `${percent}%` } : undefined}
        />
      </div>
    </div>
  );
}

export type FeedbackNotice = {
  id: string;
  tone: FeedbackTone;
  message: string;
  dedupeKey: string;
  createdAt: number;
  durationMs: number;
};

export type FeedbackPushOptions = {
  tone: FeedbackTone;
  message: string;
  dedupeKey?: string;
  durationMs?: number;
};

export type FeedbackContextValue = {
  notices: readonly FeedbackNotice[];
  push: (options: FeedbackPushOptions) => string;
  success: (message: string, options?: Omit<FeedbackPushOptions, "tone" | "message">) => string;
  error: (message: string, options?: Omit<FeedbackPushOptions, "tone" | "message">) => string;
  info: (message: string, options?: Omit<FeedbackPushOptions, "tone" | "message">) => string;
  warning: (message: string, options?: Omit<FeedbackPushOptions, "tone" | "message">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

export type FeedbackStackRenderer = (
  notices: readonly FeedbackNotice[],
  dismiss: (id: string) => void,
) => React.ReactNode;

export interface FeedbackProviderProps {
  children: React.ReactNode;
  durationMs?: number;
  maxVisible?: number;
  renderStack?: FeedbackStackRenderer;
}

const noopFeedback: FeedbackContextValue = {
  notices: [],
  push: () => "",
  success: () => "",
  error: () => "",
  info: () => "",
  warning: () => "",
  dismiss: () => undefined,
  clear: () => undefined,
};

const FeedbackContext = React.createContext<FeedbackContextValue>(noopFeedback);

export function FeedbackProvider({
  children,
  durationMs = 4200,
  maxVisible = 4,
  renderStack,
}: FeedbackProviderProps) {
  const [notices, setNotices] = React.useState<FeedbackNotice[]>([]);
  const noticesRef = React.useRef<FeedbackNotice[]>([]);
  const timersRef = React.useRef(new Map<string, number>());
  const sequenceRef = React.useRef(0);

  const commitNotices = React.useCallback((next: FeedbackNotice[]) => {
    noticesRef.current = next;
    setNotices(next);
  }, []);

  const clearTimer = React.useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = React.useCallback((id: string) => {
    clearTimer(id);
    commitNotices(noticesRef.current.filter((notice) => notice.id !== id));
  }, [clearTimer, commitNotices]);

  const scheduleDismiss = React.useCallback((id: string, delay: number) => {
    clearTimer(id);
    if (delay <= 0) return;
    const timer = window.setTimeout(() => {
      timersRef.current.delete(id);
      commitNotices(noticesRef.current.filter((notice) => notice.id !== id));
    }, delay);
    timersRef.current.set(id, timer);
  }, [clearTimer, commitNotices]);

  const push = React.useCallback((options: FeedbackPushOptions) => {
    const message = String(options.message || "").trim();
    if (!message) return "";
    const tone = options.tone;
    const key = options.dedupeKey?.trim() || `${tone}:${message}`;
    const lifetime = Math.max(0, options.durationMs ?? durationMs);
    const existing = noticesRef.current.find((notice) => notice.dedupeKey === key);

    if (existing) {
      const refreshed: FeedbackNotice = {
        ...existing,
        tone,
        message,
        createdAt: Date.now(),
        durationMs: lifetime,
      };
      commitNotices(noticesRef.current.map((notice) => notice.id === existing.id ? refreshed : notice));
      scheduleDismiss(existing.id, lifetime);
      return existing.id;
    }

    const id = `feedback-${Date.now()}-${++sequenceRef.current}`;
    const notice: FeedbackNotice = {
      id,
      tone,
      message,
      dedupeKey: key,
      createdAt: Date.now(),
      durationMs: lifetime,
    };
    const limit = Number.isFinite(maxVisible) ? Math.max(1, Math.floor(maxVisible)) : 4;
    const next = [...noticesRef.current, notice].slice(-limit);
    const nextIds = new Set(next.map((item) => item.id));
    for (const current of noticesRef.current) {
      if (!nextIds.has(current.id)) clearTimer(current.id);
    }
    commitNotices(next);
    scheduleDismiss(id, lifetime);
    return id;
  }, [clearTimer, commitNotices, durationMs, maxVisible, scheduleDismiss]);

  const success = React.useCallback((message: string, options: Omit<FeedbackPushOptions, "tone" | "message"> = {}) => (
    push({ ...options, tone: "success", message })
  ), [push]);
  const error = React.useCallback((message: string, options: Omit<FeedbackPushOptions, "tone" | "message"> = {}) => (
    push({ ...options, tone: "danger", message })
  ), [push]);
  const info = React.useCallback((message: string, options: Omit<FeedbackPushOptions, "tone" | "message"> = {}) => (
    push({ ...options, tone: "info", message })
  ), [push]);
  const warning = React.useCallback((message: string, options: Omit<FeedbackPushOptions, "tone" | "message"> = {}) => (
    push({ ...options, tone: "warning", message })
  ), [push]);

  const clear = React.useCallback(() => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    timersRef.current.clear();
    commitNotices([]);
  }, [commitNotices]);

  React.useEffect(() => () => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  // Keep the imperative feedback API identity stable while notices animate in/out.
  // Consumers often place toast methods in data-loader dependencies; changing the
  // context object for every visual notice used to retrigger initial page loads.
  const value = React.useMemo<FeedbackContextValue>(() => ({
    get notices() {
      return noticesRef.current;
    },
    push,
    success,
    error,
    info,
    warning,
    dismiss,
    clear,
  }), [clear, dismiss, error, info, push, success, warning]);

  const defaultStack = notices.length ? (
    <div className="ruth-feedback-stack" aria-label="Bildirimler">
      {notices.map((notice) => (
        <Notice
          key={notice.id}
          tone={notice.tone}
          description={notice.message}
          onDismiss={() => dismiss(notice.id)}
        />
      ))}
    </div>
  ) : null;

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {renderStack ? renderStack(notices, dismiss) : defaultStack}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  return React.useContext(FeedbackContext);
}
