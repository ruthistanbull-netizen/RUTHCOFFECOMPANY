export interface ReplayableEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  occurredAt: string;
  correlationId?: string;
  causationId?: string;
  payload: TPayload;
}

export interface EventReplayQuery {
  eventIds?: readonly string[];
  aggregateId?: string;
  aggregateType?: string;
  occurredFrom?: string;
  occurredTo?: string;
  eventTypes?: readonly string[];
  limit?: number;
}

export interface EventReplayOptions {
  dryRun: boolean;
  requestedBy: string;
  reason: string;
  stopOnError?: boolean;
}

export interface EventReplayResultItem {
  eventId: string;
  eventType: string;
  aggregateId: string;
  status: "simulated" | "replayed" | "skipped" | "failed";
  error?: string;
}

export interface EventReplayRun {
  id: string;
  query: EventReplayQuery;
  options: EventReplayOptions;
  status: "running" | "completed" | "completed_with_errors" | "failed";
  items: EventReplayResultItem[];
  startedAt: string;
  completedAt?: string;
}

export interface ReplayEventStore {
  list(query: EventReplayQuery): Promise<ReplayableEvent[]>;
}

export interface ReplayAuditRepository {
  save(run: EventReplayRun): Promise<void>;
}

export type ReplayHandler = (
  event: ReplayableEvent,
  context: { replayRunId: string; dryRun: boolean },
) => Promise<void>;

export class EventReplayRegistry {
  private readonly handlers = new Map<string, ReplayHandler>();

  register(eventType: string, handler: ReplayHandler): void {
    if (!eventType.trim()) throw new Error("Replay event type is required.");
    if (this.handlers.has(eventType)) {
      throw new Error(`Replay handler already registered for ${eventType}.`);
    }
    this.handlers.set(eventType, handler);
  }

  get(eventType: string): ReplayHandler | undefined {
    return this.handlers.get(eventType);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class EventReplayEngine {
  readonly store: ReplayEventStore;
  readonly audit: ReplayAuditRepository;
  readonly registry: EventReplayRegistry;

  constructor(input: {
    store: ReplayEventStore;
    audit: ReplayAuditRepository;
    registry: EventReplayRegistry;
  }) {
    this.store = input.store;
    this.audit = input.audit;
    this.registry = input.registry;
  }

  async replay(
    query: EventReplayQuery,
    options: EventReplayOptions,
  ): Promise<EventReplayRun> {
    if (!options.requestedBy.trim()) throw new Error("Replay requester is required.");
    if (!options.reason.trim()) throw new Error("Replay reason is required.");

    const run: EventReplayRun = {
      id: crypto.randomUUID(),
      query,
      options,
      status: "running",
      items: [],
      startedAt: new Date().toISOString(),
    };
    await this.audit.save(run);

    try {
      const events = (await this.store.list(query)).sort(
        (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
      );

      for (const event of events) {
        const handler = this.registry.get(event.type);
        if (!handler) {
          run.items.push({
            eventId: event.id,
            eventType: event.type,
            aggregateId: event.aggregateId,
            status: "skipped",
            error: "No replay handler is registered for this event type.",
          });
          continue;
        }

        if (options.dryRun) {
          run.items.push({
            eventId: event.id,
            eventType: event.type,
            aggregateId: event.aggregateId,
            status: "simulated",
          });
          continue;
        }

        try {
          await handler(event, { replayRunId: run.id, dryRun: false });
          run.items.push({
            eventId: event.id,
            eventType: event.type,
            aggregateId: event.aggregateId,
            status: "replayed",
          });
        } catch (error) {
          run.items.push({
            eventId: event.id,
            eventType: event.type,
            aggregateId: event.aggregateId,
            status: "failed",
            error: errorMessage(error),
          });
          if (options.stopOnError ?? true) throw error;
        }
      }

      run.status = run.items.some((item) => item.status === "failed")
        ? "completed_with_errors"
        : "completed";
      run.completedAt = new Date().toISOString();
      await this.audit.save(run);
      return run;
    } catch (error) {
      run.status = "failed";
      run.completedAt = new Date().toISOString();
      await this.audit.save(run);
      throw error;
    }
  }
}
