import type {
  ConsentPurpose,
  CustomerId,
  IsoDateTime,
  RuthChannel,
} from "./index";

export type CustomerMembershipStatus = "member" | "guest";
export type CustomerSource = "profile" | "order" | "admin" | "import";
export type CustomerIdentityType = "email" | "phone" | "profile";
export type CustomerConsentState = "granted" | "denied" | "unknown";
export type EmailMessagePurpose = "service" | "marketing";
export type CustomerEventType =
  | "customer.created"
  | "customer.member_linked"
  | "customer.consent_changed";

export interface CanonicalCustomer {
  id: CustomerId;
  profileId?: string;
  membershipStatus: CustomerMembershipStatus;
  source: CustomerSource;
  fullName?: string;
  email?: string;
  phone?: string;
  serviceEmailAllowed: boolean;
  marketingEmailState: CustomerConsentState;
  marketingEmailConsentAt?: IsoDateTime;
  marketingEmailConsentSource?: string;
  firstSeenAt: IsoDateTime;
  lastSeenAt: IsoDateTime;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CustomerIdentity {
  customerId: CustomerId;
  type: CustomerIdentityType;
  normalizedValue: string;
  verifiedAt?: IsoDateTime;
  createdAt: IsoDateTime;
}

export interface CustomerConsentRecord {
  id: string;
  customerId: CustomerId;
  purpose: ConsentPurpose;
  state: Exclude<CustomerConsentState, "unknown">;
  textVersion?: string;
  source: string;
  channel: RuthChannel;
  capturedAt: IsoDateTime;
  revokedAt?: IsoDateTime;
  evidence?: Record<string, unknown>;
}

export interface CustomerIdentityInput {
  profileId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  source: CustomerSource;
  seenAt: IsoDateTime;
}

export interface CustomerMatchCandidate {
  id: CustomerId;
  profileId?: string;
  membershipStatus: CustomerMembershipStatus;
  normalizedEmail?: string;
  normalizedPhone?: string;
  createdAt: IsoDateTime;
}

export interface CustomerCommunicationPreference {
  customerId: CustomerId;
  email?: string;
  serviceEmailAllowed: boolean;
  marketingEmailState: CustomerConsentState;
}

export interface CustomerEmailEligibility {
  allowed: boolean;
  purpose: EmailMessagePurpose;
  reason:
    | "allowed_service_message"
    | "explicit_marketing_consent"
    | "missing_email"
    | "service_email_blocked"
    | "marketing_consent_missing"
    | "marketing_consent_denied";
}

export interface CustomerUpsertResult {
  customerId: CustomerId;
  created: boolean;
  membershipLinked: boolean;
  mergedCustomerIds: CustomerId[];
}

export interface CustomerCreatedEventPayload {
  membershipStatus: CustomerMembershipStatus;
}

export interface CustomerMemberLinkedEventPayload {
  profileId: string;
}

export interface CustomerConsentChangedEventPayload {
  purpose: ConsentPurpose;
  state: Exclude<CustomerConsentState, "unknown">;
}

export type CustomerEventPayloadMap = {
  "customer.created": CustomerCreatedEventPayload;
  "customer.member_linked": CustomerMemberLinkedEventPayload;
  "customer.consent_changed": CustomerConsentChangedEventPayload;
};
