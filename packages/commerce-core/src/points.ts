import type {
  CustomerId,
  IsoDateTime,
  OrderId,
  PointsLedgerEntry,
  PointsLedgerEntryId,
  PointsLedgerEntryType,
} from "@ruth-commerce/contracts";
import { CommerceInvariantError } from "./index";

export interface RuthiePointsAccount {
  customerId: CustomerId;
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  updatedAt: IsoDateTime;
}

export interface ApplyPointsEntryInput {
  account: RuthiePointsAccount;
  entryId: PointsLedgerEntryId;
  type: PointsLedgerEntryType;
  points: number;
  now: IsoDateTime;
  orderId?: OrderId;
  reason?: string;
  expiresAt?: IsoDateTime;
}

export interface PointsMutationResult {
  account: RuthiePointsAccount;
  entry: PointsLedgerEntry;
}

export interface LoyaltyRewardSettings {
  signupPoints: number;
  birthdayPoints: number;
}

export const DEFAULT_LOYALTY_REWARD_SETTINGS: Readonly<LoyaltyRewardSettings> = Object.freeze({
  signupPoints: 2_000,
  birthdayPoints: 0,
});

const MAX_CONFIGURED_REWARD_POINTS = 10_000_000;

function configuredRewardPoints(value: unknown, field: keyof LoyaltyRewardSettings): number {
  const points = Number(value);
  if (!Number.isSafeInteger(points) || points < 0 || points > MAX_CONFIGURED_REWARD_POINTS) {
    throw new CommerceInvariantError(
      "INVALID_LOYALTY_REWARD_SETTING",
      `${field} must be a non-negative safe integer no greater than ${MAX_CONFIGURED_REWARD_POINTS}.`,
    );
  }
  return points;
}

export function normalizeLoyaltyRewardSettings(input: {
  signupPoints?: unknown;
  birthdayPoints?: unknown;
}): LoyaltyRewardSettings {
  return {
    signupPoints: configuredRewardPoints(input.signupPoints, "signupPoints"),
    birthdayPoints: configuredRewardPoints(input.birthdayPoints, "birthdayPoints"),
  };
}

const creditTypes: ReadonlySet<PointsLedgerEntryType> = new Set([
  "earned",
  "admin_credit",
  "refund_reversal",
]);

const debitTypes: ReadonlySet<PointsLedgerEntryType> = new Set([
  "spent",
  "expired",
  "admin_debit",
]);

export function applyPointsEntry(input: ApplyPointsEntryInput): PointsMutationResult {
  if (!Number.isSafeInteger(input.points) || input.points <= 0) {
    throw new CommerceInvariantError(
      "INVALID_POINTS_AMOUNT",
      "Ruthie Points amount must be a positive safe integer.",
    );
  }

  const direction = creditTypes.has(input.type) ? 1 : debitTypes.has(input.type) ? -1 : 0;
  if (direction === 0) {
    throw new CommerceInvariantError("UNSUPPORTED_POINTS_ENTRY", "Unsupported Ruthie Points entry type.");
  }

  const balanceAfter = input.account.balance + input.points * direction;
  if (balanceAfter < 0) {
    throw new CommerceInvariantError(
      "INSUFFICIENT_POINTS_BALANCE",
      `Customer has ${input.account.balance} point(s), but ${input.points} point(s) were requested.`,
    );
  }

  const spentIncrease = direction < 0 ? input.points : 0;
  const earnedIncrease = direction > 0 ? input.points : 0;

  return {
    account: {
      ...input.account,
      balance: balanceAfter,
      lifetimeEarned: input.account.lifetimeEarned + earnedIncrease,
      lifetimeSpent: input.account.lifetimeSpent + spentIncrease,
      updatedAt: input.now,
    },
    entry: {
      id: input.entryId,
      customerId: input.account.customerId,
      type: input.type,
      points: input.points,
      balanceAfter,
      orderId: input.orderId,
      reason: input.reason,
      expiresAt: input.expiresAt,
      createdAt: input.now,
    },
  };
}

export function calculateEarnedPoints(
  paidAmountMinor: number,
  pointsPerTry = 1,
): number {
  if (!Number.isSafeInteger(paidAmountMinor) || paidAmountMinor < 0) {
    throw new CommerceInvariantError(
      "INVALID_PAID_AMOUNT",
      "Paid amount must be a non-negative safe integer in minor units.",
    );
  }

  if (!Number.isFinite(pointsPerTry) || pointsPerTry < 0) {
    throw new CommerceInvariantError(
      "INVALID_POINTS_RATE",
      "Points earning rate must be a non-negative number.",
    );
  }

  return Math.floor((paidAmountMinor / 100) * pointsPerTry);
}
