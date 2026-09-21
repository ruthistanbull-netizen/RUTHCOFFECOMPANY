import type { CommerceEvent } from "@ruth-commerce/contracts";

export type OutboxStatus = "pending" | "processing" | "published" | "failed" | "dead_letter";

export interface OutboxMessage<TPayload = unknown> {
  id: string;
  event: CommerceEvent<TPayload>;
  status: OutboxStatus;
  attempts: number;
  availableAt: string;
  lockedAt?: string;
  lockedBy?: string;
  publishedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export function createOutboxMessage<TPayload>(
  event: CommerceEvent<TPayload>,
  now = new Date().toISOString(),
): OutboxMessage<TPayload> {
  return {
    id: crypto.randomUUID(),
    event,
    status: "pending",
    attempts: 0,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function calculateRetryAt(
  attempts: number,
  now = Date.now(),
  baseDelayMs = 1_000,
  maxDelayMs = 15 * 60_000,
): string {
  const exponent = Math.max(0, attempts - 1);
  const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
  return new Date(now + delay).toISOString();
}

export function markOutboxProcessing(
  message: OutboxMessage,
  workerId: string,
  now = new Date().toISOString(),
): OutboxMessage {
  return {
    ...message,
    status: "processing",
    attempts: message.attempts + 1,
    lockedAt: now,
    lockedBy: workerId,
    updatedAt: now,
  };
}

export function markOutboxPublished(
  message: OutboxMessage,
  now = new Date().toISOString(),
): OutboxMessage {
  return {
    ...message,
    status: "published",
    publishedAt: now,
    lockedAt: undefined,
    lockedBy: undefined,
    lastError: undefined,
    updatedAt: now,
  };
}

export function markOutboxFailed(
  message: OutboxMessage,
  error: string,
  options: { maxAttempts?: number; nowMs?: number } = {},
): OutboxMessage {
  const maxAttempts = options.maxAttempts ?? 8;
  const nowMs = options.nowMs ?? Date.now();
  const deadLetter = message.attempts >= maxAttempts;
  const now = new Date(nowMs).toISOString();
  return {
    ...message,
    status: deadLetter ? "dead_letter" : "failed",
    availableAt: deadLetter ? message.availableAt : calculateRetryAt(message.attempts, nowMs),
    lockedAt: undefined,
    lockedBy: undefined,
    lastError: error,
    updatedAt: now,
  };
}
