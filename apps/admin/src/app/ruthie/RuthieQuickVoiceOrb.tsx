"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  acquireBackgroundInteractionLock,
  beginInteraction,
  endInteraction,
  type InteractionCandidate,
  type InteractionPointerType,
  moveInteraction,
} from "@ruth-commerce/ui";
import { adminAuthHeaders } from "@/lib/adminApi";
import { RuthieGradientOrb, type RuthieGradientOrbPhase } from "./RuthieGradientOrb";
import {
  RUTHIE_VOICE_STORAGE_KEY,
  activeConversationId,
  readChatConversations,
  writeChatConversations,
  type UnifiedClientMessage,
} from "./ruthieUnifiedAgentClient";
import { useRuthieRealtimeVision } from "./useRuthieRealtimeVision";
import styles from "./RuthieQuickVoiceOrb.module.css";

type ProviderStatus = {
  ok?: boolean;
  configured?: boolean;
  models?: { realtime?: string; transcription?: string };
  capabilities?: { realtimeVoice?: boolean };
};

type Transcript = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

type OrbPosition = { x: number; y: number };

type GestureState = {
  pointerId: number;
  pointerType: InteractionPointerType;
  interaction: InteractionCandidate;
  originX: number;
  originY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  startedAt: number;
  velocityX: number;
  velocityY: number;
  listeningAtStart: boolean;
  releaseBackgroundLock: (() => void) | null;
};

type ActivationWave = {
  id: number;
  x: number;
  y: number;
  diameter: number;
  scale: number;
};

const MAX_MESSAGES = 80;
const DESKTOP_DRAG_THRESHOLD = 16;
const MOBILE_DRAG_THRESHOLD = 8;
const MOBILE_HOLD_TO_TALK_DELAY_MS = 220;
const TAP_TOGGLE_MAX_MS = 360;
const DESKTOP_ORB_SIZE = 150;
const MOBILE_ORB_SIZE = 132;
const VIEWPORT_MARGIN = 12;
const MAX_ELASTIC_OVERSHOOT = 42;
const POSITION_KEY_PREFIX = "ruthie.quickVoice.position.v1";
const GREETING_DELAY_MS = 1320;

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function interactionPointerType(value: string): InteractionPointerType {
  if (value === "touch" || value === "pen") return value;
  return "mouse";
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function currentOrbSize() {
  return isMobileViewport() ? MOBILE_ORB_SIZE : DESKTOP_ORB_SIZE;
}

function positionStorageKey() {
  return `${POSITION_KEY_PREFIX}.${isMobileViewport() ? "mobile" : "desktop"}`;
}

function positionBounds() {
  const size = currentOrbSize();
  return {
    minX: VIEWPORT_MARGIN,
    minY: VIEWPORT_MARGIN,
    maxX: Math.max(VIEWPORT_MARGIN, window.innerWidth - size - VIEWPORT_MARGIN),
    maxY: Math.max(VIEWPORT_MARGIN, window.innerHeight - size - VIEWPORT_MARGIN),
  };
}

function clampPosition(position: OrbPosition): OrbPosition {
  const bounds = positionBounds();
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, position.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, position.y)),
  };
}

function rubberBandAxis(value: number, min: number, max: number) {
  if (value < min) return min - Math.min(MAX_ELASTIC_OVERSHOOT, (min - value) * 0.28);
  if (value > max) return max + Math.min(MAX_ELASTIC_OVERSHOOT, (value - max) * 0.28);
  return value;
}

function rubberBandPosition(position: OrbPosition): OrbPosition {
  const bounds = positionBounds();
  return {
    x: rubberBandAxis(position.x, bounds.minX, bounds.maxX),
    y: rubberBandAxis(position.y, bounds.minY, bounds.maxY),
  };
}

