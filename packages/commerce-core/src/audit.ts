export interface AuditActor {
  id?: string;
  type: "user" | "customer" | "system" | "integration";
  displayName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogEntry<TBefore = unknown, TAfter = unknown> {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  correlationId?: string;
  causationId?: string;
  reason?: string;
  before?: TBefore;
  after?: TAfter;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export function createAuditLog<TBefore = unknown, TAfter = unknown>(input: {
  action: string;
  entityType: string;
  entityId: string;
  actor: AuditActor;
  correlationId?: string;
  causationId?: string;
  reason?: string;
  before?: TBefore;
  after?: TAfter;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
}): AuditLogEntry<TBefore, TAfter> {
  if (!input.action.trim()) throw new Error("Audit action is required.");
  if (!input.entityType.trim()) throw new Error("Audit entityType is required.");
  if (!input.entityId.trim()) throw new Error("Audit entityId is required.");

  return {
    id: crypto.randomUUID(),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    actor: input.actor,
    correlationId: input.correlationId,
    causationId: input.causationId,
    reason: input.reason,
    before: input.before,
    after: input.after,
    metadata: input.metadata ?? {},
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };
}
