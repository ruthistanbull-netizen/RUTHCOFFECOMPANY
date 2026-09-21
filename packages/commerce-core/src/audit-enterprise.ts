import type { AuditActor, AuditLogEntry } from "./audit";
import { createAuditLog } from "./audit";

export interface AuditFieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface AuditEventChain {
  traceId?: string;
  correlationId?: string;
  causationId?: string;
  parentEventId?: string;
  rootEventId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectChanges(
  before: unknown,
  after: unknown,
  path: string,
  changes: AuditFieldChange[],
): void {
  if (Object.is(before, after)) return;

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      collectChanges(before[key], after[key], path ? `${path}.${key}` : key, changes);
    }
    return;
  }

  changes.push({ path: path || "$", before, after });
}

export function diffAuditValues(before: unknown, after: unknown): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  collectChanges(before, after, "", changes);
  return changes;
}

export function createEnterpriseAuditLog<TBefore = unknown, TAfter = unknown>(input: {
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  before?: TBefore;
  after?: TAfter;
  reason?: string;
  chain?: AuditEventChain;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}): AuditLogEntry<TBefore, TAfter> {
  const changes = diffAuditValues(input.before, input.after);
  return createAuditLog({
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actor: input.actor,
    correlationId: input.chain?.correlationId,
    causationId: input.chain?.causationId,
    reason: input.reason,
    before: input.before,
    after: input.after,
    metadata: {
      ...input.metadata,
      traceId: input.chain?.traceId,
      parentEventId: input.chain?.parentEventId,
      rootEventId: input.chain?.rootEventId,
      changedFields: changes.map((change) => change.path),
      changes,
    },
    occurredAt: input.occurredAt,
  });
}
