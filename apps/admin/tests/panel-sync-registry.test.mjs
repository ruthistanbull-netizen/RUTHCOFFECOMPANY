import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_SYNC_TARGETS,
  normalizePanelRoute,
  panelSnapshotEligible,
  panelSnapshotRoutineExpiry,
} from "../src/lib/panelSyncRegistry.ts";

test("all Store Design and theme editing routes bypass persisted snapshots", () => {
  for (const route of [
    "/api/theme",
    "/api/theme?editor=1790371500000",
    "/api/theme-editor-pages?editor=1790371500000",
    "/api/theme-sections?t=1790371500000",
    "/api/store-design-v2?t=1790371500000",
    "/api/store-design-v2/page?slug=home",
  ]) {
    assert.equal(panelSnapshotEligible(route), false, route);
  }
  assert.equal(PANEL_SYNC_TARGETS.some((target) => target.route === "/api/theme"), false);
});

test("real dashboard queries still keep their meaningful parameters", () => {
  assert.equal(panelSnapshotEligible("/api/summary?range=last_7_days"), true);
  assert.equal(panelSnapshotEligible("/api/site-settings"), true);
  assert.equal(normalizePanelRoute("/api/summary?range=last_7_days&t=1790371500000"), "/api/summary?range=last_7_days");
  assert.equal(normalizePanelRoute("/api/summary?range=today"), "/api/summary?range=today");
  assert.equal(panelSnapshotEligible("/api/products"), false);
});

test("routine TTL expiry does not count as a worker failure", () => {
  const expiry = "ROSTA self-heal: read model expired";
  assert.equal(panelSnapshotRoutineExpiry({ status: "stale", last_error: expiry }), true);
  assert.equal(panelSnapshotRoutineExpiry({ status: "error", last_error: expiry }), false);
  assert.equal(panelSnapshotRoutineExpiry({ status: "stale", last_error: "fetch failed" }), false);
  assert.equal(panelSnapshotRoutineExpiry({ status: "healthy", last_error: expiry }), false);
  assert.equal(panelSnapshotRoutineExpiry({ status: "stale", last_error: null }), false);
});
