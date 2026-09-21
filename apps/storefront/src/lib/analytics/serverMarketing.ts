import crypto from "node:crypto";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function sha(value: unknown) {
  const normalized = clean(value).toLowerCase().replace(/\s+/g, "");
  return normalized ? crypto.createHash("sha256").update(normalized).digest("hex") : undefined;
}
function digits(value: unknown) { return clean(value).replace(/\D/g, ""); }

export type ServerMarketingEvent = {
  eventName: "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "AddPaymentInfo" | "Purchase";
  eventId: string;
  eventSourceUrl: string;
  clientIp?: string;
  userAgent?: string;
  visitorId?: string;
  fbp?: string;
  fbc?: string;
  email?: string;
  phone?: string;
  value?: number;
  currency?: string;
  contentIds?: string[];
  numItems?: number;
};

export async function sendMetaCapiEvent(event: ServerMarketingEvent) {
  const pixelId = (process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();
  const accessToken = (process.env.META_CAPI_ACCESS_TOKEN || "").trim();
  if (!pixelId || !accessToken) {
    if (event.eventName === "Purchase") {
      console.error("Meta Purchase CAPI skipped because configuration is incomplete", {
        pixelConfigured: Boolean(pixelId),
        accessTokenConfigured: Boolean(accessToken),
        eventId: event.eventId,
      });
    }
    return false;
  }

  const phone = digits(event.phone);
  const userData: Record<string, unknown> = {
    client_ip_address: event.clientIp || undefined,
    client_user_agent: event.userAgent || undefined,
    external_id: event.visitorId ? [sha(event.visitorId)] : undefined,
    em: event.email ? [sha(event.email)] : undefined,
    ph: phone ? [sha(phone)] : undefined,
    fbp: event.fbp || undefined,
    fbc: event.fbc || undefined,
  };
  Object.keys(userData).forEach((key) => userData[key] === undefined && delete userData[key]);

  const customData: Record<string, unknown> = {};
  if (Number.isFinite(event.value)) customData.value = event.value;
  if (event.currency) {
    const currency = String(event.currency).trim().toUpperCase();
    customData.currency = currency === "TL" ? "TRY" : currency;
  }
  if (event.contentIds?.length) { customData.content_ids = event.contentIds; customData.content_type = "product"; }
  if (event.numItems) customData.num_items = event.numItems;

  const payload: Record<string, unknown> = {
    data: [{
      event_name: event.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: event.eventId,
      action_source: "website",
      event_source_url: event.eventSourceUrl,
      user_data: userData,
      custom_data: customData,
    }],
  };
  if (process.env.META_CAPI_TEST_EVENT_CODE) payload.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;

  const graphVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  try {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const result = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || (result && result.error)) {
      const metaError = result && typeof result.error === "object" && result.error
        ? result.error as Record<string, unknown>
        : {};
      console.error("Meta CAPI request failed", {
        eventName: event.eventName,
        eventId: event.eventId,
        status: response.status,
        errorType: metaError.type || null,
        errorCode: metaError.code || null,
        errorSubcode: metaError.error_subcode || null,
        message: metaError.message || null,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Meta CAPI network request failed", {
      eventName: event.eventName,
      eventId: event.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function sendGa4MeasurementEvent(eventName: string, clientId: string, params: Record<string, unknown>) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.GA4_MEASUREMENT_ID;
  const apiSecret = process.env.GA4_API_SECRET;
  if (!measurementId || !apiSecret || !clientId) return;
  await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ client_id: clientId, events: [{ name: eventName, params: { ...params, engagement_time_msec: 1 } }] }),
  }).catch(() => undefined);
}
