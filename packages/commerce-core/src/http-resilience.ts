type CircuitState = "closed" | "open" | "half_open";

type DependencyState = { state: CircuitState; failures: number; openedAt: number; halfOpenInFlight: boolean; active: number };
type Sample = { at: number; durationMs: number; ok: boolean };

export type DependencyPolicy = {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  failureThreshold?: number;
  resetAfterMs?: number;
  maxConcurrent?: number;
  retryStatuses?: number[];
  retryUnsafe?: boolean;
  retryTimeouts?: boolean;
};

export type DependencySnapshot = {
  name: string;
  circuit: CircuitState;
  failures: number;
  active: number;
  samples: number;
  errorRate: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
};

export class DependencyCircuitOpenError extends Error {
  constructor(readonly dependency: string) { super(`${dependency} geçici olarak koruma modunda.`); this.name = "DependencyCircuitOpenError"; }
}
export class DependencyBulkheadError extends Error {
  constructor(readonly dependency: string) { super(`${dependency} eşzamanlı istek bütçesi dolu.`); this.name = "DependencyBulkheadError"; }
}
export class DependencyTimeoutError extends Error {
  constructor(readonly dependency: string, readonly timeoutMs: number) { super(`${dependency} ${timeoutMs} ms içinde yanıt vermedi.`); this.name = "DependencyTimeoutError"; }
}

const DEFAULT_POLICY = {
  timeoutMs: 10_000,
  retries: 1,
  baseDelayMs: 180,
  failureThreshold: 4,
  resetAfterMs: 30_000,
  maxConcurrent: 12,
  retryStatuses: [408, 425, 429, 500, 502, 503, 504],
  retryUnsafe: false,
  retryTimeouts: true,
};

const states = new Map<string, DependencyState>();
const samples = new Map<string, Sample[]>();
const MAX_SAMPLES = 300;

function stateFor(name: string) {
  let state = states.get(name);
  if (!state) {
    state = { state: "closed", failures: 0, openedAt: 0, halfOpenInFlight: false, active: 0 };
    states.set(name, state);
  }
  return state;
}
function policyWithDefaults(policy: DependencyPolicy = {}) { return { ...DEFAULT_POLICY, ...policy, retryStatuses: policy.retryStatuses || DEFAULT_POLICY.retryStatuses }; }
function record(name: string, durationMs: number, ok: boolean) {
  const list = samples.get(name) || [];
  list.push({ at: Date.now(), durationMs, ok });
  if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES);
  samples.set(name, list);
}
function percentile(values: number[], ratio: number) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return Math.round(ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * ratio) - 1))]);
}
function markSuccess(name: string) { const state = stateFor(name); state.failures = 0; state.state = "closed"; state.openedAt = 0; state.halfOpenInFlight = false; }
function markFailure(name: string, threshold: number) { const state = stateFor(name); state.failures += 1; state.halfOpenInFlight = false; if (state.failures >= threshold) { state.state = "open"; state.openedAt = Date.now(); } }
function acquire(name: string, policy: ReturnType<typeof policyWithDefaults>) {
  const state = stateFor(name);
  if (state.state === "open") { if (Date.now() - state.openedAt < policy.resetAfterMs) throw new DependencyCircuitOpenError(name); state.state = "half_open"; }
  if (state.state === "half_open") { if (state.halfOpenInFlight) throw new DependencyCircuitOpenError(name); state.halfOpenInFlight = true; }
  if (state.active >= policy.maxConcurrent) { state.halfOpenInFlight = false; throw new DependencyBulkheadError(name); }
  state.active += 1;
  return () => { state.active = Math.max(0, state.active - 1); };
}
function jitter(base: number, attempt: number) { const exponential = Math.min(4_000, base * (2 ** attempt)); return Math.round(exponential * (0.75 + Math.random() * 0.5)); }
function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function runWithTimeout<T>(dependency: string, timeoutMs: number, operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DependencyTimeoutError(dependency, timeoutMs)), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function withDependencyGuard<T>(dependency: string, operation: () => Promise<T>, policyInput: DependencyPolicy = {}, shouldRetry: (error: unknown) => boolean = () => true): Promise<T> {
  const policy = policyWithDefaults(policyInput);
  const release = acquire(dependency, policy);
  const started = Date.now();
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
      try { const result = await runWithTimeout(dependency, policy.timeoutMs, operation); markSuccess(dependency); record(dependency, Date.now() - started, true); return result; }
      catch (error) { lastError = error; if (attempt >= policy.retries || !shouldRetry(error)) break; await sleep(jitter(policy.baseDelayMs, attempt)); }
    }
    markFailure(dependency, policy.failureThreshold); record(dependency, Date.now() - started, false); throw lastError;
  } finally { release(); }
}

export async function resilientFetch(dependency: string, input: string | URL | Request, init: RequestInit = {}, policyInput: DependencyPolicy = {}): Promise<Response> {
  const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
  const safeMethod = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"].includes(method);
  const retryable = safeMethod || headers.has("x-idempotency-key") || headers.has("idempotency-key") || policyInput.retryUnsafe === true;
  const policy = policyWithDefaults({ ...policyInput, retries: retryable ? policyInput.retries ?? 2 : 0 });
  const external = init.signal || (input instanceof Request ? input.signal : undefined);
  return withDependencyGuard(dependency, async () => {
    const controller = new AbortController();
    const onAbort = () => controller.abort(external?.reason);
    if (external?.aborted) onAbort(); else external?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new DependencyTimeoutError(dependency, policy.timeoutMs)), policy.timeoutMs);
    try {
      const requestInput = input instanceof Request ? input.clone() : input;
      const response = await fetch(requestInput, { ...init, signal: controller.signal });
      if (policy.retryStatuses.includes(response.status)) { const error = new Error(`${dependency} HTTP ${response.status}`) as Error & { status?: number; response?: Response }; error.status = response.status; error.response = response; throw error; }
      return response;
    } finally { clearTimeout(timer); external?.removeEventListener("abort", onAbort); }
  }, policy, (error) => {
    if (error instanceof DependencyTimeoutError && !policy.retryTimeouts) return false;
    const status = Number((error as { status?: number })?.status || 0);
    return retryable && (!status || policy.retryStatuses.includes(status));
  });
}

export function dependencySnapshots(): DependencySnapshot[] {
  const names = new Set([...states.keys(), ...samples.keys()]);
  return [...names].sort().map((name) => {
    const state = stateFor(name); const list = samples.get(name) || []; const durations = list.map((item) => item.durationMs); const failures = list.filter((item) => !item.ok).length;
    return { name, circuit: state.state, failures: state.failures, active: state.active, samples: list.length, errorRate: list.length ? Number((failures / list.length).toFixed(4)) : 0, p50Ms: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95), p99Ms: percentile(durations, 0.99) };
  });
}
export function resetDependencyCircuit(name: string) { states.delete(name); }
