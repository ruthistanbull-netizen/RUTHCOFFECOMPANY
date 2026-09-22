"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Info,
  MessageSquareText,
  PackageCheck,
  Settings2,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExactIconButton, exactCx, useExactToast } from "./primitives";

const STORAGE_KEY = "ruth_exact_notification_history_v1";
const MAX_HISTORY = 40;

type NotificationKind = "order" | "reminder" | "contact" | "health" | "test" | "default";

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  createdAt: number;
  read: boolean;
};

type NotificationContextValue = {
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

function readHistory(): NotificationItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Partial<NotificationItem>;
      if (!value.id || !value.title || !value.body) return [];
      return [{
        id: String(value.id),
        kind: (value.kind || "default") as NotificationKind,
        title: String(value.title),
        body: String(value.body),
        url: typeof value.url === "string" ? value.url : "/",
        createdAt: Number(value.createdAt) || Date.now(),
        read: Boolean(value.read),
      }];
    }).slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory(items: NotificationItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
    window.dispatchEvent(new CustomEvent("ruth-notification-history", { detail: items.slice(0, MAX_HISTORY) }));
  } catch {
    // Ignore storage errors; live notifications should still work.
  }
}

function notificationIcon(kind: NotificationKind): LucideIcon {
  if (kind === "order") return PackageCheck;
  if (kind === "contact") return MessageSquareText;
  if (kind === "reminder") return AlertCircle;
  if (kind === "health") return AlertTriangle;
  if (kind === "test") return CheckCircle2;
  return Info;
}

function notificationAccent(kind: NotificationKind) {
  if (kind === "order" || kind === "test") return "bg-accent-soft text-accent";
  if (kind === "health") return "bg-warning-soft text-warning";
  if (kind === "contact") return "bg-info-soft text-info";
  if (kind === "reminder") return "bg-warning-soft text-warning";
  return "bg-surface-tertiary text-muted";
}

function notificationTone(kind: NotificationKind) {
  if (kind === "health" || kind === "reminder") return "warning" as const;
  if (kind === "contact") return "info" as const;
  if (kind === "order" || kind === "test") return "success" as const;
  return "info" as const;
}

function formatRelative(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return "Az önce";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(timestamp);
}

function normalizePushPayload(payload: Record<string, unknown>): Omit<NotificationItem, "id" | "createdAt" | "read"> {
  const kind = String(payload.type || payload.kind || "default") as NotificationKind;
  const title = String(payload.title || "Ruth Panel");
  const body = String(payload.body || "Yeni bildirim");
  const url = typeof payload.url === "string" && payload.url ? payload.url : "/";
  return { kind, title, body, url };
}

