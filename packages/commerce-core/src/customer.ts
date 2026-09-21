import type { CustomerId } from "@ruth-commerce/contracts";
import type {
  CanonicalCustomer,
  CustomerCommunicationPreference,
  CustomerEmailEligibility,
  CustomerIdentityInput,
  CustomerMatchCandidate,
  CustomerMembershipStatus,
  EmailMessagePurpose,
} from "@ruth-commerce/contracts/customer";

export function normalizeCustomerEmail(value: unknown): string | undefined {
  const normalized = String(value || "").trim().toLocaleLowerCase("tr-TR");
  return normalized || undefined;
}

export function normalizeCustomerPhone(value: unknown): string | undefined {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return undefined;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function customerMembershipStatus(input: {
  profileId?: string | null;
  authUserId?: string | null;
  isLegacyMember?: boolean | null;
}): CustomerMembershipStatus {
  return input.profileId || input.authUserId || input.isLegacyMember ? "member" : "guest";
}

export function customerIdentityKeys(input: Pick<CustomerIdentityInput, "profileId" | "email" | "phone">): string[] {
  const keys: string[] = [];
  if (input.profileId) keys.push(`profile:${input.profileId}`);
  const email = normalizeCustomerEmail(input.email);
  if (email) keys.push(`email:${email}`);
  const phone = normalizeCustomerPhone(input.phone);
  if (phone) keys.push(`phone:${phone}`);
  return keys;
}

function matchScore(input: CustomerIdentityInput, candidate: CustomerMatchCandidate): number {
  let score = 0;

  if (input.profileId && candidate.profileId === input.profileId) score += 10_000;

  const email = normalizeCustomerEmail(input.email);
  if (email && candidate.normalizedEmail === email) score += 2_000;

  const phone = normalizeCustomerPhone(input.phone);
  if (phone && candidate.normalizedPhone === phone) score += 1_000;

  if (score > 0 && candidate.membershipStatus === "member") score += 100;
  return score;
}

function rankedCanonicalCustomerCandidates(
  input: CustomerIdentityInput,
  candidates: CustomerMatchCandidate[],
) {
  return candidates
    .map((candidate) => ({ candidate, score: matchScore(input, candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftCreatedAt = Date.parse(left.candidate.createdAt) || Number.MAX_SAFE_INTEGER;
      const rightCreatedAt = Date.parse(right.candidate.createdAt) || Number.MAX_SAFE_INTEGER;
      return leftCreatedAt - rightCreatedAt || String(left.candidate.id).localeCompare(String(right.candidate.id));
    });
}

export function matchingCanonicalCustomerCandidates(
  input: CustomerIdentityInput,
  candidates: CustomerMatchCandidate[],
): CustomerMatchCandidate[] {
  return rankedCanonicalCustomerCandidates(input, candidates).map((entry) => entry.candidate);
}

export function chooseCanonicalCustomerCandidate(
  input: CustomerIdentityInput,
  candidates: CustomerMatchCandidate[],
): CustomerMatchCandidate | undefined {
  return rankedCanonicalCustomerCandidates(input, candidates)[0]?.candidate;
}

export function mergeCustomerFacts(
  current: CanonicalCustomer,
  incoming: CustomerIdentityInput,
  linkedProfileId?: string,
): CanonicalCustomer {
  const profileId = current.profileId || linkedProfileId || incoming.profileId;
  const seenAt = Date.parse(incoming.seenAt) || Date.now();
  const firstSeenAt = Math.min(Date.parse(current.firstSeenAt) || seenAt, seenAt);
  const lastSeenAt = Math.max(Date.parse(current.lastSeenAt) || seenAt, seenAt);

  return {
    ...current,
    profileId,
    membershipStatus: profileId ? "member" : current.membershipStatus,
    source: profileId ? "profile" : current.source,
    fullName: incoming.fullName?.trim() || current.fullName,
    email: current.email || normalizeCustomerEmail(incoming.email),
    phone: current.phone || normalizeCustomerPhone(incoming.phone),
    firstSeenAt: new Date(firstSeenAt).toISOString(),
    lastSeenAt: new Date(lastSeenAt).toISOString(),
    updatedAt: new Date(lastSeenAt).toISOString(),
  };
}

export function customerEmailEligibility(
  preference: CustomerCommunicationPreference,
  purpose: EmailMessagePurpose,
): CustomerEmailEligibility {
  if (!normalizeCustomerEmail(preference.email)) {
    return { allowed: false, purpose, reason: "missing_email" };
  }

  if (purpose === "service") {
    return preference.serviceEmailAllowed
      ? { allowed: true, purpose, reason: "allowed_service_message" }
      : { allowed: false, purpose, reason: "service_email_blocked" };
  }

  if (preference.marketingEmailState === "granted") {
    return { allowed: true, purpose, reason: "explicit_marketing_consent" };
  }

  return preference.marketingEmailState === "denied"
    ? { allowed: false, purpose, reason: "marketing_consent_denied" }
    : { allowed: false, purpose, reason: "marketing_consent_missing" };
}

export function asCustomerId(value: string): CustomerId {
  return value as CustomerId;
}
