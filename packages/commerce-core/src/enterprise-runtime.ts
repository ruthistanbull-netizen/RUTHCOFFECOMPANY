import type { DiagnosticsReport } from "./diagnostics";
import type { ScheduledJob, ScheduledJobContext } from "./scheduler";
import { commerceSchedulerDefaults } from "./scheduler";

export interface EnterpriseWorkerResult {
  processed: number;
  failed?: number;
  metadata?: Record<string, unknown>;
}

export interface EnterpriseBatchWorker {
  run(context: ScheduledJobContext): Promise<EnterpriseWorkerResult>;
}

export interface DiagnosticsSnapshotWriter {
  runDiagnostics(): Promise<DiagnosticsReport>;
  save(report: DiagnosticsReport): Promise<void>;
}

export interface CommerceEnterpriseRuntimeServices {
  expiredReservationCleanup: EnterpriseBatchWorker;
  reconciliation: EnterpriseBatchWorker;
  outboxDispatch: EnterpriseBatchWorker;
  retryDispatch: EnterpriseBatchWorker;
  deadLetterCleanup: EnterpriseBatchWorker;
  diagnostics: DiagnosticsSnapshotWriter;
}

function createBatchJob(input: {
  name: string;
  intervalMs: number;
  timeoutMs: number;
  worker: EnterpriseBatchWorker;
}): ScheduledJob {
  return {
    name: input.name,
    intervalMs: input.intervalMs,
    timeoutMs: input.timeoutMs,
    async run(context) {
      const result = await input.worker.run(context);
      if ((result.failed ?? 0) > 0) {
        throw new Error(`${input.name} completed with ${result.failed} failed item(s).`);
      }
    },
  };
}

export function createCommerceEnterpriseJobs(
  services: CommerceEnterpriseRuntimeServices,
): ScheduledJob[] {
  return [
    createBatchJob({
      name: "expired-reservation-cleanup",
      intervalMs: commerceSchedulerDefaults.expiredReservationCleanupMs,
      timeoutMs: 45_000,
      worker: services.expiredReservationCleanup,
    }),
    createBatchJob({
      name: "commerce-reconciliation",
      intervalMs: commerceSchedulerDefaults.reconciliationMs,
      timeoutMs: 4 * 60_000,
      worker: services.reconciliation,
    }),
    createBatchJob({
      name: "outbox-dispatch",
      intervalMs: commerceSchedulerDefaults.outboxDispatchMs,
      timeoutMs: 4_000,
      worker: services.outboxDispatch,
    }),
    createBatchJob({
      name: "retry-dispatch",
      intervalMs: commerceSchedulerDefaults.retryDispatchMs,
      timeoutMs: 25_000,
      worker: services.retryDispatch,
    }),
    createBatchJob({
      name: "dead-letter-cleanup",
      intervalMs: commerceSchedulerDefaults.deadLetterCleanupMs,
      timeoutMs: 10 * 60_000,
      worker: services.deadLetterCleanup,
    }),
    {
      name: "diagnostics-snapshot",
      intervalMs: commerceSchedulerDefaults.diagnosticsSnapshotMs,
      timeoutMs: 30_000,
      async run() {
        const report = await services.diagnostics.runDiagnostics();
        await services.diagnostics.save(report);
      },
    },
  ];
}
