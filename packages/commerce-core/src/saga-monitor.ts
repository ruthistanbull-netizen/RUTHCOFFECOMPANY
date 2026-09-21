export type SagaStepState = "pending" | "running" | "completed" | "failed" | "timed_out";

export interface SagaEvent {
  id: string;
  sagaId: string;
  aggregateId: string;
  type: string;
  occurredAt: string;
  correlationId?: string;
  causationId?: string;
  payload?: Record<string, unknown>;
}

export interface SagaStepDefinition {
  name: string;
  startsOn: readonly string[];
  completesOn: readonly string[];
  failsOn?: readonly string[];
  timeoutMs: number;
  required: boolean;
}

export interface SagaDefinition {
  name: string;
  steps: readonly SagaStepDefinition[];
}

export interface SagaStepSnapshot {
  name: string;
  state: SagaStepState;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  deadlineAt?: string;
  lastEventId?: string;
  lastEventType?: string;
}

export interface SagaSnapshot {
  sagaId: string;
  aggregateId: string;
  definition: string;
  status: "pending" | "running" | "completed" | "failed" | "timed_out";
  steps: SagaStepSnapshot[];
  startedAt?: string;
  completedAt?: string;
  lastEventAt?: string;
  updatedAt: string;
}

function contains(values: readonly string[] | undefined, candidate: string): boolean {
  return values?.includes(candidate) ?? false;
}

function datePlus(iso: string, durationMs: number): string {
  return new Date(Date.parse(iso) + durationMs).toISOString();
}

export function buildSagaSnapshot(input: {
  sagaId: string;
  aggregateId: string;
  definition: SagaDefinition;
  events: readonly SagaEvent[];
  now?: string;
}): SagaSnapshot {
  const now = input.now ?? new Date().toISOString();
  const events = [...input.events].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  );

  const steps = input.definition.steps.map<SagaStepSnapshot>((definition) => {
    const startEvent = events.find((event) => contains(definition.startsOn, event.type));
    const completeEvent = events.find((event) => contains(definition.completesOn, event.type));
    const failEvent = events.find((event) => contains(definition.failsOn, event.type));

    if (failEvent && (!completeEvent || Date.parse(failEvent.occurredAt) <= Date.parse(completeEvent.occurredAt))) {
      return {
        name: definition.name,
        state: "failed",
        startedAt: startEvent?.occurredAt,
        failedAt: failEvent.occurredAt,
        deadlineAt: startEvent ? datePlus(startEvent.occurredAt, definition.timeoutMs) : undefined,
        lastEventId: failEvent.id,
        lastEventType: failEvent.type,
      };
    }

    if (completeEvent) {
      return {
        name: definition.name,
        state: "completed",
        startedAt: startEvent?.occurredAt,
        completedAt: completeEvent.occurredAt,
        deadlineAt: startEvent ? datePlus(startEvent.occurredAt, definition.timeoutMs) : undefined,
        lastEventId: completeEvent.id,
        lastEventType: completeEvent.type,
      };
    }

    if (!startEvent) {
      return {
        name: definition.name,
        state: "pending",
      };
    }

    const deadlineAt = datePlus(startEvent.occurredAt, definition.timeoutMs);
    const timedOut = Date.parse(now) >= Date.parse(deadlineAt);
    return {
      name: definition.name,
      state: timedOut ? "timed_out" : "running",
      startedAt: startEvent.occurredAt,
      deadlineAt,
      lastEventId: startEvent.id,
      lastEventType: startEvent.type,
    };
  });

  const requiredSteps = input.definition.steps
    .map((definition, index) => ({ definition, snapshot: steps[index] }))
    .filter((entry) => entry.definition.required);

  let status: SagaSnapshot["status"] = "pending";
  if (requiredSteps.some((entry) => entry.snapshot.state === "failed")) {
    status = "failed";
  } else if (requiredSteps.some((entry) => entry.snapshot.state === "timed_out")) {
    status = "timed_out";
  } else if (requiredSteps.length > 0 && requiredSteps.every((entry) => entry.snapshot.state === "completed")) {
    status = "completed";
  } else if (steps.some((step) => step.state !== "pending")) {
    status = "running";
  }

  return {
    sagaId: input.sagaId,
    aggregateId: input.aggregateId,
    definition: input.definition.name,
    status,
    steps,
    startedAt: events[0]?.occurredAt,
    completedAt: status === "completed"
      ? steps
          .map((step) => step.completedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1)
      : undefined,
    lastEventAt: events.at(-1)?.occurredAt,
    updatedAt: now,
  };
}

export const orderFulfillmentSaga: SagaDefinition = {
  name: "order-fulfillment",
  steps: [
    {
      name: "inventory-reservation",
      startsOn: ["order.created"],
      completesOn: ["inventory.reserved"],
      failsOn: ["inventory.reservation_failed"],
      timeoutMs: 5 * 60_000,
      required: true,
    },
    {
      name: "payment",
      startsOn: ["inventory.reserved", "payment.intent_created"],
      completesOn: ["payment.succeeded"],
      failsOn: ["payment.failed", "payment.cancelled"],
      timeoutMs: 30 * 60_000,
      required: true,
    },
    {
      name: "inventory-allocation",
      startsOn: ["payment.succeeded"],
      completesOn: ["inventory.allocated"],
      failsOn: ["inventory.allocation_failed"],
      timeoutMs: 5 * 60_000,
      required: true,
    },
    {
      name: "shipment",
      startsOn: ["order.ready_to_ship", "shipment.created"],
      completesOn: ["shipment.delivered"],
      failsOn: ["shipment.cancelled", "shipment.returned"],
      timeoutMs: 14 * 24 * 60 * 60_000,
      required: false,
    },
  ],
};

export interface SagaSnapshotRepository {
  save(snapshot: SagaSnapshot): Promise<void>;
  findTimedOut(limit: number): Promise<SagaSnapshot[]>;
}

export class SagaMonitor {
  readonly repository: SagaSnapshotRepository;

  constructor(repository: SagaSnapshotRepository) {
    this.repository = repository;
  }

  async evaluate(input: {
    sagaId: string;
    aggregateId: string;
    definition: SagaDefinition;
    events: readonly SagaEvent[];
    now?: string;
  }): Promise<SagaSnapshot> {
    const snapshot = buildSagaSnapshot(input);
    await this.repository.save(snapshot);
    return snapshot;
  }
}
