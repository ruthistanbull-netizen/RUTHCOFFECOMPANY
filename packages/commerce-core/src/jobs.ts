export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_letter" | "cancelled";

export interface CommerceJob<TPayload = unknown> {
  id: string;
  type: string;
  queue: string;
  payload: TPayload;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt?: string;
  lockedBy?: string;
  completedAt?: string;
  lastError?: string;
  correlationId?: string;
  createdAt: string;
  updatedAt: string;
}

export function createJob<TPayload>(input: {
  type: string;
  payload: TPayload;
  queue?: string;
  priority?: number;
  maxAttempts?: number;
  runAt?: string;
  correlationId?: string;
  now?: string;
}): CommerceJob<TPayload> {
  const now = input.now ?? new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: input.type,
    queue: input.queue ?? "commerce",
    payload: input.payload,
    status: "queued",
    priority: input.priority ?? 100,
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 8,
    runAt: input.runAt ?? now,
    correlationId: input.correlationId,
    createdAt: now,
    updatedAt: now,
  };
}

export function startJob(job: CommerceJob, workerId: string, now = new Date().toISOString()): CommerceJob {
  if (job.status !== "queued" && job.status !== "failed") {
    throw new Error(`Job ${job.id} cannot start from ${job.status}.`);
  }
  return {
    ...job,
    status: "running",
    attempts: job.attempts + 1,
    lockedAt: now,
    lockedBy: workerId,
    updatedAt: now,
  };
}

export function completeJob(job: CommerceJob, now = new Date().toISOString()): CommerceJob {
  return {
    ...job,
    status: "succeeded",
    completedAt: now,
    lockedAt: undefined,
    lockedBy: undefined,
    lastError: undefined,
    updatedAt: now,
  };
}

export function failJob(
  job: CommerceJob,
  error: string,
  retryAt: string,
  now = new Date().toISOString(),
): CommerceJob {
  const deadLetter = job.attempts >= job.maxAttempts;
  return {
    ...job,
    status: deadLetter ? "dead_letter" : "failed",
    runAt: deadLetter ? job.runAt : retryAt,
    lockedAt: undefined,
    lockedBy: undefined,
    lastError: error,
    updatedAt: now,
  };
}
