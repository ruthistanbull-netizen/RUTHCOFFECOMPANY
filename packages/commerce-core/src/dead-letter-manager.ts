export type DeadLetterSource = "outbox" | "job" | "payment_callback" | "event_replay";
export type DeadLetterStatus = "open" | "retrying" | "resolved" | "discarded";

export interface DeadLetterRecord<TPayload = unknown> {
  id: string;
  source: DeadLetterSource;
  sourceId: string;
  eventType?: string;
  aggregateId?: string;
  payload: TPayload;
  status: DeadLetterStatus;
  attempts: number;
  error: string;
  rootCause?: string;
  correlationId?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  discardedAt?: string;
  resolutionNote?: string;
}

export interface DeadLetterRepository {
  findById(id: string): Promise<DeadLetterRecord | null>;
  listOpen(limit: number): Promise<DeadLetterRecord[]>;
  save(record: DeadLetterRecord): Promise<void>;
}

export interface DeadLetterRetryDispatcher {
  dispatch(record: DeadLetterRecord): Promise<void>;
}

export interface DeadLetterAuditSink {
  record(input: {
    action: "retry" | "resolve" | "discard";
    deadLetterId: string;
    actorId: string;
    reason: string;
    occurredAt: string;
  }): Promise<void>;
}

export class DeadLetterNotFoundError extends Error {
  constructor(id: string) {
    super(`Dead-letter record ${id} was not found.`);
    this.name = "DeadLetterNotFoundError";
  }
}

export class DeadLetterManager {
  readonly repository: DeadLetterRepository;
  readonly dispatcher: DeadLetterRetryDispatcher;
  readonly audit: DeadLetterAuditSink;

  constructor(input: {
    repository: DeadLetterRepository;
    dispatcher: DeadLetterRetryDispatcher;
    audit: DeadLetterAuditSink;
  }) {
    this.repository = input.repository;
    this.dispatcher = input.dispatcher;
    this.audit = input.audit;
  }

  async retry(input: {
    id: string;
    actorId: string;
    reason: string;
  }): Promise<DeadLetterRecord> {
    const record = await this.repository.findById(input.id);
    if (!record) throw new DeadLetterNotFoundError(input.id);
    if (record.status === "discarded" || record.status === "resolved") {
      throw new Error(`Dead-letter record ${record.id} is already closed.`);
    }

    const now = new Date().toISOString();
    const retrying: DeadLetterRecord = {
      ...record,
      status: "retrying",
      attempts: record.attempts + 1,
      updatedAt: now,
      resolutionNote: input.reason,
    };
    await this.repository.save(retrying);
    await this.audit.record({
      action: "retry",
      deadLetterId: retrying.id,
      actorId: input.actorId,
      reason: input.reason,
      occurredAt: now,
    });

    try {
      await this.dispatcher.dispatch(retrying);
      const resolvedAt = new Date().toISOString();
      const resolved: DeadLetterRecord = {
        ...retrying,
        status: "resolved",
        resolvedAt,
        updatedAt: resolvedAt,
      };
      await this.repository.save(resolved);
      await this.audit.record({
        action: "resolve",
        deadLetterId: resolved.id,
        actorId: input.actorId,
        reason: "Retry completed successfully.",
        occurredAt: resolvedAt,
      });
      return resolved;
    } catch (error) {
      const failedAt = new Date().toISOString();
      const reopened: DeadLetterRecord = {
        ...retrying,
        status: "open",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: failedAt,
      };
      await this.repository.save(reopened);
      throw error;
    }
  }

  async retryAll(input: {
    actorId: string;
    reason: string;
    limit?: number;
  }): Promise<Array<{ id: string; status: "resolved" | "failed"; error?: string }>> {
    const records = await this.repository.listOpen(input.limit ?? 100);
    const results: Array<{ id: string; status: "resolved" | "failed"; error?: string }> = [];

    for (const record of records) {
      try {
        await this.retry({ id: record.id, actorId: input.actorId, reason: input.reason });
        results.push({ id: record.id, status: "resolved" });
      } catch (error) {
        results.push({
          id: record.id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  async discard(input: {
    id: string;
    actorId: string;
    reason: string;
  }): Promise<DeadLetterRecord> {
    if (!input.reason.trim()) throw new Error("Discard reason is required.");
    const record = await this.repository.findById(input.id);
    if (!record) throw new DeadLetterNotFoundError(input.id);
    if (record.status === "resolved") {
      throw new Error(`Resolved dead-letter record ${record.id} cannot be discarded.`);
    }

    const now = new Date().toISOString();
    const discarded: DeadLetterRecord = {
      ...record,
      status: "discarded",
      discardedAt: now,
      updatedAt: now,
      resolutionNote: input.reason,
    };
    await this.repository.save(discarded);
    await this.audit.record({
      action: "discard",
      deadLetterId: discarded.id,
      actorId: input.actorId,
      reason: input.reason,
      occurredAt: now,
    });
    return discarded;
  }
}
