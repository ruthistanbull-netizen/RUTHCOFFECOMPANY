export interface LockLease {
  key: string;
  ownerId: string;
  acquiredAt: string;
  expiresAt?: string;
}

export interface DistributedLockManager {
  tryAcquire(key: string, ownerId: string, ttlMs?: number): Promise<LockLease | null>;
  release(lease: LockLease): Promise<void>;
}

export class LockUnavailableError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Distributed lock is not available for key ${key}.`);
    this.name = "LockUnavailableError";
    this.key = key;
  }
}

export async function withDistributedLock<T>(input: {
  locks: DistributedLockManager;
  key: string;
  ownerId: string;
  ttlMs?: number;
  operation: () => Promise<T>;
}): Promise<T> {
  const lease = await input.locks.tryAcquire(input.key, input.ownerId, input.ttlMs);
  if (!lease) throw new LockUnavailableError(input.key);

  try {
    return await input.operation();
  } finally {
    await input.locks.release(lease);
  }
}

export interface PostgresAdvisoryLockSession {
  query<TResult extends Record<string, unknown>>(
    sql: string,
    params: readonly unknown[],
  ): Promise<{ rows: TResult[] }>;
}

export class PostgresAdvisoryLockManager implements DistributedLockManager {
  readonly session: PostgresAdvisoryLockSession;

  constructor(session: PostgresAdvisoryLockSession) {
    this.session = session;
  }

  async tryAcquire(key: string, ownerId: string): Promise<LockLease | null> {
    const result = await this.session.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock(hashtextextended($1, 0)) as acquired",
      [key],
    );

    if (!result.rows[0]?.acquired) return null;

    return {
      key,
      ownerId,
      acquiredAt: new Date().toISOString(),
    };
  }

  async release(lease: LockLease): Promise<void> {
    await this.session.query<{ released: boolean }>(
      "select pg_advisory_unlock(hashtextextended($1, 0)) as released",
      [lease.key],
    );
  }
}

export function orderLockKey(orderId: string): string {
  return `commerce:order:${orderId}`;
}

export function paymentCallbackLockKey(provider: string, callbackId: string): string {
  return `commerce:payment-callback:${provider}:${callbackId}`;
}

export function paymentIntentLockKey(paymentIntentId: string): string {
  return `commerce:payment-intent:${paymentIntentId}`;
}

export function inventoryLockKey(variantId: string): string {
  return `commerce:inventory:${variantId}`;
}

export function reservationLockKey(reservationId: string): string {
  return `commerce:reservation:${reservationId}`;
}
