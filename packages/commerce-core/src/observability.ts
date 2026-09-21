export type LogLevel = "debug" | "info" | "warn" | "error";

export interface CorrelationContext {
  traceId: string;
  correlationId: string;
  requestId?: string;
  causationId?: string;
  actorId?: string;
  orderId?: string;
  paymentIntentId?: string;
}

export interface StructuredLogRecord {
  level: LogLevel;
  message: string;
  service: string;
  occurredAt: string;
  context: CorrelationContext;
  attributes: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface CommerceLogger {
  write(record: StructuredLogRecord): void | Promise<void>;
}

export interface MetricLabels {
  [key: string]: string | number | boolean;
}

export interface CommerceMetrics {
  increment(name: string, value?: number, labels?: MetricLabels): void | Promise<void>;
  gauge(name: string, value: number, labels?: MetricLabels): void | Promise<void>;
  observe(name: string, value: number, labels?: MetricLabels): void | Promise<void>;
}

export interface TraceSpan {
  setAttribute(name: string, value: string | number | boolean): void;
  recordException(error: unknown): void;
  end(): void;
}

export interface CommerceTracer {
  startSpan(name: string, context: CorrelationContext): TraceSpan;
}

export interface Observability {
  logger: CommerceLogger;
  metrics: CommerceMetrics;
  tracer: CommerceTracer;
  service: string;
}

export function createCorrelationContext(
  input: Partial<CorrelationContext> = {},
): CorrelationContext {
  return {
    traceId: input.traceId ?? crypto.randomUUID(),
    correlationId: input.correlationId ?? crypto.randomUUID(),
    requestId: input.requestId,
    causationId: input.causationId,
    actorId: input.actorId,
    orderId: input.orderId,
    paymentIntentId: input.paymentIntentId,
  };
}

function serializeError(error: unknown): StructuredLogRecord["error"] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

export async function writeLog(
  observability: Observability,
  level: LogLevel,
  message: string,
  context: CorrelationContext,
  attributes: Record<string, unknown> = {},
  error?: unknown,
): Promise<void> {
  await observability.logger.write({
    level,
    message,
    service: observability.service,
    occurredAt: new Date().toISOString(),
    context,
    attributes,
    error: error === undefined ? undefined : serializeError(error),
  });
}

export async function withObservedOperation<T>(input: {
  observability: Observability;
  name: string;
  context: CorrelationContext;
  attributes?: Record<string, string | number | boolean>;
  operation: () => Promise<T>;
}): Promise<T> {
  const startedAt = Date.now();
  const span = input.observability.tracer.startSpan(input.name, input.context);

  for (const [name, value] of Object.entries(input.attributes ?? {})) {
    span.setAttribute(name, value);
  }

  await writeLog(
    input.observability,
    "debug",
    `${input.name}.started`,
    input.context,
    input.attributes,
  );

  try {
    const result = await input.operation();
    const durationMs = Date.now() - startedAt;
    await input.observability.metrics.observe(
      "commerce_operation_duration_ms",
      durationMs,
      { operation: input.name, outcome: "success" },
    );
    await writeLog(
      input.observability,
      "info",
      `${input.name}.completed`,
      input.context,
      { ...input.attributes, durationMs },
    );
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    span.recordException(error);
    await input.observability.metrics.increment(
      "commerce_operation_failures_total",
      1,
      { operation: input.name },
    );
    await input.observability.metrics.observe(
      "commerce_operation_duration_ms",
      durationMs,
      { operation: input.name, outcome: "failure" },
    );
    await writeLog(
      input.observability,
      "error",
      `${input.name}.failed`,
      input.context,
      { ...input.attributes, durationMs },
      error,
    );
    throw error;
  } finally {
    span.end();
  }
}

export class NoopLogger implements CommerceLogger {
  write(_record: StructuredLogRecord): void {}
}

export class NoopMetrics implements CommerceMetrics {
  increment(_name: string, _value?: number, _labels?: MetricLabels): void {}
  gauge(_name: string, _value: number, _labels?: MetricLabels): void {}
  observe(_name: string, _value: number, _labels?: MetricLabels): void {}
}

class NoopSpan implements TraceSpan {
  setAttribute(_name: string, _value: string | number | boolean): void {}
  recordException(_error: unknown): void {}
  end(): void {}
}

export class NoopTracer implements CommerceTracer {
  startSpan(_name: string, _context: CorrelationContext): TraceSpan {
    return new NoopSpan();
  }
}

export function createNoopObservability(service = "commerce-core"): Observability {
  return {
    service,
    logger: new NoopLogger(),
    metrics: new NoopMetrics(),
    tracer: new NoopTracer(),
  };
}
