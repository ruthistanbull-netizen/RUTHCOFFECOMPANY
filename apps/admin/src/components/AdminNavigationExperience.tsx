"use client";

import {
  AnimatePresence,
  motion,
  type MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { Bot, Menu, Send, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import {
  exactAllNavItems,
  exactItemIsActive,
  exactMobileNav,
  type ExactNavItem,
} from "@/components/base44-exact/nav-config";
import styles from "./AdminNavigationExperience.module.css";

type ChatMessage = { role: "user" | "assistant"; text: string };
type ProviderStatus = { ok?: boolean; configured?: boolean; capabilities?: { chat?: boolean } };
type ChatPayload = { ok?: boolean; response?: { text?: string }; error?: { message?: string } };

const DOCK_SPRING = { mass: 0.1, stiffness: 150, damping: 12 };
const MOBILE_DOCK_BASE = 48;
const MOBILE_DOCK_MAGNIFICATION = 78;
const MOBILE_DOCK_DISTANCE = 150;
const MOBILE_DOCK_PANEL_HEIGHT = 68;
const MOBILE_DOCK_EXPANDED_HEIGHT = 128;
const COMMAND_MENU_EVENT = "ruth:command-menu-toggle";

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function VerticalDockItem({ item, pointer, pathname, onNavigate }: {
  item: ExactNavItem;
  pointer: MotionValue<number>;
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const distance = useTransform(pointer, (value) => {
    const rect = ref.current?.getBoundingClientRect();
    return rect ? value - rect.top - rect.height / 2 : Number.POSITIVE_INFINITY;
  });
  const target = useTransform(distance, [-150, 0, 150], [42, 80, 42]);
  const size = useSpring(target, DOCK_SPRING);
  const Icon = item.icon;
  const active = exactItemIsActive(pathname, item);

  return (
    <motion.button
      ref={ref}
      type="button"
      className={`${styles.desktopDockItem} ${active ? styles.dockActive : ""}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onClick={() => onNavigate(item.path)}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
    >
      <Icon aria-hidden="true" />
      <AnimatePresence>
        {hovered ? (
          <motion.span
            className={styles.desktopTooltip}
            initial={{ opacity: 0, x: -5, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -4, scale: 0.96 }}
            transition={{ duration: 0.2 }}
          >
            {item.label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}

function HorizontalDockItem({ item, pointer, pathname, onNavigate }: {
  item: ExactNavItem;
  pointer: MotionValue<number>;
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(pointer, (value) => {
    const rect = ref.current?.getBoundingClientRect();
    return rect ? value - rect.left - rect.width / 2 : Number.POSITIVE_INFINITY;
  });
  const target = useTransform(
    distance,
    [-MOBILE_DOCK_DISTANCE, 0, MOBILE_DOCK_DISTANCE],
    [MOBILE_DOCK_BASE, MOBILE_DOCK_MAGNIFICATION, MOBILE_DOCK_BASE],
  );
  const size = useSpring(target, DOCK_SPRING);
  const iconSize = useTransform(size, (value) => value / 2);
  const Icon = item.icon;
  const active = exactItemIsActive(pathname, item);

  return (
    <motion.button
      ref={ref}
      type="button"
      className={`${styles.mobileDockItem} ${active ? styles.dockActive : ""}`}
      style={{ width: size, height: size }}
      whileTap={{ scale: 0.92 }}
      onClick={() => onNavigate(item.path)}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
    >
      <motion.span className={styles.mobileDockIcon} style={{ width: iconSize, height: iconSize }}>
        <Icon aria-hidden="true" />
      </motion.span>
    </motion.button>
  );
}

function HeaderQuickControls({ onOpenMenu }: { onOpenMenu: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/ruthie/openai/status", { headers, cache: "no-store" });
        const payload = await response.json().catch(() => null) as ProviderStatus | null;
        if (!cancelled) setProviderReady(Boolean(response.ok && payload?.ok && payload.configured && payload.capabilities?.chat));
      } catch {
        if (!cancelled) setProviderReady(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const collapse = useCallback(() => {
    setExpanded(false);
    setMessage("");
    setReply(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) collapse();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [collapse, expanded]);

  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 160);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  const sendMessage = useCallback(async () => {
    const text = message.trim();
    if (!text || !providerReady || sending) return;
    const outgoing = [...historyRef.current, { role: "user" as const, text }].slice(-16);
    historyRef.current = outgoing;
    setMessage("");
    setReply(null);
    setError(null);
    setSending(true);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/chat", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json", "x-correlation-id": makeId("header-ruthie") },
        body: JSON.stringify({ messages: outgoing }),
      });
      const payload = await response.json().catch(() => null) as ChatPayload | null;
      const responseText = payload?.response?.text?.trim();
      if (!response.ok || !payload?.ok || !responseText) throw new Error(payload?.error?.message || "ROSTA Insight yanıt veremedi.");
      historyRef.current = [...outgoing, { role: "assistant" as const, text: responseText }].slice(-16);
      setReply(responseText);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ROSTA Insight yanıt veremedi.");
    } finally {
      setSending(false);
    }
  }, [message, providerReady, sending]);

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void sendMessage();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      collapse();
    }
  };

  return (
    <motion.div
      ref={rootRef}
      data-ruth-nav-header-controls="true"
      data-expanded={expanded ? "true" : "false"}
      className={styles.headerControls}
      animate={{ width: expanded ? 326 : 96 }}
      transition={{ type: "spring", stiffness: expanded ? 300 : 500, damping: expanded ? 30 : 35, mass: 0.7 }}
    >
      <button
        type="button"
        className={styles.headerMenu}
        onClick={() => { collapse(); onOpenMenu(); }}
        aria-label="Panel menüsünü aç"
        aria-controls="ruth-command-orbit-menu"
      >
        <Menu aria-hidden="true" />
      </button>
      <span className={styles.headerSeparator} aria-hidden="true" />
      <motion.button
        type="button"
        className={`${styles.headerRuthie} ${expanded ? styles.headerRuthieActive : ""}`}
        onClick={() => setExpanded((value) => !value)}
        whileTap={{ scale: 0.92 }}
        aria-label={expanded ? "ROSTA Insight hızlı mesajını kapat" : "ROSTA Insight'a mesaj gönder"}
        aria-expanded={expanded}
      >
        <Bot aria-hidden="true" />
        <span className={`${styles.providerDot} ${providerReady ? styles.providerOnline : styles.providerOffline}`} />
      </motion.button>
      <AnimatePresence>
        {expanded ? (
          <motion.input
            ref={inputRef}
            className={styles.headerInput}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={providerReady ? "ROSTA Insight'a yaz..." : "ROSTA Insight hazır değil"}
            disabled={!providerReady || sending}
            autoComplete="off"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0, transition: { delay: 0.1, type: "spring", stiffness: 420, damping: 30 } }}
            exit={{ opacity: 0, x: 8, transition: { duration: 0.08 } }}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {expanded ? (
          <motion.button
            type="button"
            className={styles.headerSend}
            onClick={() => void sendMessage()}
            disabled={!providerReady || !message.trim() || sending}
            aria-label="ROSTA Insight'a gönder"
            initial={{ opacity: 0, scale: 0.3, rotate: -70 }}
            animate={{ opacity: 1, scale: 1, rotate: 0, transition: { delay: 0.13, type: "spring", stiffness: 430, damping: 28 } }}
            exit={{ opacity: 0, scale: 0.4, rotate: 70, transition: { duration: 0.08 } }}
            whileTap={{ scale: 0.88 }}
          >
            <Send aria-hidden="true" />
          </motion.button>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {expanded && (sending || reply || error) ? (
          <motion.div
            className={styles.headerReply}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            aria-live="polite"
          >
            <header>
              <Bot aria-hidden="true" />
              <strong>ROSTA Insight</strong>
              <button type="button" onClick={() => { setReply(null); setError(null); }} aria-label="Yanıtı kapat">
                <X aria-hidden="true" />
              </button>
            </header>
            {sending ? <div className={styles.typing}><span /><span /><span /></div> : null}
            {reply ? <p>{reply}</p> : null}
            {error ? <p className={styles.errorText}>{error}</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export function AdminNavigationExperience() {
  const pathname = usePathname();
  const router = useRouter();
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const verticalPointer = useMotionValue(Number.POSITIVE_INFINITY);
  const horizontalPointer = useMotionValue(Number.POSITIVE_INFINITY);
  const mobileDockEngaged = useMotionValue(0);
  const mobileDockHeightTarget = useTransform(
    mobileDockEngaged,
    [0, 1],
    [MOBILE_DOCK_PANEL_HEIGHT, MOBILE_DOCK_EXPANDED_HEIGHT],
  );
  const mobileDockHeight = useSpring(mobileDockHeightTarget, DOCK_SPRING);
  const dockGestureRef = useRef<{ pointerId: number | null; startX: number; moved: boolean }>({ pointerId: null, startX: 0, moved: false });
  const suppressDockClickRef = useRef(false);

  const desktopDockItems = useMemo(() => {
    const settings = exactAllNavItems.find((item) => item.path === "/settings");
    return settings ? [...exactMobileNav, settings] : exactMobileNav;
  }, []);
  const mobileDockItems = exactMobileNav;

  useEffect(() => {
    document.documentElement.classList.add("ruth-navigation-v4");
    const findHeader = () => {
      const header = document.querySelector<HTMLElement>('header[class*="z-header"]');
      if (!header) return false;
      header.dataset.ruthNavigationHeader = "true";
      setHeaderTarget(header);
      return true;
    };
    if (findHeader()) return () => document.documentElement.classList.remove("ruth-navigation-v4");
    const observer = new MutationObserver(() => {
      if (findHeader()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("ruth-navigation-v4");
    };
  }, []);

  const navigate = useCallback((href: string) => {
    router.push(href);
  }, [router]);

  const openCommandMenu = useCallback(() => {
    window.dispatchEvent(new CustomEvent(COMMAND_MENU_EVENT));
  }, []);

  const navigateFromMobileDock = useCallback((href: string) => {
    if (suppressDockClickRef.current) return;
    navigate(href);
  }, [navigate]);

  const finishMobileDockGesture = useCallback((target: HTMLElement, pointerId: number) => {
    const gesture = dockGestureRef.current;
    if (gesture.pointerId !== pointerId) return;
    if (gesture.moved) {
      suppressDockClickRef.current = true;
      window.setTimeout(() => { suppressDockClickRef.current = false; }, 120);
    }
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
    dockGestureRef.current = { pointerId: null, startX: 0, moved: false };
    mobileDockEngaged.set(0);
    horizontalPointer.set(Number.POSITIVE_INFINITY);
  }, [horizontalPointer, mobileDockEngaged]);

  return (
    <>
      {headerTarget ? createPortal(<HeaderQuickControls onOpenMenu={openCommandMenu} />, headerTarget) : null}

      <motion.nav
        className={styles.desktopDock}
        aria-label="ROSTA Coffee Co. masaüstü dock"
        initial={{ x: -24, opacity: 0, scale: 0.92 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        onMouseMove={(event) => verticalPointer.set(event.clientY)}
        onMouseLeave={() => verticalPointer.set(Number.POSITIVE_INFINITY)}
      >
        {desktopDockItems.map((item) => (
          <VerticalDockItem
            key={item.path}
            item={item}
            pointer={verticalPointer}
            pathname={pathname}
            onNavigate={navigate}
          />
        ))}
      </motion.nav>

      <motion.div
        className={styles.mobileDockViewport}
        style={{ height: mobileDockHeight }}
        initial={{ y: 34, opacity: 0, scale: 0.88 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        <motion.nav
          className={styles.mobileDock}
          aria-label="ROSTA Coffee Co. mobil dock"
          onMouseMove={(event) => {
            mobileDockEngaged.set(1);
            horizontalPointer.set(event.clientX);
          }}
          onMouseLeave={() => {
            if (dockGestureRef.current.pointerId === null) {
              mobileDockEngaged.set(0);
              horizontalPointer.set(Number.POSITIVE_INFINITY);
            }
          }}
          onPointerDown={(event) => {
            dockGestureRef.current = { pointerId: event.pointerId, startX: event.clientX, moved: false };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            mobileDockEngaged.set(1);
            horizontalPointer.set(event.clientX);
          }}
          onPointerMove={(event) => {
            const gesture = dockGestureRef.current;
            if (gesture.pointerId !== event.pointerId) return;
            if (Math.abs(event.clientX - gesture.startX) > 7) gesture.moved = true;
            horizontalPointer.set(event.clientX);
          }}
          onPointerUp={(event) => finishMobileDockGesture(event.currentTarget, event.pointerId)}
          onPointerCancel={(event) => finishMobileDockGesture(event.currentTarget, event.pointerId)}
        >
          {mobileDockItems.map((item) => (
            <HorizontalDockItem
              key={item.path}
              item={item}
              pointer={horizontalPointer}
              pathname={pathname}
              onNavigate={navigateFromMobileDock}
            />
          ))}
        </motion.nav>
      </motion.div>
    </>
  );
}
