export type IdempotencyStatus = "processing" | "succeeded" | "failed";

export interface IdempotencyRecord<TResult = unknown> {
  key: string;
  scope: string;
  requestHash: string;
  status: IdempotencyStatus;
  result?: TResult;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_KEY_REUSED";

  constructor(message = "Idempotency key was reused with a different request.") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

export function assertIdempotentRequest(
  existing: IdempotencyRecord | null | undefined,
  requestHash: string,
): void {
  if (existing && existing.requestHash !== requestHash) {
    throw new IdempotencyConflictError();
  }
}

export function beginIdempotentOperation(input: {
  key: string;
  scope: string;
  requestHash: string;
  now?: string;
  expiresAt?: string;
}): IdempotencyRecord {
  const now = input.now ?? new Date().toISOString();
  return {
    key: input.key,
    scope: input.scope,
    requestHash: input.requestHash,
    status: "processing",
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresAt,
  };
}

export function completeIdempotentOperation<TResult>(
  record: IdempotencyRecord,
  result: TResult,
  now = new Date().toISOString(),
): IdempotencyRecord<TResult> {
  return { ...record, status: "succeeded", result, updatedAt: now };
}

export function failIdempotentOperation(
  record: IdempotencyRecord,
  error: { code?: string; message: string },
  now = new Date().toISOString(),
): IdempotencyRecord {
  return {
    ...record,
    status: "failed",
    errorCode: error.code,
    errorMessage: error.message,
    updatedAt: now,
  };
}
