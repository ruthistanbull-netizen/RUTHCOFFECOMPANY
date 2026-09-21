import {
  applyAutomaticReconciliation,
  reconcileCommerceState,
} from "./reconciliation";
import type {
  ReconciliationAction,
  ReconciliationExecutor,
  ReconciliationReport,
  ReconciliationSnapshot,
} from "./reconciliation";
import { orderLockKey, withDistributedLock } from "./distributed-lock";
import type { DistributedLockManager } from "./distributed-lock";
import {
  createCorrelationContext,
  createNoopObservability,
  withObservedOperation,
} from "./observability";
import type { Observability } from "./observability";

export interface ReconciliationDataSource {
  listCandidateOrderIds(limit: number, now: string): Promise<string[]>;
  loadSnapshot(orderId: string): Promise<ReconciliationSnapshot>;
}

export interface ReconciliationReportRepository {
  save(input: {
    report: ReconciliationReport;
    snapshot: ReconciliationSnapshot;
    appliedActions: readonly ReconciliationAction[];
    startedAt: string;
    completedAt: string;
  }): Promise<void>;
}

export interface ReconciliationWorkerResult {
  scanned: number;
  consistent: number;
  repaired: number;
  manualReview: number;
  failed: number;
  reports: ReconciliationReport[];
}

export class CommerceReconciliationWorker {
  readonly source: ReconciliationDataSource;
  readonly reports: ReconciliationReportRepository;
  readonly executor: ReconciliationExecutor;
  readonly locks?: DistributedLockManager;
  readonly observability: Observability;

  constructor(input: {
    source: ReconciliationDataSource;
    reports: ReconciliationReportRepository;
    executor: ReconciliationExecutor;
    locks?: DistributedLockManager;
    observability?: Observability;
  }) {
    this.source = input.source;
    this.reports = input.reports;
    this.executor = input.executor;
    this.locks = input.locks;
    this.observability = input.observability ?? createNoopObservability();
  }

  async run(now = new Date().toISOString(), limit = 100): Promise<ReconciliationWorkerResult> {
    const orderIds = await this.source.listCandidateOrderIds(limit, now);
    const result: ReconciliationWorkerResult = {
      scanned: orderIds.length,
      consistent: 0,
      repaired: 0,
      manualReview: 0,
      failed: 0,
      reports: [],
    };

    for (const orderId of orderIds) {
      try {
        const report = await this.processOrder(orderId);
        result.reports.push(report);
        if (report.status === "consistent") result.consistent += 1;
        else if (report.status === "manual_review") result.manualReview += 1;
        else result.repaired += 1;
      } catch {
        result.failed += 1;
      }
    }

    return result;
  }

  private async processOrder(orderId: string): Promise<ReconciliationReport> {
    const context = createCorrelationContext({ orderId });
    const operation = async (): Promise<ReconciliationReport> => {
      const startedAt = new Date().toISOString();
      const snapshot = await this.source.loadSnapshot(orderId);
      const report = reconcileCommerceState(snapshot);
      const appliedActions = report.status === "repairable"
        ? await applyAutomaticReconciliation(report, this.executor)
        : [];
      await this.reports.save({
        report,
        snapshot,
        appliedActions,
        startedAt,
        completedAt: new Date().toISOString(),
      });
      return report;
    };

    return withObservedOperation({
      observability: this.observability,
      name: "commerce.reconcile_order",
      context,
      attributes: { orderId },
      operation: this.locks
        ? () => withDistributedLock({
            locks: this.locks as DistributedLockManager,
            key: orderLockKey(orderId),
            ownerId: `reconciliation:${crypto.randomUUID()}`,
            operation,
          })
        : operation,
    });
  }
}
