"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Send, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { RuthieBrandIcon } from "@/components/RuthieBrandIcon";

type ChatMessage = { role: "user" | "assistant"; text: string };
type ProviderStatus = { ok?: boolean; configured?: boolean; capabilities?: { chat?: boolean } };
type ChatPayload = { ok?: boolean; response?: { text?: string }; error?: { message?: string } };

function correlationId() {
  return globalThis.crypto?.randomUUID?.() || `ruthie-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AdminRuthieQuickChatV2() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const findHeader = () => {
      const next = document.querySelector<HTMLElement>("header.z-header");
      setHeaderTarget((current) => current === next ? current : next);
    };
    findHeader();
    const observer = new MutationObserver(findHeader);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
    setReply(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) collapse();
    };
    document.addEventListener("pointerdown", onPointer);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.clearTimeout(timer);
    };
  }, [collapse, expanded]);

  const send = useCallback(async () => {
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
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "x-correlation-id": correlationId(),
        },
        body: JSON.stringify({ messages: outgoing }),
      });
      const payload = await response.json().catch(() => null) as ChatPayload | null;
      const textResponse = payload?.response?.text?.trim();
      if (!response.ok || !payload?.ok || !textResponse) throw new Error(payload?.error?.message || "Ruthie yanıt veremedi.");
      historyRef.current = [...outgoing, { role: "assistant" as const, text: textResponse }].slice(-16);
      setReply(textResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ruthie yanıt veremedi.");
    } finally {
      setSending(false);
    }
  }, [message, providerReady, sending]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void send();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      collapse();
    }
  };

  if (!headerTarget) return null;

  return createPortal(
    <>
      <motion.div
        ref={rootRef}
        data-ruthie-quick-chat-v2="true"
        className="ruthie-quick-v2"
        animate={{ width: expanded ? "min(350px, calc(100vw - 24px))" : 54 }}
        transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.72 }}
      >
        <motion.button
          type="button"
          className="ruthie-quick-v2__bot"
          onClick={() => setExpanded((value) => !value)}
          whileTap={{ scale: 0.9 }}
          aria-label={expanded ? "Ruthie hızlı sohbeti kapat" : "Ruthie hızlı sohbeti aç"}
          aria-expanded={expanded}
        >
          <span className="ruthie-quick-v2__halo" aria-hidden="true" />
          <RuthieBrandIcon size={27} strokeWidth={1.85} />
          <span className={providerReady ? "is-online" : "is-offline"} />
        </motion.button>

        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              className="ruthie-quick-v2__composer"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.14 }}
            >
              <input
                ref={inputRef}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={providerReady ? "Ruthie'ye yaz..." : "Ruthie hazırlanıyor..."}
                disabled={!providerReady || sending}
                autoComplete="off"
              />
              <button type="button" onClick={() => void send()} disabled={!providerReady || !message.trim() || sending} aria-label="Ruthie'ye gönder">
                <Send size={17} />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {expanded && (sending || reply || error) ? (
            <motion.div
              className="ruthie-quick-v2__reply"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
            >
              <div><RuthieBrandIcon size={16} /><strong>Ruthie</strong><button type="button" onClick={() => { setReply(null); setError(null); }} aria-label="Yanıtı kapat"><X size={14} /></button></div>
              {sending ? <p>Yazıyor…</p> : null}
              {reply ? <p>{reply}</p> : null}
              {error ? <p className="is-error">{error}</p> : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>

      <style>{`
        .ruthie-quick-v2 { display:none; }
        @media (max-width: 1023px) {
          .ruthie-quick-v2 {
            position: absolute;
            left: 12px;
            top: calc(max(env(safe-area-inset-top), 28px) + 12px);
            z-index: 1;
            height: 54px;
            display: flex;
            align-items: center;
            overflow: visible;
            border: 1px solid color-mix(in srgb, hsl(var(--accent)) 20%, hsl(var(--border-subtle)));
            border-radius: 27px;
            background: hsl(var(--surface-primary) / .96);
            box-shadow: 0 10px 30px rgba(28, 25, 55, .13), 0 0 0 1px rgba(255,255,255,.76) inset;
            backdrop-filter: blur(18px) saturate(1.3);
            -webkit-backdrop-filter: blur(18px) saturate(1.3);
          }
          .ruthie-quick-v2__bot {
            position: relative;
            isolation:isolate;
            width: 54px;
            height: 54px;
            flex: 0 0 54px;
            border: 0;
            border-radius: 50%;
            display: grid;
            place-items: center;
            color: hsl(var(--accent));
            background: radial-gradient(circle at 38% 30%, rgba(255,255,255,.98) 0 24%, color-mix(in srgb, hsl(var(--accent)) 8%, white) 58%, hsl(var(--surface-primary)) 100%);
            touch-action: manipulation;
            overflow:hidden;
          }
          .ruthie-quick-v2__bot::before {
            content:"";
            position:absolute;
            inset:5px;
            z-index:-1;
            border-radius:50%;
            border:1px solid color-mix(in srgb, hsl(var(--accent)) 32%, transparent);
            box-shadow:inset 0 0 13px color-mix(in srgb, hsl(var(--accent)) 12%, transparent);
          }
          .ruthie-quick-v2__halo {
            position:absolute !important;
            inset:2px !important;
            width:auto !important;
            height:auto !important;
            border:0 !important;
            border-radius:50% !important;
            background:conic-gradient(from 220deg, transparent 0 24%, color-mix(in srgb, hsl(var(--accent)) 64%, transparent) 38%, transparent 53%, color-mix(in srgb, #ef9fd1 55%, transparent) 72%, transparent 88%) !important;
            opacity:.34;
            -webkit-mask:radial-gradient(circle, transparent 66%, #000 68%);
            mask:radial-gradient(circle, transparent 66%, #000 68%);
            pointer-events:none;
          }
          .ruthie-quick-v2__bot > span.is-online,
          .ruthie-quick-v2__bot > span.is-offline {
            position:absolute;
            right:6px;
            bottom:6px;
            width:9px;
            height:9px;
            border-radius:50%;
            border:2px solid hsl(var(--surface-primary));
            z-index:3;
          }
          .ruthie-quick-v2__bot > span.is-online { background:#20bf79; }
          .ruthie-quick-v2__bot > span.is-offline { background:#a8adb8; }
          .ruthie-quick-v2__composer {
            min-width: 0;
            flex: 1;
            display:flex;
            align-items:center;
            gap:6px;
            padding-right:7px;
          }
          .ruthie-quick-v2__composer input {
            min-width:0;
            flex:1;
            height:38px;
            border:0;
            outline:0;
            padding:0 8px;
            color:hsl(var(--text-main));
            background:transparent;
            font-size:16px;
          }
          .ruthie-quick-v2__composer > button {
            width:34px;
            height:34px;
            flex:0 0 34px;
            border:0;
            border-radius:50%;
            display:grid;
            place-items:center;
            background:hsl(var(--accent));
            color:white;
          }
          .ruthie-quick-v2__composer > button:disabled { opacity:.35; }
          .ruthie-quick-v2__reply {
            position:absolute;
            left:0;
            top:62px;
            width:min(350px,calc(100vw - 24px));
            padding:10px 12px;
            border:1px solid hsl(var(--border-subtle));
            border-radius:16px;
            background:hsl(var(--surface-primary) / .98);
            box-shadow:0 14px 40px rgba(25,28,42,.16);
            backdrop-filter:blur(18px);
          }
          .ruthie-quick-v2__reply > div { display:flex;align-items:center;gap:6px;color:hsl(var(--accent));font-size:12px; }
          .ruthie-quick-v2__reply > div button { margin-left:auto;border:0;background:transparent;color:hsl(var(--text-muted)); }
          .ruthie-quick-v2__reply p { margin:7px 0 0;color:hsl(var(--text-main));font-size:12px;line-height:1.45; }
          .ruthie-quick-v2__reply p.is-error { color:hsl(var(--danger)); }
          [data-exact-workspace-layer] ~ .ruthie-quick-v2,
          body:has([data-exact-workspace-layer]) .ruthie-quick-v2 { opacity:0; pointer-events:none; }
        }
      `}</style>
    </>,
    headerTarget,
  );
}
