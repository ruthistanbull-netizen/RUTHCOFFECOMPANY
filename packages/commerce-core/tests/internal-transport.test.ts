import assert from "node:assert/strict";
import test from "node:test";
import { joinInternalServiceUrl, resolveInternalServiceBaseUrl } from "../src/internal-transport.ts";

test("Zeabur self calls prefer process-local loopback", () => {
  assert.equal(
    resolveInternalServiceBaseUrl({
      configuredBaseUrl: "https://ruthcommerce.zeabur.app",
      port: "3000",
      preferLoopback: true,
    }),
    "http://127.0.0.1:3000",
  );
});

test("explicit internal origin wins over public origin", () => {
  assert.equal(
    resolveInternalServiceBaseUrl({
      configuredBaseUrl: "https://ruthcommerce.zeabur.app",
      internalBaseUrl: "http://panel.internal:3000",
      port: "3000",
      preferLoopback: true,
    }),
    "http://panel.internal:3000",
  );
});

test("non-Zeabur callers keep the configured public origin", () => {
  assert.equal(
    resolveInternalServiceBaseUrl({ configuredBaseUrl: "https://ruthcommerce.zeabur.app", port: "3000", preferLoopback: false }),
    "https://ruthcommerce.zeabur.app",
  );
});

test("invalid ports never create an invalid loopback URL", () => {
  assert.equal(
    resolveInternalServiceBaseUrl({ configuredBaseUrl: "https://ruthcommerce.zeabur.app", port: "99999", preferLoopback: true }),
    "https://ruthcommerce.zeabur.app",
  );
});

test("paths are normalized without losing the origin", () => {
  assert.equal(joinInternalServiceUrl("http://127.0.0.1:3000/", "api/internal/self-heal"), "http://127.0.0.1:3000/api/internal/self-heal");
  assert.equal(joinInternalServiceUrl("http://127.0.0.1:3000", "/api/health/live"), "http://127.0.0.1:3000/api/health/live");
});
