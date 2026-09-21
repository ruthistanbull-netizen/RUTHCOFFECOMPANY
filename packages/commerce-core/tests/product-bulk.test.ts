import assert from "node:assert/strict";
import test from "node:test";
import {
  applyProductBulkPricing,
  applyProductBulkRelation,
  applyProductBulkStock,
  stockStatusForCount,
} from "../src/product-bulk.ts";

test("reapplying the same percentage discount does not compound", () => {
  const first = applyProductBulkPricing(1000, null, { discountAction: "apply", discountPercent: 20 });
  assert.deepEqual(first, { price: 800, compareAtPrice: 1000 });

  const second = applyProductBulkPricing(first.price, first.compareAtPrice, { discountAction: "apply", discountPercent: 20 });
  assert.deepEqual(second, first);
});

test("removing a discount restores the compare-at price", () => {
  const result = applyProductBulkPricing(800, 1000, { discountAction: "remove" });
  assert.deepEqual(result, { price: 1000, compareAtPrice: null });
});

test("zero stock is always out of stock even when in-stock was requested", () => {
  assert.equal(stockStatusForCount(0, "in_stock"), "out_of_stock");
  assert.equal(stockStatusForCount(-5, "preorder"), "out_of_stock");
  assert.equal(stockStatusForCount(3, "preorder"), "preorder");
});

test("bulk stock quantity never invents a Standard variant", () => {
  assert.throws(
    () => applyProductBulkStock([], { mode: "set", scope: "total", value: 8 }),
    /Otomatik Standart varyant oluşturulmaz/,
  );
});

test("total stock distribution is deterministic and preserves the requested total", () => {
  const next = applyProductBulkStock([1, 5, 9], { mode: "set", scope: "total", value: 8 });
  assert.deepEqual(next, [3, 3, 2]);
  assert.equal(next.reduce((sum, value) => sum + value, 0), 8);
});

test("relation mutation keeps one ordered canonical relation list", () => {
  assert.deepEqual(applyProductBulkRelation(["a", "b"], ["b", "c"], "add"), ["a", "b", "c"]);
  assert.deepEqual(applyProductBulkRelation(["a", "b", "c"], ["a", "c"], "remove"), ["b"]);
});
