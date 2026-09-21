import assert from "node:assert/strict";
import test from "node:test";
import { resetDependencyCircuit, resilientFetch } from "../src/http-resilience.ts";

test("idempotent internal POSTs may retry a transient connection reset", async () => {
  const dependency = `test-internal-post-${Date.now()}`;
  resetDependencyCircuit(dependency);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed: connection termination");
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const response = await resilientFetch(
      dependency,
      "http://127.0.0.1:3000/api/internal/self-heal",
      { method: "POST", body: "{}" },
      { retries: 1, retryUnsafe: true, retryTimeouts: false, baseDelayMs: 1 },
    );
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    resetDependencyCircuit(dependency);
  }
});

test("unsafe POSTs do not retry unless explicitly marked retry-safe", async () => {
  const dependency = `test-unsafe-post-${Date.now()}`;
  resetDependencyCircuit(dependency);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError("fetch failed: connection reset");
  }) as typeof fetch;
  try {
    await assert.rejects(() => resilientFetch(dependency, "http://127.0.0.1:3000/api/unsafe", { method: "POST", body: "{}" }, { retries: 2, baseDelayMs: 1 }));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    resetDependencyCircuit(dependency);
  }
});
