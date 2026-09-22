type UsageKind = "chat" | "realtime";

type UsageBucket = {
  minuteStartedAt: number;
  minuteCount: number;
  day: string;
  dayCount: number;
  lastSeenAt: number;
};

export type RuthieUsageDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  limit: "minute" | "daily" | null;
  remainingMinute: number;
  remainingDaily: number;
};

const buckets = new Map<string, UsageBucket>();
const MINUTE_MS = 60_000;
const STALE_BUCKET_MS = 2 * 24 * 60 * 60 * 1_000;

export function consumeRuthieProviderUsage(options: {
  actorId: string;
  kind: UsageKind;
  now?: number;
  env?: NodeJS.ProcessEnv;
}): RuthieUsageDecision {
  const now = options.now ?? Date.now();
  const env = options.env ?? process.env;
  const minuteLimit = positiveInteger(
    options.kind === "realtime" ? env.RUTHIE_REALTIME_STARTS_PER_MINUTE : env.RUTHIE_CHAT_REQUESTS_PER_MINUTE,
    options.kind === "realtime" ? 6 : 20,
  );
  const dailyLimit = positiveInteger(
    options.kind === "realtime" ? env.RUTHIE_REALTIME_STARTS_PER_DAY : env.RUTHIE_CHAT_REQUESTS_PER_DAY,
    options.kind === "realtime" ? 120 : 500,
  );
  const key = `${options.kind}:${options.actorId}`;
  const day = new Date(now).toISOString().slice(0, 10);
  const current = buckets.get(key) ?? {
    minuteStartedAt: now,
    minuteCount: 0,
    day,
    dayCount: 0,
    lastSeenAt: now,
  };

  if (now - current.minuteStartedAt >= MINUTE_MS) {
    current.minuteStartedAt = now;
    current.minuteCount = 0;
  }
  if (current.day !== day) {
    current.day = day;
    current.dayCount = 0;
  }
  current.lastSeenAt = now;

  if (current.dayCount >= dailyLimit) {
    buckets.set(key, current);
    return {
      allowed: false,
      retryAfterSeconds: secondsUntilUtcDayEnd(now),
      limit: "daily",
      remainingMinute: Math.max(0, minuteLimit - current.minuteCount),
      remainingDaily: 0,
    };
  }
  if (current.minuteCount >= minuteLimit) {
    buckets.set(key, current);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.minuteStartedAt + MINUTE_MS - now) / 1_000)),
      limit: "minute",
      remainingMinute: 0,
      remainingDaily: Math.max(0, dailyLimit - current.dayCount),
    };
  }

  current.minuteCount += 1;
  current.dayCount += 1;
  buckets.set(key, current);
  if (buckets.size > 2_000) pruneBuckets(now);

  return {
    allowed: true,
    retryAfterSeconds: 0,
    limit: null,
    remainingMinute: Math.max(0, minuteLimit - current.minuteCount),
    remainingDaily: Math.max(0, dailyLimit - current.dayCount),
  };
}

export function resetRuthieUsageGuardForTests() {
  buckets.clear();
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function secondsUntilUtcDayEnd(now: number) {
  const date = new Date(now);
  const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now) / 1_000));
}

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastSeenAt > STALE_BUCKET_MS) buckets.delete(key);
  }
}
