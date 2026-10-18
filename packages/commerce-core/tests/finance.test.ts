import { test } from "node:test";
import assert from "node:assert/strict";
import {
  financeMinor,
  financeDecimal,
  financeAmount,
  financeDate,
  financePeriod,
  istanbulToday,
  financeCsvCell,
  financeBankCsv,
} from "../src/finance.ts";
test("exact decimal arithmetic and validation", () => {
  assert.equal(
    financeDecimal(financeMinor("0.10") + financeMinor("0.20")),
    "0.30",
  );
  assert.equal(financeAmount("1500,5"), "1500.50");
  assert.equal(financeDecimal(financeMinor("-10.01")), "-10.01");
  for (const v of ["1e3", "NaN", "1.001", "", "1,000.00"])
    assert.throws(() => financeMinor(v));
});
test("Istanbul midnight and calendar filters", () => {
  assert.equal(istanbulToday(new Date("2026-10-17T21:30:00Z")), "2026-10-18");
  assert.deepEqual(financePeriod("last_month", "2026-03-05"), {
    from: "2026-02-01",
    to: "2026-02-28",
  });
  assert.deepEqual(financePeriod("week", "2026-10-18"), {
    from: "2026-10-12",
    to: "2026-10-18",
  });
  assert.throws(() => financeDate("2026-02-30"));
});
test("spreadsheet export prevents formula injection", () => {
  assert.equal(financeCsvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
});

test("bank CSV preserves decimal values and quoted fields", () => {
  assert.deepEqual(
    financeBankCsv(
      'date;amount;reference;description\n2026-10-18;"10,20";R1;"bir; iki"',
    ),
    [
      {
        date: "2026-10-18",
        amount: "10.20",
        reference: "R1",
        description: "bir; iki",
      },
    ],
  );
  assert.throws(() => financeBankCsv("date;amount;reference\n2026-02-30;10;x"));
});
