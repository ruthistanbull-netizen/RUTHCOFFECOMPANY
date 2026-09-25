"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Mail, MessageSquareText, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type ContactActivity = {
  key: string;
  kind: "contact" | "reply";
  contactMessageId: string;
  sender: string;
  email: string | null;
  preview: string;
  occurredAt: string;
};

type ActivityResponse = {
  ok?: boolean;
  activity?: ContactActivity | null;
};

const POLL_MS = 3_000;
const AUTO_DISMISS_MS = 10_000;

function shouldWatch(pathname: string) {
  return !pathname.startsWith("/login")
    && !pathname.startsWith("/auth")
    && !pathname.startsWith("/reset-password");
}

export function AdminContactMessagePopup() {
  const pathname = usePathname();
  const baselineReady = useRef(false);
  const latestKey = useRef<string | null>(null);
  const requestRunning = useRef(false);
  const [activity, setActivity] = useState<ContactActivity | null>(null);

  const check = useCallback(async () => {
    if (!shouldWatch(pathname) || requestRunning.current) return;
    requestRunning.current = true;

    try {
      const result = await adminRequest<ActivityResponse>("/api/contact-messages/activity", {
        force: true,
        hardRefresh: true,
        ttlMs: 0,
        staleMs: 0,
        timeoutMs: 8_000,
      });
      const next = result.activity || null;
      if (!next?.key) return;

      if (!baselineReady.current) {
        latestKey.current = next.key;
        baselineReady.current = true;
        return;
      }

      if (latestKey.current === next.key) return;
      latestKey.current = next.key;

      if (document.visibilityState !== "visible") return;

      setActivity(next);
      window.dispatchEvent(new CustomEvent("ruth:contact-message-activity", { detail: next }));
    } catch {
      // Foreground notifications are additive UX; transient failures stay silent.
    } finally {
      requestRunning.current = false;
    }
  }, [pathname]);

  useEffect(() => {
    if (!shouldWatch(pathname)) return;

    void check();
    const timer = window.setInterval(() => { void check(); }, POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onOnline = () => { void check(); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [check, pathname]);

  useEffect(() => {
    if (!activity) return;
    const timer = window.setTimeout(() => setActivity(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [activity]);

  const openMessage = () => {
    setActivity(null);
    window.location.assign(`/contact-messages?message_id=${encodeURIComponent(activity?.contactMessageId || "")}`);
  };

  return (
    <AnimatePresence>
      {activity ? (
        <motion.aside
          key={activity.key}
          initial={{ opacity: 0, y: -18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          role="status"
          aria-live="assertive"
          className="fixed left-3 right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[10000] mx-auto max-w-[430px] overflow-hidden rounded-[20px] border border-border-subtle bg-surface-primary/95 shadow-overlay backdrop-blur-2xl md:left-auto md:right-5 md:top-20 md:mx-0 md:w-[390px]"
        >
          <div className="flex items-start gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              {activity.kind === "reply" ? <Mail className="h-5 w-5" /> : <MessageSquareText className="h-5 w-5" />}
            </div>

            <button type="button" onClick={openMessage} className="min-w-0 flex-1 text-left">
              <p className="ruth-type-label font-semibold uppercase tracking-wide text-accent">
                {activity.kind === "reply" ? "Yeni müşteri cevabı" : "Yeni iletişim mesajı"}
              </p>
              <p className="ruth-type-card-title mt-0.5 truncate text-main">{activity.sender}</p>
              <p className="ruth-type-body mt-1 line-clamp-2 text-muted">{activity.preview}</p>
              <span className="ruth-type-control mt-2 inline-flex items-center gap-1 font-medium text-accent">
                Mesajı aç <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActivity(null)}
              aria-label="Bildirimi kapat"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-subtle transition-colors active:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <motion.div
            key={`timer:${activity.key}`}
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: AUTO_DISMISS_MS / 1000, ease: "linear" }}
            className="h-0.5 origin-left bg-accent"
          />
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
