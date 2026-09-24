"use client";

type ConfirmationRequest = {
  id: number;
  message: string;
  resolve: (accepted: boolean) => void;
};

let sequence = 0;
let queue: ConfirmationRequest[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeAdminConfirmation(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAdminConfirmationSnapshot() {
  return queue[0] || null;
}

export function requestAdminConfirmation(message: string) {
  return new Promise<boolean>((resolve) => {
    queue = [...queue, { id: ++sequence, message, resolve }];
    emit();
  });
}

export function settleAdminConfirmation(id: number, accepted: boolean) {
  const current = queue[0];
  if (!current || current.id !== id) return;
  queue = queue.slice(1);
  current.resolve(accepted);
  emit();
}

export function clearAdminConfirmations() {
  const pending = queue;
  queue = [];
  pending.forEach((request) => request.resolve(false));
  emit();
}
