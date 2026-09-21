import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LOYALTY_REWARD_SETTINGS,
  normalizeLoyaltyRewardSettings,
} from "../src/points.ts";

test("Loyalty Engine preserves the current production defaults", () => {
  assert.deepEqual(DEFAULT_LOYALTY_REWARD_SETTINGS, {
    signupPoints: 2_000,
    birthdayPoints: 0,
  });
});

test("Loyalty Engine accepts disabled and configured future rewards", () => {
  assert.deepEqual(normalizeLoyaltyRewardSettings({ signupPoints: 0, birthdayPoints: 750 }), {
    signupPoints: 0,
    birthdayPoints: 750,
  });
});

test("Loyalty Engine rejects fractional, negative and excessive settings", () => {
  for (const input of [
    { signupPoints: 1.5, birthdayPoints: 0 },
    { signupPoints: -1, birthdayPoints: 0 },
    { signupPoints: 0, birthdayPoints: 10_000_001 },
  ]) {
    assert.throws(
      () => normalizeLoyaltyRewardSettings(input),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "INVALID_LOYALTY_REWARD_SETTING");
        return true;
      },
    );
  }
});
