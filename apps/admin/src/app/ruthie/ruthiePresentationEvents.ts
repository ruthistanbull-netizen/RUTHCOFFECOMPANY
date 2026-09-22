"use client";

import { wantsVisualResult } from "@/lib/ruthiePresentation";

export const RUTHIE_PRESENTATION_REQUEST_EVENT = "ruthie:presentation-request";

export type RuthiePresentationRequestDetail = {
  id: string;
  text: string;
  mode: "chat" | "voice";
  requestedAt: number;
};

export function dispatchRuthiePresentationRequest(options: {
  id: string;
  text: string;
  mode: "chat" | "voice";
}) {
  if (typeof window === "undefined") return false;
  const text = options.text.replace(/\s+/g, " ").trim();
  if (!text || !wantsVisualResult(text)) return false;

  const detail: RuthiePresentationRequestDetail = {
    id: options.id,
    text,
    mode: options.mode,
    requestedAt: Date.now(),
  };
  window.dispatchEvent(new CustomEvent<RuthiePresentationRequestDetail>(RUTHIE_PRESENTATION_REQUEST_EVENT, { detail }));
  return true;
}
