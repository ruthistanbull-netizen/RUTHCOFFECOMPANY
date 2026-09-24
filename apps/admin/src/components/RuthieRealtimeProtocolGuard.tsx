"use client";

import { useEffect } from "react";

let consumers = 0;
let originalSend: RTCDataChannel["send"] | null = null;
let patchedSend: RTCDataChannel["send"] | null = null;

const CUSTOMER_ORDER_RULE = [
  "Müşteri adına göre sipariş istendiğinde customers.search değil orders.search kullan.",
  "Müşteri adını query.q alanına yaz; query.payment='all' ve query.range='all' gönder.",
  "Örneğin Görkem Çirik'in siparişleri için action='orders.search', query={q:'Görkem Çirik',payment:'all',range:'all'} kullan.",
].join(" ");

type RealtimeClientEvent = {
  type?: unknown;
  session?: Record<string, unknown>;
};

function hardenSession(session: Record<string, unknown>) {
  const currentInstructions = typeof session.instructions === "string" ? session.instructions.trim() : "";
  const instructions = currentInstructions.includes("query.payment='all'")
    ? currentInstructions
    : [currentInstructions, CUSTOMER_ORDER_RULE].filter(Boolean).join(" ");

  const tools = Array.isArray(session.tools)
    ? session.tools.map((tool) => {
        if (!tool || typeof tool !== "object" || Array.isArray(tool)) return tool;
        const entry = tool as Record<string, unknown>;
        if (entry.name !== "ruthie_admin") return tool;
        const description = typeof entry.description === "string" ? entry.description : "";
        return {
          ...entry,
          description: description.includes("query.payment='all'")
            ? description
            : [description, CUSTOMER_ORDER_RULE].filter(Boolean).join(" "),
        };
      })
    : session.tools;

  return {
    type: "realtime",
    ...session,
    instructions,
    ...(tools ? { tools } : {}),
  };
}

function installProtocolGuard() {
  if (typeof RTCDataChannel === "undefined" || patchedSend) return;

  originalSend = RTCDataChannel.prototype.send;
  const original = originalSend as (this: RTCDataChannel, data: string | Blob | ArrayBuffer | ArrayBufferView) => void;

  patchedSend = function patchedRuthieSend(
    this: RTCDataChannel,
    data: string | Blob | ArrayBuffer | ArrayBufferView,
  ) {
    let nextData = data;

    if (typeof data === "string") {
      try {
        const event = JSON.parse(data) as RealtimeClientEvent;
        if (event?.type === "session.update" && event.session) {
          nextData = JSON.stringify({
            ...event,
            session: hardenSession(event.session),
          });
        }
      } catch {
        // Non-JSON data-channel messages pass through unchanged.
      }
    }

    original.call(this, nextData);
  } as RTCDataChannel["send"];

  RTCDataChannel.prototype.send = patchedSend;
}

function uninstallProtocolGuard() {
  if (
    typeof RTCDataChannel !== "undefined"
    && originalSend
    && patchedSend
    && RTCDataChannel.prototype.send === patchedSend
  ) {
    RTCDataChannel.prototype.send = originalSend;
  }
  originalSend = null;
  patchedSend = null;
}

export function RuthieRealtimeProtocolGuard() {
  useEffect(() => {
    consumers += 1;
    installProtocolGuard();

    return () => {
      consumers = Math.max(0, consumers - 1);
      if (consumers === 0) uninstallProtocolGuard();
    };
  }, []);

  return null;
}
