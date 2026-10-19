import type { WatchSession } from "./model";
export class WatchApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function watchRequest<T>(path: string, options: {
  method?: string; body?: unknown; session?: WatchSession; admin?: boolean; signal?: AbortSignal;
} = {}): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.session) headers.set("x-watch-token", options.session.token);
  if (options.admin) {
    const { adminAuthHeaders } = await import("@/lib/adminApi");
    const auth = await adminAuthHeaders();
    headers.set("Authorization", auth.Authorization);
  }
  const response = await fetch(path, { method: options.method || "GET", headers, cache: "no-store",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal || AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new WatchApiError(payload?.error || "Bağlantı kurulamadı. Tekrar dene.", response.status);
  return payload as T;
}
const key = (id: string) => `rr-watch:v1:${id}`;
export function saveWatchSession(session: WatchSession) {
  try { sessionStorage.setItem(key(session.roomId), JSON.stringify(session)); } catch { /* The active tab can still use its in-memory session. */ }
}
export function readWatchSession(id: string): WatchSession | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(key(id)) || "null");
    return data?.roomId === id && typeof data?.token === "string" && data?.member?.id ? data : null;
  } catch { return null; }
}
export function clearWatchSession(id: string) { try { sessionStorage.removeItem(key(id)); } catch {} }
