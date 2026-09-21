export type InternalTransportOptions = {
  configuredBaseUrl?: string | null;
  internalBaseUrl?: string | null;
  port?: string | number | null;
  preferLoopback?: boolean;
};

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validOrigin(value: unknown) {
  const raw = clean(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function validPort(value: unknown) {
  const raw = clean(value);
  if (!raw || !/^\d{1,5}$/.test(raw)) return undefined;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? String(port) : undefined;
}

/**
 * Resolve an address for calls from a service back to itself.
 *
 * Public reverse-proxy/DNS addresses are deliberately avoided when the runtime
 * can provide a process-local port. This prevents needless DNS/TLS/proxy hops
 * and removes a common source of "upstream connect ... connection termination"
 * failures during deploys/restarts. The core stays provider-neutral: the app
 * decides when loopback is appropriate through preferLoopback.
 */
export function resolveInternalServiceBaseUrl(options: InternalTransportOptions = {}) {
  const internal = validOrigin(options.internalBaseUrl);
  if (internal) return internal;

  const port = validPort(options.port);
  if (options.preferLoopback && port) return `http://127.0.0.1:${port}`;

  return validOrigin(options.configuredBaseUrl);
}

export function joinInternalServiceUrl(baseUrl: string, path: string) {
  const base = validOrigin(baseUrl);
  if (!base) throw new Error("Invalid internal service base URL.");
  const normalizedPath = String(path || "").startsWith("/") ? String(path) : `/${String(path)}`;
  return new URL(normalizedPath, `${base}/`).toString();
}
