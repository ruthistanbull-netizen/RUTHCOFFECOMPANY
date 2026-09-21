export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  checkedAt: string;
  message?: string;
  details: Record<string, unknown>;
}

export interface HealthProbe {
  name: string;
  check(): Promise<Omit<HealthCheckResult, "name" | "latencyMs" | "checkedAt">>;
}

export interface DiagnosticsReport {
  id: string;
  status: HealthStatus;
  checks: HealthCheckResult[];
  generatedAt: string;
}

function statusRank(status: HealthStatus): number {
  return status === "unhealthy" ? 2 : status === "degraded" ? 1 : 0;
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms.`)), ms);
  });
}

export class DiagnosticsRunner {
  readonly probes: readonly HealthProbe[];
  readonly timeoutMs: number;

  constructor(probes: readonly HealthProbe[], timeoutMs = 5_000) {
    this.probes = probes;
    this.timeoutMs = timeoutMs;
  }

  async run(): Promise<DiagnosticsReport> {
    const checks = await Promise.all(this.probes.map(async (probe): Promise<HealthCheckResult> => {
      const startedAt = Date.now();
      try {
        const result = await Promise.race([probe.check(), timeoutAfter(this.timeoutMs)]);
        return {
          name: probe.name,
          status: result.status,
          latencyMs: Date.now() - startedAt,
          checkedAt: new Date().toISOString(),
          message: result.message,
          details: result.details,
        };
      } catch (error) {
        return {
          name: probe.name,
          status: "unhealthy",
          latencyMs: Date.now() - startedAt,
          checkedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
          details: {},
        };
      }
    }));

    const status = checks.reduce<HealthStatus>(
      (current, check) => statusRank(check.status) > statusRank(current) ? check.status : current,
      "healthy",
    );

    return {
      id: crypto.randomUUID(),
      status,
      checks,
      generatedAt: new Date().toISOString(),
    };
  }
}

export interface QueueDiagnosticsSource {
  countByStatus(): Promise<Record<string, number>>;
  oldestPendingAgeMs(): Promise<number | null>;
}

export class QueueHealthProbe implements HealthProbe {
  readonly name: string;
  readonly source: QueueDiagnosticsSource;
  readonly degradedAgeMs: number;
  readonly unhealthyAgeMs: number;

  constructor(input: {
    name: string;
    source: QueueDiagnosticsSource;
    degradedAgeMs?: number;
    unhealthyAgeMs?: number;
  }) {
    this.name = input.name;
    this.source = input.source;
    this.degradedAgeMs = input.degradedAgeMs ?? 5 * 60_000;
    this.unhealthyAgeMs = input.unhealthyAgeMs ?? 30 * 60_000;
  }

  async check(): Promise<Omit<HealthCheckResult, "name" | "latencyMs" | "checkedAt">> {
    const [counts, oldestPendingAgeMs] = await Promise.all([
      this.source.countByStatus(),
      this.source.oldestPendingAgeMs(),
    ]);
    const deadLetters = counts.dead_letter ?? 0;
    const status: HealthStatus =
      deadLetters > 0 || (oldestPendingAgeMs ?? 0) >= this.unhealthyAgeMs
        ? "unhealthy"
        : (oldestPendingAgeMs ?? 0) >= this.degradedAgeMs
          ? "degraded"
          : "healthy";

    return {
      status,
      message: deadLetters > 0 ? `${deadLetters} dead-letter item(s) require attention.` : undefined,
      details: { counts, oldestPendingAgeMs },
    };
  }
}

export interface DatabaseDiagnosticsSource {
  ping(): Promise<void>;
}

export class DatabaseHealthProbe implements HealthProbe {
  readonly name = "database";
  readonly source: DatabaseDiagnosticsSource;

  constructor(source: DatabaseDiagnosticsSource) {
    this.source = source;
  }

  async check(): Promise<Omit<HealthCheckResult, "name" | "latencyMs" | "checkedAt">> {
    await this.source.ping();
    return { status: "healthy", details: {} };
  }
}
