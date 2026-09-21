import type { CorrelationId, IdempotencyKey } from "./index";

export type RuthieSurface = "chat" | "voice";
export type RuthieToolOperation = "query" | "command";
export type RuthieRiskLevel = "none" | "low" | "high" | "critical";
export type RuthieConfirmationPolicy = "never" | "risk_based" | "always";
export type RuthieConfirmationMode = "none" | "chat" | "voice";

export type RuthieCoreKey =
  | "catalog"
  | "pricing"
  | "promotion"
  | "cart"
  | "checkout"
  | "payment"
  | "order"
  | "inventory"
  | "shipping"
  | "customer"
  | "loyalty"
  | "return"
  | "notification"
  | "cms";

export type RuthieConnectorCategory =
  | "ai"
  | "messaging"
  | "development"
  | "design"
  | "productivity"
  | "analytics"
  | "commerce"
  | "infrastructure";

export interface RuthieActor {
  actorId: string;
  role: "admin";
  permissions: readonly string[];
}

export interface RuthieToolDefinition {
  id: string;
  title: string;
  description: string;
  engine: RuthieCoreKey;
  operation: RuthieToolOperation;
  permission: string;
  riskLevel: RuthieRiskLevel;
  confirmationPolicy: RuthieConfirmationPolicy;
  reversible: boolean;
  inputSchemaVersion: number;
}

export interface RuthieConnectorDefinition {
  key: string;
  title: string;
  category: RuthieConnectorCategory;
  capabilities: readonly string[];
  auth: "api_key" | "oauth2" | "service_account" | "platform_connection";
  required: boolean;
}

export interface RuthieActionRequest {
  toolId: string;
  surface: RuthieSurface;
  actor: RuthieActor;
  input: Record<string, unknown>;
  correlationId: CorrelationId;
  idempotencyKey?: IdempotencyKey;
}

export interface RuthieConfirmationRequirement {
  required: boolean;
  mode: RuthieConfirmationMode;
  prompt?: string;
  acceptedVoicePhrases?: readonly string[];
}

export interface RuthieActionPlan {
  tool: RuthieToolDefinition;
  request: RuthieActionRequest;
  status: "ready" | "awaiting_confirmation" | "blocked";
  confirmation: RuthieConfirmationRequirement;
  reason: string;
}

export interface RuthieDispatchContext {
  actor: RuthieActor;
  surface: RuthieSurface;
  correlationId: CorrelationId;
  idempotencyKey?: IdempotencyKey;
  confirmationGranted: boolean;
}

export interface RuthieToolExecutionResult<TData = unknown> {
  ok: boolean;
  toolId: string;
  engine: RuthieCoreKey;
  data?: TData;
  error?: { code: string; message: string; retryable: boolean };
  correlationId: CorrelationId;
}
