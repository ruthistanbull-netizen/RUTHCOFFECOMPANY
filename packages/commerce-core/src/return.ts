import type { ReturnStatus, ReturnType } from "@ruth-commerce/contracts";

function invariant(code: string, message: string): never {
  const error = Object.assign(new Error(message), { code });
  error.name = "CommerceInvariantError";
  throw error;
}

export type PersistedReturnCaseStatus = "open" | "approved" | "rejected" | "completed";

export interface ReturnCaseCandidate {
  id: string;
  type: ReturnType;
  status: PersistedReturnCaseStatus | ReturnStatus | string;
  reverseShipmentBarcode?: string | null;
  reverseShipmentTrackingNo?: string | null;
  reverseShipmentStatus?: string | null;
}

export interface PrimaryTrackingInput {
  outboundTrackingNo?: string | null;
  outboundBarcode?: string | null;
  outboundStatus?: string | null;
  activeReturnCase?: ReturnCaseCandidate | null;
}

export interface PrimaryTrackingSelection {
  direction: "outbound" | "return";
  label: "Kargo Takip" | "Kargo Kodu" | "İade Kargo Takip" | "İade Kargo Kodu";
  code: string | null;
  status: string | null;
  returnCaseId: string | null;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function canonicalReturnStatus(type: ReturnType, status: unknown): ReturnStatus {
  const value = clean(status).toLocaleLowerCase("tr-TR");
  if (value === "open" || value === "requested") return "requested";
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  if (value === "in_transit" || value === "returning") return "in_transit";
  if (value === "received") return "received";
  if (value === "inspected") return "inspected";
  if (value === "cancelled" || value === "canceled") return "cancelled";
  if (value === "completed") return type === "exchange" ? "exchanged" : "refunded";
  if (value === "refunded" || value === "exchanged") return value;
  return "requested";
}

export function returnCaseTypeLabel(type: ReturnType | string | null | undefined): "İade" | "Değişim" {
  return type === "exchange" ? "Değişim" : "İade";
}

export function returnCaseStatusLabel(type: ReturnType, status: unknown): string {
  const canonical = canonicalReturnStatus(type, status);
  switch (canonical) {
    case "requested": return "Talep Açıldı";
    case "approved": return "Onaylandı";
    case "rejected": return "Reddedildi";
    case "in_transit": return "İade Kargoda";
    case "received": return "Teslim Alındı";
    case "inspected": return "Kontrol Edildi";
    case "refunded": return "İade Tamamlandı";
    case "exchanged": return "Değişim Tamamlandı";
    case "cancelled": return "İptal Edildi";
    default: return "Bekliyor";
  }
}

const RETURN_CASE_TRANSITIONS: Record<PersistedReturnCaseStatus, readonly PersistedReturnCaseStatus[]> = {
  open: ["approved", "rejected"],
  approved: ["completed", "rejected"],
  rejected: [],
  completed: [],
};

export function assertReturnCaseTransition(
  from: PersistedReturnCaseStatus | string,
  to: PersistedReturnCaseStatus | string,
): void {
  const current = clean(from).toLocaleLowerCase("tr-TR") as PersistedReturnCaseStatus;
  const next = clean(to).toLocaleLowerCase("tr-TR") as PersistedReturnCaseStatus;
  if (!(current in RETURN_CASE_TRANSITIONS) || !(next in RETURN_CASE_TRANSITIONS)) {
    invariant("INVALID_RETURN_CASE_STATUS", "Geçersiz iade/değişim durumu.");
  }
  if (current === next) return;
  if (!RETURN_CASE_TRANSITIONS[current].includes(next)) {
    invariant(
      "INVALID_RETURN_CASE_TRANSITION",
      `${returnCaseStatusLabel("return", current)} durumundan ${returnCaseStatusLabel("return", next)} durumuna geçilemez.`,
    );
  }
}

export function isActiveReturnCase(returnCase: Pick<ReturnCaseCandidate, "status">): boolean {
  const status = clean(returnCase.status).toLocaleLowerCase("tr-TR");
  return !["rejected", "completed", "refunded", "exchanged", "cancelled", "canceled"].includes(status);
}

export function assertCanCreateReturnCase(input: {
  paymentStatus: unknown;
  orderStatus: unknown;
  type: ReturnType;
  existingCases?: ReturnCaseCandidate[];
}): void {
  const paymentStatus = clean(input.paymentStatus).toLocaleLowerCase("tr-TR");
  const orderStatus = clean(input.orderStatus).toLocaleLowerCase("tr-TR");

  if (!["paid", "partially_refunded"].includes(paymentStatus)) {
    invariant("RETURN_REQUIRES_PAID_ORDER", "Yalnız ödemesi alınmış sipariş için iade veya değişim başlatılabilir.");
  }
  if (["cancelled", "canceled"].includes(orderStatus)) {
    invariant("RETURN_FOR_CANCELLED_ORDER", "İptal edilmiş sipariş için iade veya değişim başlatılamaz.");
  }
  const activeCase = (input.existingCases || []).find(isActiveReturnCase);
  if (activeCase) {
    invariant(
      "ACTIVE_RETURN_CASE_EXISTS",
      "Bu sipariş için zaten aktif bir iade veya değişim kaydı var.",
    );
  }
}

export function assertCanCreateReverseShipment(input: {
  returnCase: ReturnCaseCandidate;
  outboundBarcode: unknown;
}): void {
  const status = clean(input.returnCase.status).toLocaleLowerCase("tr-TR");
  if (["rejected", "completed", "refunded", "exchanged", "cancelled", "canceled"].includes(status)) {
    invariant("RETURN_CASE_CLOSED", "Kapanmış iade/değişim kaydı için ters kargo oluşturulamaz.");
  }
  if (!clean(input.outboundBarcode)) {
    invariant("OUTBOUND_BARCODE_REQUIRED", "İade kargosu için siparişin ilk gönderi barkodu gerekli.");
  }
}

export function reverseShipmentIdempotencyKey(returnCaseId: string, outboundBarcode: string): string {
  const caseId = clean(returnCaseId);
  const barcode = clean(outboundBarcode);
  if (!caseId || !barcode) {
    invariant("INVALID_REVERSE_SHIPMENT_KEY", "İade/değişim kayıt kimliği ve ilk gönderi barkodu gerekli.");
  }
  return `reverse-shipment:${caseId}:${barcode}`;
}

export function selectPrimaryOrderTracking(input: PrimaryTrackingInput): PrimaryTrackingSelection {
  const returnCase = input.activeReturnCase || null;
  const reverseCode = returnCase
    ? clean(returnCase.reverseShipmentTrackingNo) || clean(returnCase.reverseShipmentBarcode) || null
    : null;

  if (returnCase && (isActiveReturnCase(returnCase) || reverseCode)) {
    return {
      direction: "return",
      label: reverseCode ? "İade Kargo Takip" : "İade Kargo Kodu",
      code: reverseCode,
      status: clean(returnCase.reverseShipmentStatus) || null,
      returnCaseId: returnCase.id,
    };
  }

  const outboundCode = clean(input.outboundTrackingNo) || clean(input.outboundBarcode) || null;
  return {
    direction: "outbound",
    label: outboundCode ? "Kargo Takip" : "Kargo Kodu",
    code: outboundCode,
    status: clean(input.outboundStatus) || null,
    returnCaseId: null,
  };
}