function readStoredPosition(): OrbPosition | null {
  try {
    const raw = window.localStorage.getItem(positionStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OrbPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return clampPosition({ x: parsed.x, y: parsed.y });
  } catch {
    return null;
  }
}

function savePosition(position: OrbPosition) {
  try {
    window.localStorage.setItem(positionStorageKey(), JSON.stringify(clampPosition(position)));
  } catch {
    // Dragging remains available when browser storage is unavailable.
  }
}

function defaultPosition(): OrbPosition {
  const size = currentOrbSize();
  const anchor = document.querySelector<HTMLElement>(
    '[data-exact-base44-page="overview"] a[href="/ruthie"]',
  );

  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    if (isMobileViewport()) {
      return clampPosition({
        x: window.innerWidth - size - 16,
        y: rect.bottom + 14,
      });
    }

    const rightCandidate = rect.right + 18;
    const x = rightCandidate + size <= window.innerWidth - VIEWPORT_MARGIN
      ? rightCandidate
      : rect.left - size - 18;
    return clampPosition({
      x,
      y: rect.top + (rect.height - size) / 2,
    });
  }

  return clampPosition({
    x: window.innerWidth - size - 22,
    y: isMobileViewport() ? 112 : 72,
  });
}

function loadTranscripts(): Transcript[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RUTHIE_VOICE_STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Transcript => Boolean(
      item && typeof item === "object"
      && ((item as Transcript).role === "user" || (item as Transcript).role === "assistant")
      && typeof (item as Transcript).text === "string"
      && typeof (item as Transcript).createdAt === "string",
    )).slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function mirrorVoiceIntoActiveChat(item: Transcript) {
  try {
    const conversations = readChatConversations();
    const id = activeConversationId();
    const index = conversations.findIndex((conversation) => conversation.id === id);
    if (index < 0) return;
    const target = conversations[index];
    const duplicate = target.messages.some((message) => (
      message.id === item.id
      || (message.role === item.role && message.text.trim() === item.text.trim())
    ));
    if (duplicate) return;

    const message: UnifiedClientMessage = { ...item, surface: "voice" };
    const next = [...conversations];
    next[index] = {
      ...target,
      updatedAt: item.createdAt,
      messages: [...target.messages, message].slice(-MAX_MESSAGES),
    };
    writeChatConversations(next);
  } catch {
    // Quick voice keeps working even when local chat memory is unavailable.
  }
}

