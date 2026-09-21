export interface ScheduledJobContext {
  runId: string;
  jobName: string;
  scheduledAt: string;
  startedAt: string;
}

export interface ScheduledJob {
  name: string;
  intervalMs: number;
  timeoutMs: number;
  run(context: ScheduledJobContext): Promise<void>;
}

export interface ScheduledJobState {
  name: string;
  nextRunAt: string;
  lastStartedAt?: string;
  lastCompletedAt?: string;
  lastFailedAt?: string;
  lastError?: string;
  consecutiveFailures: number;
  running: boolean;
}

export interface SchedulerStateRepository {
  get(name: string): Promise<ScheduledJobState | null>;
  save(state: ScheduledJobState): Promise<void>;
}

export interface SchedulerRunResult {
  jobName: string;
  runId: string;
  status: "completed" | "failed" | "skipped";
  startedAt: string;
  completedAt: string;
  error?: string;
}

function addMilliseconds(iso: string, milliseconds: number): string {
  return new Date(Date.parse(iso) + milliseconds).toISOString();
}

function timeoutAfter(milliseconds: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Scheduled job timed out after ${milliseconds}ms.`)), milliseconds);
  });
}

export class CommerceScheduler {
  readonly jobs: readonly ScheduledJob[];
  readonly repository: SchedulerStateRepository;

  constructor(jobs: readonly ScheduledJob[], repository: SchedulerStateRepository) {
    const names = new Set<string>();
    for (const job of jobs) {
      if (names.has(job.name)) throw new Error(`Duplicate scheduled job name: ${job.name}.`);
      if (job.intervalMs <= 0) throw new Error(`Job ${job.name} interval must be positive.`);
      if (job.timeoutMs <= 0) throw new Error(`Job ${job.name} timeout must be positive.`);
      names.add(job.name);
    }
    this.jobs = jobs;
    this.repository = repository;
  }

  async runDue(now = new Date().toISOString()): Promise<SchedulerRunResult[]> {
    const results: SchedulerRunResult[] = [];
    for (const job of this.jobs) {
      const state = await this.repository.get(job.name);
      if (state?.running) {
        results.push({
          jobName: job.name,
          runId: crypto.randomUUID(),
          status: "skipped",
          startedAt: now,
          completedAt: now,
          error: "Previous execution is still marked running.",
        });
        continue;
      }

      if (state && Date.parse(state.nextRunAt) > Date.parse(now)) continue;
      results.push(await this.runJob(job, state, now));
    }
    return results;
  }

  private async runJob(
    job: ScheduledJob,
    previous: ScheduledJobState | null,
    scheduledAt: string,
  ): Promise<SchedulerRunResult> {
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const runningState: ScheduledJobState = {
      name: job.name,
      nextRunAt: addMilliseconds(scheduledAt, job.intervalMs),
      lastStartedAt: startedAt,
      lastCompletedAt: previous?.lastCompletedAt,
      lastFailedAt: previous?.lastFailedAt,
      lastError: previous?.lastError,
      consecutiveFailures: previous?.consecutiveFailures ?? 0,
      running: true,
    };
    await this.repository.save(runningState);

    try {
      await Promise.race([
        job.run({ runId, jobName: job.name, scheduledAt, startedAt }),
        timeoutAfter(job.timeoutMs),
      ]);
      const completedAt = new Date().toISOString();
      await this.repository.save({
        ...runningState,
        running: false,
        lastCompletedAt: completedAt,
        lastError: undefined,
        consecutiveFailures: 0,
      });
      return {
        jobName: job.name,
        runId,
        status: "completed",
        startedAt,
        completedAt,
      };
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.save({
        ...runningState,
        running: false,
        lastFailedAt: completedAt,
        lastError: message,
        consecutiveFailures: runningState.consecutiveFailures + 1,
      });
      return {
        jobName: job.name,
        runId,
        status: "failed",
        startedAt,
        completedAt,
        error: message,
      };
    }
  }
}

export const commerceSchedulerDefaults = {
  expiredReservationCleanupMs: 60_000,
  reconciliationMs: 5 * 60_000,
  outboxDispatchMs: 5_000,
  retryDispatchMs: 30_000,
  deadLetterCleanupMs: 24 * 60 * 60_000,
  diagnosticsSnapshotMs: 60_000,
} as const;
