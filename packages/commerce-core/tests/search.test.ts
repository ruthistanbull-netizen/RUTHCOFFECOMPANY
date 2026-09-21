import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeSearchCursor,
  normalizeSearchText,
  paginateRankedSearchResults,
  rankSearchCandidates,
} from "../src/search.ts";

test("Search core normalizes Turkish characters and spacing", () => {
  assert.equal(normalizeSearchText("  Görkem   Çırık "), "gorkem cirik");
  assert.equal(normalizeSearchText("RTH-2026/001"), "rth-2026 001");
});

test("Search core ranks exact references above partial customer matches", () => {
  const ranked = rankSearchCandidates("RTH2026001", [
    {
      id: "order-1",
      entityType: "payment_order",
      title: "RTH2026001",
      fields: [
        { field: "order_no", value: "RTH2026001", weight: 300 },
        { field: "customer_name", value: "Rth Test", weight: 100 },
      ],
      entity: { orderId: "order-1" },
    },
    {
      id: "order-2",
      entityType: "payment_order",
      title: "RTH20260012",
      fields: [{ field: "order_no", value: "RTH20260012", weight: 300 }],
      entity: { orderId: "order-2" },
    },
  ]);

  assert.equal(ranked[0].id, "order-1");
  assert.ok(ranked[0].score > ranked[1].score);
  assert.deepEqual(ranked[0].highlights?.order_no, ["RTH2026001"]);
});

test("Search core matches formatted phone numbers by compact digits", () => {
  const ranked = rankSearchCandidates("5321234567", [{
    id: "order-1",
    entityType: "payment_order",
    title: "Sipariş",
    fields: [{ field: "customer_phone", value: "+90 (532) 123 45 67", weight: 200 }],
    entity: { orderId: "order-1" },
  }]);

  assert.equal(ranked.length, 1);
});

test("Search core cursor pagination is stable", () => {
  const ranked = rankSearchCandidates("ruth", [
    { id: "a", entityType: "x", title: "A", fields: [{ field: "name", value: "Ruth A" }], entity: "a", createdAt: "2026-07-21T03:00:00Z" },
    { id: "b", entityType: "x", title: "B", fields: [{ field: "name", value: "Ruth B" }], entity: "b", createdAt: "2026-07-21T02:00:00Z" },
    { id: "c", entityType: "x", title: "C", fields: [{ field: "name", value: "Ruth C" }], entity: "c", createdAt: "2026-07-21T01:00:00Z" },
  ]);

  const first = paginateRankedSearchResults(ranked, { limit: 2 });
  assert.deepEqual(first.results.map((item) => item.id), ["a", "b"]);
  assert.ok(first.nextCursor);
  assert.ok(decodeSearchCursor(first.nextCursor));

  const second = paginateRankedSearchResults(ranked, { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.results.map((item) => item.id), ["c"]);
  assert.equal(second.nextCursor, undefined);
});