export function ExactNotificationProvider({ children }: { children: ReactNode }) {
  const toast = useExactToast();
  const [items, setItems] = useState<NotificationItem[]>([]);

  const commit = useCallback((next: NotificationItem[]) => {
    const bounded = next.slice(0, MAX_HISTORY);
    setItems(bounded);
    saveHistory(bounded);
  }, []);

  const addNotification = useCallback((payload: Record<string, unknown>) => {
    const normalized = normalizePushPayload(payload);
    const id = String(payload.tag || "") || `push-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: NotificationItem = {
      id,
      ...normalized,
      createdAt: Date.now(),
      read: false,
    };
    setItems((current) => {
      const filtered = current.filter((item) => item.id !== next.id);
      const merged = [next, ...filtered].slice(0, MAX_HISTORY);
      saveHistory(merged);
      return merged;
    });
    toast.push({
      tone: notificationTone(next.kind),
      message: `${next.title} · ${next.body}`,
      dedupeKey: `push:${next.id}`,
      durationMs: 6500,
    });
  }, [toast]);

  useEffect(() => {
    setItems(readHistory());

    const onHistory = (event: Event) => {
      const detail = (event as CustomEvent<NotificationItem[]>).detail;
      if (Array.isArray(detail)) setItems(detail.slice(0, MAX_HISTORY));
    };
    window.addEventListener("ruth-notification-history", onHistory);

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setItems(readHistory());
    };
    window.addEventListener("storage", onStorage);

    const onServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as { kind?: string; payload?: Record<string, unknown> } | undefined;
      if (data?.kind !== "ruth-push" || !data.payload) return;
      addNotification(data.payload);
    };
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

    return () => {
      window.removeEventListener("ruth-notification-history", onHistory);
      window.removeEventListener("storage", onStorage);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
  }, [addNotification]);

  const markRead = useCallback((id: string) => {
    setItems((current) => {
      const next = current.map((item) => item.id === id ? { ...item, read: true } : item);
      saveHistory(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setItems((current) => {
      const next = current.map((item) => ({ ...item, read: true }));
      saveHistory(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    commit([]);
  }, [commit]);

  const value = useMemo<NotificationContextValue>(() => ({
    items,
    unreadCount: items.filter((item) => !item.read).length,
    markRead,
    markAllRead,
    clearAll,
  }), [clearAll, items, markAllRead, markRead]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

function useNotificationCenter() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotificationCenter must be used inside ExactNotificationProvider");
  return context;
}

export function ExactNotificationBell() {
  const { items, unreadCount, markRead, markAllRead, clearAll } = useNotificationCenter();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const goTo = (item: NotificationItem) => {
    markRead(item.id);
    setOpen(false);
    router.push(item.url);
  };

  return (
    <div className="relative">
      <ExactIconButton
        icon={Bell}
        label="Bildirimler"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((value) => !value)}
        className={open ? "bg-surface-secondary text-main" : ""}
      />
      <AnimatePresence initial={false}>
        {unreadCount > 0 ? (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="pointer-events-none absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-accent-foreground ring-2 ring-surface-primary"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              type="button"
              aria-label="Bildirim panelini kapat"
              className="fixed inset-0 z-notification-panel cursor-default bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.section
              initial={{ opacity: 0, y: -8, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.985 }}
              transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
              className="absolute right-0 top-[calc(100%+10px)] z-notification-panel w-[min(410px,calc(100vw-24px))] overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary shadow-overlay"
              role="dialog"
              aria-label="Bildirimler"
            >
              <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="ruth-type-section-title text-main">Bildirimler</h2>
                    {unreadCount > 0 ? <span className="ruth-type-caption rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{unreadCount} yeni</span> : null}
                  </div>
                  <p className="ruth-type-caption mt-0.5 text-subtle">Son bildirimlerin burada tutulur.</p>
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 ? <button type="button" onClick={markAllRead} className="ruth-type-control rounded-md px-2 py-1.5 text-subtle transition-colors hover:bg-surface-secondary hover:text-main">Tümünü oku</button> : null}
                  <ExactIconButton icon={X} label="Kapat" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} />
                </div>
              </header>

              <div className="max-h-[min(540px,calc(100vh-170px))] overflow-y-auto p-2">
                {items.length ? (
                  <div className="space-y-1">
                    {items.map((item, index) => {
                      const Icon = notificationIcon(item.kind);
                      return (
                        <motion.button
                          key={item.id}
                          type="button"
                          onClick={() => goTo(item)}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(index * 0.025, 0.15), duration: 0.18 }}
                          className={exactCx(
                            "group flex w-full gap-3 rounded-[var(--radius-small)] p-3 text-left transition-colors hover:bg-surface-secondary",
                            !item.read && "bg-accent-soft/55",
                          )}
                        >
                          <span className={exactCx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", notificationAccent(item.kind))}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className={exactCx("ruth-type-control truncate", item.read ? "font-medium text-main" : "font-semibold text-main")}>{item.title}</span>
                              <span className="ruth-type-caption shrink-0 text-subtle">{formatRelative(item.createdAt)}</span>
                            </span>
                            <span className="ruth-type-caption mt-1 block line-clamp-2 pr-1 text-muted">{item.body}</span>
                            {!item.read ? <span className="mt-2 inline-flex items-center gap-1.5 ruth-type-caption font-medium text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" />Yeni</span> : null}
                          </span>
                          <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </motion.button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-secondary text-subtle"><Bell className="h-5 w-5" /></div>
                    <p className="ruth-type-control mt-3 font-medium text-main">Henüz bildirim yok</p>
                    <p className="ruth-type-caption mt-1 max-w-[260px] text-subtle">Yeni sipariş ve diğer sistem bildirimleri geldiğinde burada görünecek.</p>
                  </div>
                )}
              </div>

              {items.length ? (
                <footer className="flex items-center justify-between gap-2 border-t border-border-subtle bg-surface-secondary/50 px-3 py-2.5">
                  <button type="button" onClick={clearAll} className="ruth-type-control inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-subtle transition-colors hover:bg-surface-tertiary hover:text-danger"><Trash2 className="h-3.5 w-3.5" />Temizle</button>
                  <button type="button" onClick={() => { setOpen(false); router.push("/notifications"); }} className="ruth-type-control inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 font-medium text-accent transition-colors hover:bg-accent-soft">Tüm bildirimleri gör<ChevronRight className="h-3.5 w-3.5" /></button>
                </footer>
              ) : null}
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ExactUnifiedToastLayer() {
  const { notices, dismiss } = useExactToast();
  if (!notices.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-[min(390px,calc(100vw-24px))] flex-col gap-2.5" aria-label="Toast bildirimleri">
      <AnimatePresence initial={false} mode="popLayout">
        {notices.map((notice) => {
          const success = notice.tone === "success";
          const danger = notice.tone === "danger";
          const warning = notice.tone === "warning";
          const Icon = success ? CheckCircle2 : danger ? AlertCircle : warning ? AlertTriangle : Info;
          const iconClass = success ? "bg-accent-soft text-accent" : danger ? "bg-danger-soft text-danger" : warning ? "bg-warning-soft text-warning" : "bg-info-soft text-info";
          return (
            <motion.div
              layout
              key={notice.id}
              initial={{ opacity: 0, y: 18, x: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, x: 20, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 460, damping: 32, mass: 0.7 }}
              className={exactCx("pointer-events-auto group relative overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary/95 p-3 shadow-[0_16px_44px_rgba(18,18,24,0.13),0_4px_12px_rgba(18,18,24,0.06)] backdrop-blur-xl", danger ? "border-danger/20" : "")}
              role={danger ? "alert" : "status"}
            >
              <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
              <div className="flex gap-3">
                <span className={exactCx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconClass)}><Icon className="h-[17px] w-[17px]" /></span>
                <div className="min-w-0 flex-1 pr-5">
                  <div className="ruth-type-control font-semibold text-main">{notice.message}</div>
                </div>
                <button type="button" onClick={() => dismiss(notice.id)} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-subtle opacity-60 transition-all hover:bg-surface-secondary hover:text-main hover:opacity-100" aria-label="Bildirimi kapat"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-surface-tertiary"><motion.span initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: Math.max(0.1, notice.durationMs / 1000), ease: "linear" }} className="block h-full bg-accent" /></div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
