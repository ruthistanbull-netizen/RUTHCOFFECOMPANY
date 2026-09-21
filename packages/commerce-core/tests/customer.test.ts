import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalCustomer, CustomerIdentityInput, CustomerMatchCandidate } from "@ruth-commerce/contracts/customer";
import {
  asCustomerId,
  chooseCanonicalCustomerCandidate,
  customerEmailEligibility,
  customerIdentityKeys,
  customerMembershipStatus,
  matchingCanonicalCustomerCandidates,
  mergeCustomerFacts,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "../src/customer.ts";

test("normalizes Turkish customer e-mail and phone identities", () => {
  assert.equal(normalizeCustomerEmail("  TEST@Example.COM "), "test@example.com");
  assert.equal(normalizeCustomerPhone("+90 (532) 111 22 33"), "5321112233");
  assert.deepEqual(customerIdentityKeys({
    profileId: "profile-1",
    email: " TEST@Example.COM ",
    phone: "+90 532 111 22 33",
  }), ["profile:profile-1", "email:test@example.com", "phone:5321112233"]);
});

test("member status belongs only to linked membership identities", () => {
  assert.equal(customerMembershipStatus({ profileId: "profile-1" }), "member");
  assert.equal(customerMembershipStatus({ authUserId: "auth-1" }), "member");
  assert.equal(customerMembershipStatus({ isLegacyMember: true }), "member");
  assert.equal(customerMembershipStatus({}), "guest");
});

test("profile and e-mail matches remain primary while phone matches join the merge set", () => {
  const input: CustomerIdentityInput = {
    profileId: "profile-1",
    email: "member@example.com",
    phone: "5321112233",
    fullName: "Member",
    source: "order",
    seenAt: "2026-08-01T00:00:00.000Z",
  };
  const candidates: CustomerMatchCandidate[] = [
    {
      id: asCustomerId("phone-customer"),
      membershipStatus: "guest",
      normalizedPhone: "5321112233",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: asCustomerId("member-customer"),
      profileId: "profile-1",
      membershipStatus: "member",
      normalizedEmail: "member@example.com",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  ];

  assert.equal(chooseCanonicalCustomerCandidate(input, candidates)?.id, "member-customer");
  assert.deepEqual(
    matchingCanonicalCustomerCandidates(input, candidates).map((candidate) => candidate.id),
    ["member-customer", "phone-customer"],
  );
});

test("a matching phone resolves the same customer even when the incoming e-mail is different", () => {
  const input: CustomerIdentityInput = {
    email: "second@example.com",
    phone: "5321112233",
    source: "order",
    seenAt: "2026-08-01T00:00:00.000Z",
  };
  const candidates: CustomerMatchCandidate[] = [{
    id: asCustomerId("first-customer"),
    membershipStatus: "guest",
    normalizedEmail: "first@example.com",
    normalizedPhone: "5321112233",
    createdAt: "2026-01-01T00:00:00.000Z",
  }];

  assert.equal(chooseCanonicalCustomerCandidate(input, candidates)?.id, "first-customer");
});

test("different membership profiles sharing a phone belong to the same canonical match set", () => {
  const input: CustomerIdentityInput = {
    profileId: "profile-2",
    phone: "5321112233",
    source: "profile",
    seenAt: "2026-08-01T00:00:00.000Z",
  };
  const candidates: CustomerMatchCandidate[] = [{
    id: asCustomerId("profile-1-customer"),
    profileId: "profile-1",
    membershipStatus: "member",
    normalizedPhone: "5321112233",
    createdAt: "2026-01-01T00:00:00.000Z",
  }];

  assert.equal(chooseCanonicalCustomerCandidate(input, candidates)?.id, "profile-1-customer");
});

test("guest facts are upgraded when the same customer becomes a member", () => {
  const current: CanonicalCustomer = {
    id: asCustomerId("customer-1"),
    membershipStatus: "guest",
    source: "order",
    fullName: "Eski İsim",
    email: "guest@example.com",
    phone: "5321112233",
    serviceEmailAllowed: true,
    marketingEmailState: "unknown",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };

  const merged = mergeCustomerFacts(current, {
    profileId: "profile-1",
    fullName: "Yeni İsim",
    email: "GUEST@example.com",
    phone: "+90 532 111 22 33",
    source: "profile",
    seenAt: "2026-08-01T00:00:00.000Z",
  });

  assert.equal(merged.profileId, "profile-1");
  assert.equal(merged.membershipStatus, "member");
  assert.equal(merged.source, "profile");
  assert.equal(merged.fullName, "Yeni İsim");
  assert.equal(merged.email, "guest@example.com");
});

test("an additional membership profile keeps the existing primary profile", () => {
  const current: CanonicalCustomer = {
    id: asCustomerId("customer-1"),
    profileId: "profile-1",
    membershipStatus: "member",
    source: "profile",
    email: "primary@example.com",
    phone: "5321112233",
    serviceEmailAllowed: true,
    marketingEmailState: "unknown",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-02-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  };

  const merged = mergeCustomerFacts(current, {
    profileId: "profile-2",
    email: "secondary@example.com",
    phone: "5321112233",
    source: "profile",
    seenAt: "2026-08-01T00:00:00.000Z",
  });

  assert.equal(merged.profileId, "profile-1");
  assert.equal(merged.email, "primary@example.com");
  assert.equal(merged.phone, "5321112233");
  assert.equal(merged.membershipStatus, "member");
});

test("service e-mail is allowed for purchasers but marketing requires explicit consent", () => {
  const base = {
    customerId: asCustomerId("customer-1"),
    email: "customer@example.com",
    serviceEmailAllowed: true,
  } as const;

  assert.deepEqual(customerEmailEligibility({ ...base, marketingEmailState: "unknown" }, "service"), {
    allowed: true,
    purpose: "service",
    reason: "allowed_service_message",
  });
  assert.deepEqual(customerEmailEligibility({ ...base, marketingEmailState: "unknown" }, "marketing"), {
    allowed: false,
    purpose: "marketing",
    reason: "marketing_consent_missing",
  });
  assert.deepEqual(customerEmailEligibility({ ...base, marketingEmailState: "granted" }, "marketing"), {
    allowed: true,
    purpose: "marketing",
    reason: "explicit_marketing_consent",
  });
});