export function RuthieQuickVoiceOrb() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [portalReady, setPortalReady] = useState(false);
  const [positionReady, setPositionReady] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [listeningLatched, setListeningLatched] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [gliding, setGliding] = useState(false);
  const [activationWave, setActivationWave] = useState<ActivationWave | null>(null);

  const positionLayerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const pressedRef = useRef(false);
  const listeningLatchedRef = useRef(false);
  const draggingRef = useRef(false);
  const positionRef = useRef<OrbPosition | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const waveTimerRef = useRef<number | null>(null);
  const touchHoldTimerRef = useRef<number | null>(null);
  const greetingTimerRef = useRef<number | null>(null);
  const activationAudioContextRef = useRef<AudioContext | null>(null);
  const viewportWidthRef = useRef<number | null>(null);
  const suppressResizeUntilRef = useRef(0);

  const applyPosition = useCallback((next: OrbPosition) => {
    positionRef.current = next;
    const layer = positionLayerRef.current;
    if (!layer) return;
    layer.style.setProperty("--orb-x", `${next.x.toFixed(2)}px`);
    layer.style.setProperty("--orb-y", `${next.y.toFixed(2)}px`);
  }, []);

  const resetMotionVisual = useCallback(() => {
    const element = buttonRef.current;
    if (!element) return;
    element.style.setProperty("--motion-angle", "0deg");
    element.style.setProperty("--motion-stretch", "1");
    element.style.setProperty("--motion-squash", "1");
  }, []);

  const updateMotionVisual = useCallback((velocityX: number, velocityY: number) => {
    const element = buttonRef.current;
    if (!element) return;
    const speed = Math.min(3, Math.hypot(velocityX, velocityY));
    if (speed < 0.02) {
      resetMotionVisual();
      return;
    }
    const angle = Math.atan2(velocityY, velocityX) * 180 / Math.PI;
    const stretch = 1 + Math.min(0.135, speed * 0.046);
    const squash = 1 - Math.min(0.072, speed * 0.024);
    element.style.setProperty("--motion-angle", `${angle.toFixed(2)}deg`);
    element.style.setProperty("--motion-stretch", stretch.toFixed(4));
    element.style.setProperty("--motion-squash", squash.toFixed(4));
  }, [resetMotionVisual]);

  const stopInertia = useCallback((settle = false) => {
    if (inertiaFrameRef.current !== null) {
      window.cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
    setGliding(false);
    if (settle && positionRef.current) {
      const next = clampPosition(positionRef.current);
      applyPosition(next);
      savePosition(next);
    }
    window.requestAnimationFrame(resetMotionVisual);
  }, [applyPosition, resetMotionVisual]);

  const startInertia = useCallback((initialVelocityX: number, initialVelocityY: number) => {
    const initial = positionRef.current;
    if (!initial) return;

    if (inertiaFrameRef.current !== null) {
      window.cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }

    const maxVelocity = 2.65;
    let velocityX = Math.max(-maxVelocity, Math.min(maxVelocity, initialVelocityX));
    let velocityY = Math.max(-maxVelocity, Math.min(maxVelocity, initialVelocityY));
    let current = { ...initial };

    if (Math.hypot(velocityX, velocityY) < 0.075) {
      const next = clampPosition(current);
      applyPosition(next);
      savePosition(next);
      setGliding(false);
      window.requestAnimationFrame(resetMotionVisual);
      return;
    }

    setGliding(true);
    let previousTime = performance.now();
    let elapsed = 0;

    const tick = (time: number) => {
      const dt = Math.min(34, Math.max(1, time - previousTime));
      previousTime = time;
      elapsed += dt;

      let nextX = current.x + velocityX * dt * 1.08;
      let nextY = current.y + velocityY * dt * 1.08;
      const bounds = positionBounds();
      const outsideX = nextX < bounds.minX || nextX > bounds.maxX;
      const outsideY = nextY < bounds.minY || nextY > bounds.maxY;

      if (nextX < bounds.minX) velocityX += (bounds.minX - nextX) * 0.00175 * dt;
      else if (nextX > bounds.maxX) velocityX -= (nextX - bounds.maxX) * 0.00175 * dt;

      if (nextY < bounds.minY) velocityY += (bounds.minY - nextY) * 0.00175 * dt;
      else if (nextY > bounds.maxY) velocityY -= (nextY - bounds.maxY) * 0.00175 * dt;

      nextX = Math.min(bounds.maxX + MAX_ELASTIC_OVERSHOOT, Math.max(bounds.minX - MAX_ELASTIC_OVERSHOOT, nextX));
      nextY = Math.min(bounds.maxY + MAX_ELASTIC_OVERSHOOT, Math.max(bounds.minY - MAX_ELASTIC_OVERSHOOT, nextY));

      const frictionPerFrame = outsideX || outsideY ? 0.865 : 0.946;
      const friction = Math.pow(frictionPerFrame, dt / 16.667);
      velocityX *= friction;
      velocityY *= friction;

      current = { x: nextX, y: nextY };
      applyPosition(current);
      updateMotionVisual(velocityX, velocityY);

      const clamped = clampPosition(current);
      const edgeDistance = Math.hypot(clamped.x - current.x, clamped.y - current.y);
      const speed = Math.hypot(velocityX, velocityY);
      const finished = (speed < 0.018 && edgeDistance < 0.7) || elapsed > 2200;

      if (finished) {
        const finalPosition = clampPosition(current);
        applyPosition(finalPosition);
        savePosition(finalPosition);
        inertiaFrameRef.current = null;
        setGliding(false);
        window.requestAnimationFrame(resetMotionVisual);
        return;
      }

      inertiaFrameRef.current = window.requestAnimationFrame(tick);
    };

    inertiaFrameRef.current = window.requestAnimationFrame(tick);
  }, [applyPosition, resetMotionVisual, updateMotionVisual]);

  const playActivationSound = useCallback(() => {
    // Intentionally silent. The only audible activation feedback is Ruthie's greeting.
  }, []);

  const speakActivationGreeting = useCallback(() => {
    if (!("speechSynthesis" in window) || !listeningLatchedRef.current) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance("Buradayım. Nasıl yardımcı olabilirim?");
      const voices = window.speechSynthesis.getVoices();
      const turkishVoice = voices.find((voice) => voice.lang.toLocaleLowerCase().startsWith("tr"));
      if (turkishVoice) utterance.voice = turkishVoice;
      utterance.lang = turkishVoice?.lang || "tr-TR";
      utterance.rate = 0.96;
      utterance.pitch = 1.02;
      utterance.volume = 0.92;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Greeting is decorative; realtime voice remains usable without it.
    }
  }, []);

  const triggerActivationWave = useCallback(() => {
    const position = positionRef.current;
    if (!position) return;
    const size = currentOrbSize();
    const x = position.x + size / 2;
    const y = position.y + size / 2;
    const farX = Math.max(x, window.innerWidth - x);
    const farY = Math.max(y, window.innerHeight - y);
    const farthestRadius = Math.hypot(farX, farY) + 96;
    const diameter = size * 0.72;
    const scale = Math.max(1, (farthestRadius * 2) / diameter);

    setActivationWave({ id: Date.now(), x, y, diameter, scale });
    if (waveTimerRef.current !== null) window.clearTimeout(waveTimerRef.current);
    waveTimerRef.current = window.setTimeout(() => setActivationWave(null), 2300);
  }, []);

  useEffect(() => {
    setPortalReady(true);
    return () => {
      gestureRef.current?.releaseBackgroundLock?.();
      gestureRef.current = null;
      if (waveTimerRef.current !== null) window.clearTimeout(waveTimerRef.current);
      if (touchHoldTimerRef.current !== null) window.clearTimeout(touchHoldTimerRef.current);
      if (greetingTimerRef.current !== null) window.clearTimeout(greetingTimerRef.current);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      const audioContext = activationAudioContextRef.current;
      if (audioContext && audioContext.state !== "closed") void audioContext.close();
    };
  }, []);

  useEffect(() => {
    if (!portalReady) return;

    setTranscripts(loadTranscripts());
    viewportWidthRef.current = window.innerWidth;

    const frame = window.requestAnimationFrame(() => {
      applyPosition(readStoredPosition() || defaultPosition());
      setPositionReady(true);
    });

    const onResize = () => {
      const now = performance.now();
      const previousWidth = viewportWidthRef.current ?? window.innerWidth;
      const nextWidth = window.innerWidth;
      const widthChanged = Math.abs(nextWidth - previousWidth) >= 24;

      if (pressedRef.current || draggingRef.current || now < suppressResizeUntilRef.current || !widthChanged) {
        return;
      }

      viewportWidthRef.current = nextWidth;
      if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => {
        if (pressedRef.current || draggingRef.current) return;
        stopInertia(false);
        const next = positionRef.current
          ? clampPosition(positionRef.current)
          : (readStoredPosition() || defaultPosition());
        applyPosition(next);
        savePosition(next);
        resetMotionVisual();
      }, 120);
    };

    window.addEventListener("resize", onResize, { passive: true });

    void (async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/rosta-insight/openai/status", { headers, cache: "no-store" });
        const payload = await response.json() as ProviderStatus;
        setStatus(payload);
      } catch {
        setStatus({ ok: false, configured: false });
      }
    })();

    return () => {
      window.cancelAnimationFrame(frame);
      if (inertiaFrameRef.current !== null) window.cancelAnimationFrame(inertiaFrameRef.current);
      if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [applyPosition, portalReady, resetMotionVisual, stopInertia]);

  const voiceReady = Boolean(status?.configured && status.capabilities?.realtimeVoice);

  const conversationContext = useCallback(() => {
    const chats = readChatConversations();
    const requested = activeConversationId();
    const currentChat = chats.find((conversation) => conversation.id === requested) || chats[0];
    const chatContext = currentChat?.messages.slice(-14) || [];
    const voiceContext = transcripts.slice(-18);
    return [...chatContext, ...voiceContext]
      .map((item) => `${item.role === "user" ? "Kullanıcı" : "ROSTA Insight"}: ${item.text}`)
      .join("\n")
      .slice(-18_000);
  }, [transcripts]);

  const realtime = useRuthieRealtimeVision({
    enabled: voiceReady,
    conversationContext,
    model: status?.models?.realtime,
    transcriptionModel: status?.models?.transcription,
    onMessage: (message) => {
      const item: Transcript = {
        id: uid(),
        role: message.role,
        text: message.text,
        createdAt: new Date().toISOString(),
      };
      setTranscripts((current) => {
        const next = [...current, item].slice(-MAX_MESSAGES);
        try { window.localStorage.setItem(RUTHIE_VOICE_STORAGE_KEY, JSON.stringify(next)); }
        catch { /* local memory is optional */ }
        return next;
      });
      mirrorVoiceIntoActiveChat(item);
    },
  });

  const setMicrophoneEnabled = useCallback((enabled: boolean) => {
    realtime.microphoneStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, [realtime.microphoneStream]);

  const ensureConnection = useCallback(() => {
    if (!voiceReady || realtime.connected || realtime.phase === "connecting") return;
    if (realtime.phase === "error") void realtime.retry();
    else void realtime.start();
  }, [realtime.connected, realtime.phase, realtime.retry, realtime.start, voiceReady]);

  const beginTalk = useCallback(() => {
    const lockedPosition = positionRef.current;
    stopInertia(false);
    resetMotionVisual();
    if (lockedPosition) applyPosition(lockedPosition);

    suppressResizeUntilRef.current = performance.now() + 2200;
    pressedRef.current = true;
    draggingRef.current = false;
    setPressed(true);
    setDragging(false);
    setMicrophoneEnabled(true);
    ensureConnection();
  }, [applyPosition, ensureConnection, resetMotionVisual, setMicrophoneEnabled, stopInertia]);

  const endTalk = useCallback(() => {
    pressedRef.current = false;
    setPressed(false);
    setMicrophoneEnabled(listeningLatchedRef.current);
    suppressResizeUntilRef.current = performance.now() + 350;
  }, [setMicrophoneEnabled]);

  const activateLatchedListening = useCallback(() => {
    listeningLatchedRef.current = true;
    setListeningLatched(true);
    pressedRef.current = false;
    setPressed(false);
    setMicrophoneEnabled(true);
    ensureConnection();
    suppressResizeUntilRef.current = performance.now() + 2200;
    triggerActivationWave();
    playActivationSound();
    if (greetingTimerRef.current !== null) window.clearTimeout(greetingTimerRef.current);
    greetingTimerRef.current = window.setTimeout(() => {
      greetingTimerRef.current = null;
      speakActivationGreeting();
    }, GREETING_DELAY_MS);
  }, [ensureConnection, playActivationSound, setMicrophoneEnabled, speakActivationGreeting, triggerActivationWave]);

  const deactivateLatchedListening = useCallback(() => {
    listeningLatchedRef.current = false;
    setListeningLatched(false);
    pressedRef.current = false;
    setPressed(false);
    if (greetingTimerRef.current !== null) {
      window.clearTimeout(greetingTimerRef.current);
      greetingTimerRef.current = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setMicrophoneEnabled(false);
    suppressResizeUntilRef.current = performance.now() + 350;
    realtime.end();
  }, [realtime.end, setMicrophoneEnabled]);

  useEffect(() => {
    const shouldListen = (pressed || listeningLatched) && !dragging;
    realtime.microphoneStream?.getAudioTracks().forEach((track) => {
      track.enabled = shouldListen;
    });
  }, [dragging, listeningLatched, pressed, realtime.microphoneStream]);

  useEffect(() => {
    const shouldListen = (pressed || listeningLatched) && !dragging;
    if (shouldListen && voiceReady && !realtime.connected && realtime.phase !== "connecting") {
      ensureConnection();
    }
  }, [dragging, ensureConnection, listeningLatched, pressed, realtime.connected, realtime.phase, voiceReady]);

  useEffect(() => {
    if (!realtime.connected) return;
    realtime.microphoneStream?.getAudioTracks().forEach((track) => {
      track.enabled = (pressedRef.current || listeningLatchedRef.current) && !draggingRef.current;
    });
  }, [realtime.connected, realtime.microphoneStream]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const currentPosition = positionRef.current;
    if (!currentPosition) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const now = performance.now();
    const pointerType = interactionPointerType(event.pointerType);
    const listeningAtStart = listeningLatchedRef.current;
    gestureRef.current = {
      pointerId: event.pointerId,
      pointerType,
      interaction: beginInteraction({
        pointerType,
        x: event.clientX,
        y: event.clientY,
        at: now,
        startedOnHandle: true,
      }),
      originX: currentPosition.x,
      originY: currentPosition.y,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: now,
      startedAt: now,
      velocityX: 0,
      velocityY: 0,
      listeningAtStart,
      releaseBackgroundLock: pointerType === "touch" || pointerType === "pen"
        ? acquireBackgroundInteractionLock()
        : null,
    };

    if (touchHoldTimerRef.current !== null) {
      window.clearTimeout(touchHoldTimerRef.current);
      touchHoldTimerRef.current = null;
    }

    if (listeningAtStart) {
      stopInertia(false);
      resetMotionVisual();
      suppressResizeUntilRef.current = performance.now() + 2200;
      pressedRef.current = true;
      setPressed(true);
    } else if (pointerType === "touch") {
      stopInertia(false);
      resetMotionVisual();
      applyPosition(currentPosition);
      suppressResizeUntilRef.current = performance.now() + 2200;
      touchHoldTimerRef.current = window.setTimeout(() => {
        touchHoldTimerRef.current = null;
        const activeGesture = gestureRef.current;
        if (!activeGesture || activeGesture.pointerId !== event.pointerId || activeGesture.interaction.phase !== "candidate") return;
        beginTalk();
      }, MOBILE_HOLD_TO_TALK_DELAY_MS);
    } else {
      beginTalk();
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const now = performance.now();
    const dt = Math.max(1, Math.min(80, now - gesture.lastTime));
    const instantVelocityX = (event.clientX - gesture.lastX) / dt;
    const instantVelocityY = (event.clientY - gesture.lastY) / dt;
    gesture.velocityX = gesture.velocityX * 0.42 + instantVelocityX * 0.58;
    gesture.velocityY = gesture.velocityY * 0.42 + instantVelocityY * 0.58;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    gesture.lastTime = now;

    const wasDragging = gesture.interaction.phase === "custom-drag";
    const resolution = moveInteraction(
      gesture.interaction,
      { x: event.clientX, y: event.clientY, at: now },
      {
        axis: "both",
        customDrag: true,
        touchDragHoldMs: 0,
        dragThresholdPx: gesture.pointerType === "touch" ? MOBILE_DRAG_THRESHOLD : DESKTOP_DRAG_THRESHOLD,
      },
    );

    if (resolution.phase !== "custom-drag") return;

    if (!wasDragging) {
      if (touchHoldTimerRef.current !== null) {
        window.clearTimeout(touchHoldTimerRef.current);
        touchHoldTimerRef.current = null;
      }
      draggingRef.current = true;
      pressedRef.current = false;
      setDragging(true);
      setPressed(false);
      setMicrophoneEnabled(gesture.listeningAtStart);
    }

    event.preventDefault();
    const next = rubberBandPosition({
      x: gesture.originX + resolution.deltaX,
      y: gesture.originY + resolution.deltaY,
    });
    applyPosition(next);
    updateMotionVisual(gesture.velocityX, gesture.velocityY);
  };

  const finishPointerGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    if (touchHoldTimerRef.current !== null) {
      window.clearTimeout(touchHoldTimerRef.current);
      touchHoldTimerRef.current = null;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const cancelled = event.type === "pointercancel";
    const resolution = cancelled
      ? { phase: "cancelled" as const }
      : endInteraction(
          gesture.interaction,
          { x: event.clientX, y: event.clientY, at: performance.now() },
          {
            axis: "both",
            customDrag: true,
            touchDragHoldMs: 0,
            dragThresholdPx: gesture.pointerType === "touch" ? MOBILE_DRAG_THRESHOLD : DESKTOP_DRAG_THRESHOLD,
          },
        );
    const wasDragging = gesture.interaction.phase === "custom-drag" || draggingRef.current;

    if (wasDragging) {
      draggingRef.current = false;
      setDragging(false);
      pressedRef.current = false;
      setPressed(false);
      setMicrophoneEnabled(listeningLatchedRef.current);
      suppressResizeUntilRef.current = performance.now() + 350;

      if (cancelled) stopInertia(true);
      else startInertia(gesture.velocityX, gesture.velocityY);
    } else if (cancelled) {
      endTalk();
    } else {
      const heldFor = performance.now() - gesture.startedAt;
      if (resolution.phase === "tap" && heldFor <= TAP_TOGGLE_MAX_MS) {
        if (gesture.listeningAtStart) deactivateLatchedListening();
        else activateLatchedListening();
      } else if (gesture.listeningAtStart) {
        pressedRef.current = false;
        setPressed(false);
        setMicrophoneEnabled(true);
      } else {
        endTalk();
      }
    }

    gesture.releaseBackgroundLock?.();
    gestureRef.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === " " || event.key === "Enter") && !pressedRef.current) {
      event.preventDefault();
      if (listeningLatchedRef.current) {
        pressedRef.current = true;
        setPressed(true);
      } else {
        beginTalk();
      }
    }
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (listeningLatchedRef.current) deactivateLatchedListening();
    else activateLatchedListening();
  };

  const activelyListening = (pressed || listeningLatched) && !dragging;

  const visualPhase: RuthieGradientOrbPhase = status === null
    ? "connecting"
    : !voiceReady
      ? "error"
      : dragging || gliding
        ? "idle"
        : realtime.phase === "error"
          ? "error"
          : realtime.phase === "thinking" || realtime.phase === "acting" || realtime.phase === "speaking"
            ? realtime.phase
            : activelyListening
              ? "listening"
              : realtime.phase === "connecting"
                ? "connecting"
                : "idle";

  const ariaLabel = dragging || gliding
    ? "ROSTA Insight küresi hareket ediyor"
    : realtime.phase === "speaking"
      ? "ROSTA Insight konuşuyor"
      : realtime.phase === "thinking" || realtime.phase === "acting"
        ? "ROSTA Insight düşünüyor"
        : activelyListening
          ? "ROSTA Insight dinliyor; kapatmak için bir kez dokun"
          : "ROSTA Insight sesli modu açmak için dokun; basılı tutarak da konuşabilirsin";

  if (!portalReady) return null;

  const waveStyle = activationWave ? ({
    "--wave-x": `${activationWave.x}px`,
    "--wave-y": `${activationWave.y}px`,
    "--wave-diameter": `${activationWave.diameter}px`,
    "--wave-scale": activationWave.scale.toFixed(3),
  } as CSSProperties) : undefined;

  return createPortal(
    <>
      {activationWave ? (
        <div key={activationWave.id} className={styles.activationWave} style={waveStyle} aria-hidden="true">
          <span className={`${styles.waveRing} ${styles.waveRingPrimary}`} />
          <span className={`${styles.waveRing} ${styles.waveRingSecondary}`} />
          <span className={`${styles.waveRing} ${styles.waveRingTertiary}`} />
          <span className={styles.waveLens} />
        </div>
      ) : null}

      <div
        ref={positionLayerRef}
        className={styles.positionLayer}
        data-ready={positionReady ? "true" : "false"}
      >
        <button
          ref={buttonRef}
          type="button"
          className={styles.root}
          data-pressed={pressed ? "true" : "false"}
          data-listening={activelyListening ? "true" : "false"}
          data-dragging={dragging ? "true" : "false"}
          data-gliding={gliding ? "true" : "false"}
          data-phase={visualPhase}
          aria-label={ariaLabel}
          aria-pressed={activelyListening}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointerGesture}
          onPointerCancel={finishPointerGesture}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => event.preventDefault()}
        >
          <span className={styles.motionShell} aria-hidden="true">
            <RuthieGradientOrb
              phase={visualPhase}
              inputStream={realtime.microphoneStream}
              outputStream={realtime.assistantStream}
              compact
              className={styles.orb}
            />
          </span>
        </button>
      </div>
    </>,
    document.body,
  );
}
