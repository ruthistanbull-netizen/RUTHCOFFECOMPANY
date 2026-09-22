export type AdminFreshnessVersion = {
  sequence: number;
  revision: number | null;
  authoritativeAt: number | null;
};

export type AdminFreshnessCandidate = {
  sequence: number;
  revision?: number | null;
  authoritativeAt?: number | null;
};

const TIMESTAMP_KEYS = [
  "generatedAt",
  "generated_at",
  "refreshedAt",
  "refreshed_at",
  "updatedAt",
  "updated_at",
] as const;

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function explicitPayloadTimestamp(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of TIMESTAMP_KEYS) {
    const parsed = normalizeTimestamp(record[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

export function shouldAcceptFreshness(
  previous: AdminFreshnessVersion | null | undefined,
  candidate: AdminFreshnessCandidate,
) {
  if (!previous) return true;

  const candidateRevision = finiteNumber(candidate.revision);
  const previousRevision = finiteNumber(previous.revision);
  if (candidateRevision != null && previousRevision != null && candidateRevision !== previousRevision) {
    return candidateRevision > previousRevision;
  }

  const candidateAt = normalizeTimestamp(candidate.authoritativeAt);
  const previousAt = normalizeTimestamp(previous.authoritativeAt);
  if (candidateAt != null && previousAt != null && candidateAt !== previousAt) {
    return candidateAt > previousAt;
  }

  return candidate.sequence >= previous.sequence;
}

export class AdminFreshnessKernel {
  private counters = new Map<string, number>();
  private accepted = new Map<string, AdminFreshnessVersion>();

  begin(path: string) {
    const next = (this.counters.get(path) || 0) + 1;
    this.counters.set(path, next);
    return next;
  }

  accept(path: string, candidate: AdminFreshnessCandidate) {
    const normalized: AdminFreshnessVersion = {
      sequence: candidate.sequence,
      revision: finiteNumber(candidate.revision),
      authoritativeAt: normalizeTimestamp(candidate.authoritativeAt),
    };
    const previous = this.accepted.get(path);
    if (!shouldAcceptFreshness(previous, normalized)) return false;
    this.accepted.set(path, normalized);
    if ((this.counters.get(path) || 0) < normalized.sequence) this.counters.set(path, normalized.sequence);
    return true;
  }

  acceptExternal(path: string, options: Omit<AdminFreshnessCandidate, "sequence"> = {}) {
    const sequence = this.begin(path);
    return {
      accepted: this.accept(path, { ...options, sequence }),
      sequence,
    };
  }

  latestSequence(path: string) {
    return this.counters.get(path) || 0;
  }

  current(path: string) {
    return this.accepted.get(path) || null;
  }

  clear(match?: string) {
    for (const key of [...this.counters.keys()]) if (!match || key.includes(match)) this.counters.delete(key);
    for (const key of [...this.accepted.keys()]) if (!match || key.includes(match)) this.accepted.delete(key);
  }
}
