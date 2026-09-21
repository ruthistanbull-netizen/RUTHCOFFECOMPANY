import assert from "node:assert/strict";
import test from "node:test";
import {
  createRuthieConnectorRegistry,
  createRuthieToolRegistry,
  dispatchRuthieAction,
  planRuthieAction,
  RUTHIE_ALLOWED_ENGINES,
  runRuthieCoreSelfTest,
  type RuthieEngineGateway,
} from "../src/ruthie.ts";

const admin = {
  actorId: "admin-1",
  role: "admin" as const,
  permissions: ["*"],
};

test("Ruthie Core registers unique tools, connectors and all engine access boundaries", () => {
  const tools = createRuthieToolRegistry();
  const connectors = createRuthieConnectorRegistry();

  assert.ok(tools.size >= 25);
  assert.ok(connectors.size >= 16);
  assert.equal(new Set(tools.keys()).size, tools.size);
  assert.equal(new Set(connectors.keys()).size, connectors.size);
  assert.deepEqual(RUTHIE_ALLOWED_ENGINES, [
    "catalog",
    "pricing",
    "promotion",
    "cart",
    "checkout",
    "payment",
    "order",
    "inventory",
    "shipping",
    "customer",
    "loyalty",
    "return",
    "notification",
    "cms",
  ]);
});

test("Ruthie Core does not request confirmation for read-only tools", () => {
  const plan = planRuthieAction({
    toolId: "order.read",
    surface: "chat",
    actor: admin,
    input: { orderId: "order-1" },
    correlationId: "corr-read" as never,
  });

  assert.equal(plan.status, "ready");
  assert.equal(plan.confirmation.required, false);
  assert.equal(plan.confirmation.mode, "none");
});

test("Ruthie Core requests voice confirmation for risky voice commands", () => {
  const plan = planRuthieAction({
    toolId: "payment.refund",
    surface: "voice",
    actor: admin,
    input: { orderId: "order-1", amountMinor: 5000 },
    correlationId: "corr-refund" as never,
    idempotencyKey: "idem-refund" as never,
  });

  assert.equal(plan.status, "awaiting_confirmation");
  assert.equal(plan.confirmation.required, true);
  assert.equal(plan.confirmation.mode, "voice");
  assert.ok(plan.confirmation.acceptedVoicePhrases?.includes("evet onaylıyorum"));
});

test("Ruthie Core requests chat confirmation for risky chat commands", () => {
  const plan = planRuthieAction({
    toolId: "catalog.product.update",
    surface: "chat",
    actor: admin,
    input: { productId: "product-1", title: "Yeni isim" },
    correlationId: "corr-product" as never,
    idempotencyKey: "idem-product" as never,
  });

  assert.equal(plan.status, "awaiting_confirmation");
  assert.equal(plan.confirmation.mode, "chat");
});

test("Ruthie Core blocks tools when the actor permission is missing", () => {
  const plan = planRuthieAction({
    toolId: "inventory.adjust",
    surface: "chat",
    actor: { ...admin, permissions: ["orders.read"] },
    input: { sku: "SKU-1", quantity: 2 },
    correlationId: "corr-blocked" as never,
    idempotencyKey: "idem-blocked" as never,
  });

  assert.equal(plan.status, "blocked");
  assert.match(plan.reason, /inventory\.adjust/);
});

test("Ruthie Core dispatches only through the selected engine gateway", async () => {
  const calls: string[] = [];
  const gateway: RuthieEngineGateway = {
    async query<TData>(engine, toolId): Promise<TData> {
      calls.push(`query:${engine}:${toolId}`);
      return { orderNumber: "RTH-1" } as TData;
    },
    async command<TData>(engine, toolId): Promise<TData> {
      calls.push(`command:${engine}:${toolId}`);
      return { updated: true } as TData;
    },
  };

  const readPlan = planRuthieAction({
    toolId: "order.read",
    surface: "chat",
    actor: admin,
    input: { orderId: "order-1" },
    correlationId: "corr-dispatch-read" as never,
  });
  const readResult = await dispatchRuthieAction(readPlan, gateway);

  const writePlan = planRuthieAction({
    toolId: "order.update",
    surface: "voice",
    actor: admin,
    input: { orderId: "order-1", status: "ready_to_ship" },
    correlationId: "corr-dispatch-write" as never,
    idempotencyKey: "idem-dispatch-write" as never,
  });
  const deniedResult = await dispatchRuthieAction(writePlan, gateway, false);
  const writeResult = await dispatchRuthieAction(writePlan, gateway, true);

  assert.equal(readResult.ok, true);
  assert.equal(deniedResult.ok, false);
  assert.equal(deniedResult.error?.code, "RUTHIE_CONFIRMATION_REQUIRED");
  assert.equal(writeResult.ok, true);
  assert.deepEqual(calls, ["query:order:order.read", "command:order:order.update"]);
});

test("Ruthie Core self-test validates registries and confirmation policy", () => {
  assert.match(runRuthieCoreSelfTest(), /araç/);
  assert.match(runRuthieCoreSelfTest(), /connector/);
});
