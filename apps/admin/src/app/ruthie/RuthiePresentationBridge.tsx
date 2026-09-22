"use client";

import { LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminAuthHeaders } from "@/lib/adminApi";
import { type RuthiePresentation, wantsVisualResult } from "@/lib/ruthiePresentation";
import {
  RUTHIE_CHAT_STORAGE_KEY,
  RUTHIE_VOICE_STORAGE_KEY,
  activeConversationId,
  readChatConversations,
} from "./ruthieUnifiedAgentClient";
import {
  RUTHIE_PRESENTATION_REQUEST_EVENT,
  type RuthiePresentationRequestDetail,
} from "./ruthiePresentationEvents";
import { RuthieResultSurface } from "./RuthieResultSurface";
import styles from "./RuthiePresentationBridge.module.css";

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt?: string;
};

type Props = {
  mode: "chat" | "voice";
  placement?: "legacy" | "experience";
};

type PendingPresentation = {
  id: string;
  text: string;
};

const DUPLICATE_WINDOW_MS = 2_500;

export function RuthiePresentationBridge({ mode, placement = "legacy" }: Props) {
  const [results, setResults] = useState<RuthiePresentation[]>([]);
  const [popup, setPopup] = useState<RuthiePresentation | null>(null);
  const [expanded, setExpanded] = useState<RuthiePresentation | null>(null);
  const [pending, setPending] = useState<PendingPresentation | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const processedRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Set<string>());
  const recentTextRef = useRef(new Map<string, number>());
  const activeAbortRef = useRef<AbortController | null>(null);
  const scopeRef = useRef("");
  const initializedRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer = 0;

    const attach = () => {
      if (disposed) return;
      if (placement === "experience") {
        const host = document.querySelector<HTMLElement>(`[data-ruthie-result-host="${mode}"]`);
        if (!host) {
          timer = window.setTimeout(attach, 100);
          return;
        }
        setPortalHost(host);
        return;
      }

      if (mode !== "chat") return;
      const target = document.querySelector<HTMLElement>('[aria-live="polite"]');
      if (!target) {
        timer = window.setTimeout(attach, 120);
        return;
      }
      let host = target.querySelector<HTMLElement>('[data-ruthie-presentation-host="true"]');
      if (!host) {
        host = document.createElement("div");
        host.dataset.ruthiePresentationHost = "true";
        target.appendChild(host);
      }
      setPortalHost(host);
    };

    attach();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [mode, placement]);

  useEffect(() => {
    if (placement !== "experience" || !portalHost) return;
    const empty = portalHost.querySelector<HTMLElement>("[data-ruthie-result-empty]");
    if (empty) empty.style.display = results.length || pending ? "none" : "";
  }, [pending, placement, portalHost, results.length]);

  useEffect(() => {
    let disposed = false;

    const requestPresentation = async (message: StoredMessage) => {
      const normalizedText = message.text.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
      if (!normalizedText || inFlightRef.current.has(message.id)) return;

      const requestTime = Date.now();
      const previousAt = recentTextRef.current.get(normalizedText) || 0;
      if (requestTime - previousAt < DUPLICATE_WINDOW_MS) return;
      recentTextRef.current.set(normalizedText, requestTime);
      for (const [key, requestedAt] of recentTextRef.current) {
        if (requestTime - requestedAt > 15_000) recentTextRef.current.delete(key);
      }

      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      inFlightRef.current.add(message.id);
      setPopup(null);
      setPending({ id: message.id, text: message.text });

      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/rosta-insight/presentation", {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ text: message.text }),
        });
        const payload = await response.json().catch(() => null) as {
          ok?: boolean;
          presentation?: RuthiePresentation | null;
        } | null;
        if (disposed || controller.signal.aborted || !response.ok || !payload?.ok || !payload.presentation) return;
        const presentation = payload.presentation;
        setResults((current) => [...current.filter((item) => item.id !== presentation.id), presentation].slice(-6));
        setPopup(presentation);
        window.setTimeout(() => portalHost?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 40);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      } finally {
        inFlightRef.current.delete(message.id);
        if (activeAbortRef.current === controller) activeAbortRef.current = null;
        if (!disposed) setPending((current) => current?.id === message.id ? null : current);
      }
    };

    const handleImmediateRequest = (event: Event) => {
      const detail = (event as CustomEvent<RuthiePresentationRequestDetail>).detail;
      if (!detail || detail.mode !== mode || !detail.id || !detail.text) return;
      processedRef.current.add(detail.id);
      void requestPresentation({ id: detail.id, role: "user", text: detail.text });
    };

    const scan = () => {
      const snapshot = readMessages(mode);
      if (!snapshot) return;
      const scopeChanged = initializedRef.current && scopeRef.current !== snapshot.scopeId;
      if (!initializedRef.current || scopeChanged) {
        initializedRef.current = true;
        scopeRef.current = snapshot.scopeId;
        processedRef.current = new Set(snapshot.messages.filter((message) => message.role === "user").map((message) => message.id));
        if (scopeChanged) {
          activeAbortRef.current?.abort();
          setResults([]);
          setPopup(null);
          setExpanded(null);
          setPending(null);
        }
        return;
      }

      for (const message of snapshot.messages) {
        if (message.role !== "user" || processedRef.current.has(message.id)) continue;
        processedRef.current.add(message.id);
        if (wantsVisualResult(message.text)) void requestPresentation(message);
      }
    };

    const timer = window.setInterval(scan, 420);
    scan();
    const storage = (event: StorageEvent) => {
      if (event.key === (mode === "chat" ? RUTHIE_CHAT_STORAGE_KEY : RUTHIE_VOICE_STORAGE_KEY)) scan();
    };
    window.addEventListener("storage", storage);
    window.addEventListener(RUTHIE_PRESENTATION_REQUEST_EVENT, handleImmediateRequest as EventListener);
    return () => {
      disposed = true;
      activeAbortRef.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener(RUTHIE_PRESENTATION_REQUEST_EVENT, handleImmediateRequest as EventListener);
    };
  }, [mode, portalHost]);

  const legacyInline = placement === "legacy" && mode === "chat" && portalHost && results.length
    ? createPortal(
        <div className={styles.portalStack}>
          {results.map((presentation) => (
            <article className={styles.message} key={presentation.id}>
              <span className={styles.avatar}><Sparkles /></span>
              <div className={styles.resultWrap}>
                <RuthieResultSurface presentation={presentation} variant="inline" onExpand={() => setPopup(presentation)} />
              </div>
            </article>
          ))}
        </div>,
        portalHost,
      )
    : null;

  const experienceInline = placement === "experience" && portalHost && !mobile
    ? createPortal(
        <div className={styles.experienceStack}>
          {pending ? (
            <section className={styles.experienceLoading} role="status" aria-live="polite">
              <LoaderCircle />
              <div><small>ROSTA INSIGHT CANLI SONUÇ</small><strong>Hemen getiriyorum</strong><p>{pending.text}</p></div>
              <button type="button" onClick={() => { activeAbortRef.current?.abort(); setPending(null); }} aria-label="Sonuç isteğini kapat"><X /></button>
            </section>
          ) : null}
          {[...results].reverse().slice(0, 3).map((presentation) => (
            <RuthieResultSurface key={presentation.id} presentation={presentation} variant="inline" onExpand={() => setExpanded(presentation)} />
          ))}
        </div>,
        portalHost,
      )
    : null;

  return (
    <>
      {legacyInline}
      {experienceInline}
      {pending && (placement === "legacy" || mobile) ? (
        <div className={styles.loadingLayer} role="status" aria-live="polite">
          <section className={styles.loadingPanel}>
            <header>
              <span><LoaderCircle /></span>
              <div><small>ROSTA INSIGHT CANLI SONUÇ</small><strong>Hemen getiriyorum</strong></div>
              <button type="button" onClick={() => { activeAbortRef.current?.abort(); setPending(null); }} aria-label="Sonuç isteğini kapat"><X /></button>
            </header>
            <p>{pending.text}</p>
            <div className={styles.loadingBars}><i /><i /><i /></div>
          </section>
        </div>
      ) : null}
      {popup && (placement === "legacy" || mobile) ? <RuthieResultSurface presentation={popup} onClose={() => setPopup(null)} /> : null}
      {expanded ? <RuthieResultSurface presentation={expanded} onClose={() => setExpanded(null)} /> : null}
    </>
  );
}

function readMessages(mode: "chat" | "voice"): { scopeId: string; messages: StoredMessage[] } | null {
  if (mode === "voice") {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(RUTHIE_VOICE_STORAGE_KEY) || "[]") as unknown;
      if (!Array.isArray(parsed)) return { scopeId: "voice", messages: [] };
      return { scopeId: "voice", messages: parsed.filter(isStoredMessage).slice(-80) };
    } catch {
      return { scopeId: "voice", messages: [] };
    }
  }

  const conversations = readChatConversations();
  const requestedId = activeConversationId();
  const conversation = conversations.find((item) => item.id === requestedId) || conversations[0];
  if (!conversation) return { scopeId: requestedId || "chat", messages: [] };
  return { scopeId: conversation.id, messages: conversation.messages.filter(isStoredMessage).slice(-80) };
}

function isStoredMessage(value: unknown): value is StoredMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<StoredMessage>;
  return typeof message.id === "string"
    && (message.role === "user" || message.role === "assistant")
    && typeof message.text === "string";
}
