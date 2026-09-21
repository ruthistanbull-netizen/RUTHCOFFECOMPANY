export interface EventContract<TPayload = unknown> {
  type: string;
  version: number;
  aggregateType: string;
  validate(payload: unknown): payload is TPayload;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasString = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === "string" && String(value[key]).length > 0;

export const commerceEventContracts: readonly EventContract[] = [
  {
    type: "order.created",
    version: 1,
    aggregateType: "order",
    validate: (payload): payload is Record<string, unknown> =>
      isRecord(payload) && hasString(payload, "orderId") && hasString(payload, "orderNumber"),
  },
  {
    type: "order.status_changed",
    version: 1,
    aggregateType: "order",
    validate: (payload): payload is Record<string, unknown> =>
      isRecord(payload) && hasString(payload, "orderId") && hasString(payload, "from") && hasString(payload, "to"),
  },
  {
    type: "payment.paid",
    version: 1,
    aggregateType: "payment",
    validate: (payload): payload is Record<string, unknown> =>
      isRecord(payload) && hasString(payload, "orderId") && hasString(payload, "to"),
  },
  {
    type: "payment.failed",
    version: 1,
    aggregateType: "payment",
    validate: (payload): payload is Record<string, unknown> =>
      isRecord(payload) && hasString(payload, "orderId") && hasString(payload, "to"),
  },
  {
    type: "inventory.reserved",
    version: 1,
    aggregateType: "inventory_reservation",
    validate: (payload): payload is Record<string, unknown> =>
      isRecord(payload) && isRecord(payload.reservation),
  },
  {
    type: "shipment.created",
    version: 1,
    aggregateType: "shipment",
    validate: (payload): payload is Record<string, unknown> =>
      isRecord(payload) && isRecord(payload.shipment),
  },
  {
    type: "points.adjusted",
    version: 1,
    aggregateType: "points_account",
    validate: (payload): payload is Record<string, unknown> =>
      isRecord(payload) && isRecord(payload.entry),
  },
] as const;

export function getEventContract(type: string, version: number): EventContract | undefined {
  return commerceEventContracts.find((contract) => contract.type === type && contract.version === version);
}

export function assertEventContract(type: string, version: number, payload: unknown): void {
  const contract = getEventContract(type, version);
  if (!contract) throw new Error(`Unsupported commerce event contract: ${type}@${version}`);
  if (!contract.validate(payload)) throw new Error(`Invalid payload for commerce event: ${type}@${version}`);
}
