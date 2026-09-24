"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const VISITOR_KEY = "ruth_visitor_id";
const SESSION_KEY = "ruth_session_state_v4";
const LEGACY_SESSION_KEY = "ruth_tab_session_state_v3";
const FIRST_TOUCH_KEY = "ruth_first_touch";
const LAST_TOUCH_KEY = "ruth_last_touch";
const SESSION_START_MARKER_PREFIX = "ruth_session_start_sent_v1:";
const ANALYTICS_CONSENT_KEY = "ruth_analytics_consent_v1";
const SESSION_TIMEOUT_MS = 30 * 60_000;
const SESSION_ACTIVITY_WRITE_MS = 5_000;
const ATTRIBUTION_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "wbraid",
  "gbraid",
  "ttclid",
] as const;

let entryTouchEvaluated = false;

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clean(value: string | null) { return (value || "").trim().slice(0, 500); }
function cookie(name: string) {
  if (typeof document === "undefined") return "";
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}
function readJson<T>(storage: Storage, key: string): T | null {
  try { return JSON.parse(storage.getItem(key) || "null") as T | null; } catch { return null; }
}
function hasMarketingConsent() {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "accepted"; } catch { return false; }
}

export function isThemePreviewMode() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("themeEditor") === "1" || params.has("themePreview");
  } catch {
    return false;
  }
}

export type RuthAttribution = {
  visitor_id: string;
  session_id: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  referrer: string;
  landing_page: string;
  started_at: string;
  click_id: string;
  fbp: string;
  fbc: string;
  first_touch?: Record<string, unknown> | null;
};

type SessionState = {
  id: string;
  started_at: string;
  last_activity_at: number;
  attribution: Omit<RuthAttribution, "visitor_id" | "session_id" | "started_at" | "fbp" | "fbc" | "first_touch">;
};

type AttributionResolution = {
  attribution: RuthAttribution;
  created: boolean;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    clarity?: (...args: unknown[]) => void;
    ttq?: TikTokPixelQueue;
    TiktokAnalyticsObject?: string;
  }
}

type TikTokPixelQueue = unknown[] & {
  methods?: string[];
  setAndDefer?: (target: TikTokPixelQueue, method: string) => void;
  instance?: (pixelId: string) => TikTokPixelQueue;
  load?: (pixelId: string, options?: Record<string, unknown>) => void;
  page?: (...args: unknown[]) => void;
  track?: (...args: unknown[]) => void;
  _i?: Record<string, TikTokPixelQueue & { _u?: string }>;
  _t?: Record<string, number>;
  _o?: Record<string, Record<string, unknown>>;
};

function attributionReferrer() {
  const referrer = clean(document.referrer);
  if (!referrer) return "";
  try {
    const url = new URL(referrer);
    if (url.origin === window.location.origin) return "";
    const host = url.hostname.toLowerCase();
    // PayTR ödeme dönüşü yeni bir pazarlama ziyareti değildir. Sipariş kaynağını
    // ödeme sağlayıcısına çevirmemek için attribution referrer'ı olarak yok sayılır.
    if (host === "paytr.com" || host.endsWith(".paytr.com")) return "";
    return referrer;
  } catch {
    return referrer;
  }
}

function hasExplicitAttributionQuery() {
  const params = new URLSearchParams(window.location.search);
  return ATTRIBUTION_QUERY_KEYS.some((key) => Boolean(clean(params.get(key))));
}

function detectAttribution(): SessionState["attribution"] {
  const params = new URLSearchParams(window.location.search);
  const utmSource = clean(params.get("utm_source")).toLowerCase();
  const utmMedium = clean(params.get("utm_medium")).toLowerCase();
  const campaign = clean(params.get("utm_campaign"));
  const content = clean(params.get("utm_content"));
  const term = clean(params.get("utm_term"));
  const referrer = attributionReferrer();
  const ref = referrer.toLowerCase();
  const fbclid = clean(params.get("fbclid"));
  const gclid = clean(params.get("gclid"));
  const wbraid = clean(params.get("wbraid"));
  const gbraid = clean(params.get("gbraid"));
  const ttclid = clean(params.get("ttclid"));
  const clickId = fbclid || gclid || wbraid || gbraid || ttclid;
  const paidMedium = /(cpc|ppc|paid|ads|paid_social|social_paid|display|retarget)/.test(utmMedium);
  const isInstagram = utmSource.includes("instagram") || /(^|\.)instagram\.com|l\.instagram\.com/.test(ref);
  const isFacebook = utmSource.includes("facebook") || utmSource.includes("meta") || /(^|\.)facebook\.com|l\.facebook\.com|fb\.com/.test(ref);
  const isGoogle = utmSource.includes("google") || /(^|\.)google\./.test(ref);
  let source = "direct";
  let medium = "direct";

  if ((isInstagram || (isFacebook && utmSource.includes("instagram"))) && (Boolean(fbclid) || paidMedium)) {
    source = "instagram_paid"; medium = utmMedium || "paid_social";
  } else if (isFacebook && (Boolean(fbclid) || paidMedium)) {
    source = "facebook_paid"; medium = utmMedium || "paid_social";
  } else if (fbclid) {
    // fbclid Meta reklam tıklamasıdır. Referrer/utm_source tarayıcı tarafından
    // düşürülmüş olsa bile organik/direct olarak sınıflandırma.
    source = "facebook_paid"; medium = utmMedium || "paid_social";
  } else if (isInstagram) {
    source = "instagram_organic"; medium = utmMedium || "organic_social";
  } else if (isFacebook) {
    source = "facebook_organic"; medium = utmMedium || "organic_social";
  } else if (isGoogle && (Boolean(gclid || wbraid || gbraid) || paidMedium)) {
    source = "google_paid"; medium = utmMedium || "cpc";
  } else if (gclid || wbraid || gbraid) {
    source = "google_paid"; medium = utmMedium || "cpc";
  } else if (isGoogle) {
    source = "google_organic"; medium = "organic";
  } else if (utmSource.includes("tiktok") || ref.includes("tiktok.com")) {
    source = ttclid || paidMedium ? "tiktok_paid" : "tiktok_organic";
    medium = utmMedium || (ttclid ? "paid_social" : "organic_social");
  } else if (ttclid) {
    source = "tiktok_paid"; medium = utmMedium || "paid_social";
  } else if (utmSource) {
    source = utmSource; medium = utmMedium || "referral";
  } else if (referrer) {
    source = "referral"; medium = "referral";
  }

  return { source, medium, campaign, content, term, referrer, landing_page: `${window.location.pathname}${window.location.search}`, click_id: clickId };
}

function isFreshExternalEntry(attribution: SessionState["attribution"]) {
  return hasExplicitAttributionQuery() || Boolean(attribution.referrer);
}

function sameEntryTouch(current: SessionState["attribution"], incoming: SessionState["attribution"]) {
  if (incoming.click_id || current.click_id) return Boolean(incoming.click_id) && incoming.click_id === current.click_id;
  return current.source === incoming.source
    && current.medium === incoming.medium
    && current.campaign === incoming.campaign
    && current.content === incoming.content
    && current.term === incoming.term
    && current.referrer === incoming.referrer
    && current.landing_page === incoming.landing_page;
}

function validSessionState(value: SessionState | null): value is SessionState {
  return Boolean(
    value
    && typeof value.id === "string"
    && value.id
    && typeof value.started_at === "string"
    && Number.isFinite(Number(value.last_activity_at))
    && value.attribution
    && typeof value.attribution === "object",
  );
}

function readSharedSessionState() {
  let state = readJson<SessionState>(window.localStorage, SESSION_KEY);
  if (validSessionState(state)) return state;

  const legacy = readJson<SessionState>(window.sessionStorage, LEGACY_SESSION_KEY);
  if (validSessionState(legacy) && Date.now() - Number(legacy.last_activity_at) < SESSION_TIMEOUT_MS) {
    state = legacy;
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(state));
      window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {}
    return state;
  }
  return null;
}

function resolveSessionState(touchActivity: boolean): { state: SessionState; created: boolean } | null {
  const now = Date.now();
  let state = readSharedSessionState();
  const expired = !state || now - Number(state.last_activity_at) >= SESSION_TIMEOUT_MS;

  if (expired && !touchActivity) return null;

  let entryAttribution: SessionState["attribution"] | null = null;
  let changedExternalTouch = false;
  if (touchActivity && !entryTouchEvaluated) {
    entryTouchEvaluated = true;
    entryAttribution = detectAttribution();
    changedExternalTouch = Boolean(
      state
      && !expired
      && isFreshExternalEntry(entryAttribution)
      && !sameEntryTouch(state.attribution, entryAttribution),
    );
  }

  let created = false;
  if (expired || changedExternalTouch) {
    state = {
      id: makeId(),
      started_at: new Date(now).toISOString(),
      last_activity_at: now,
      attribution: entryAttribution || detectAttribution(),
    };
    created = true;
  } else if (touchActivity && state && now - Number(state.last_activity_at) >= SESSION_ACTIVITY_WRITE_MS) {
    state = { ...state, last_activity_at: now };
  }

  if (!state) return null;
  if (created || touchActivity) {
    try { window.localStorage.setItem(SESSION_KEY, JSON.stringify(state)); } catch {}
  }
  try { window.sessionStorage.setItem("ruth_session_id", state.id); } catch {}
  return { state, created };
}

function resolveAttribution(touchActivity: boolean): AttributionResolution | null {
  if (typeof window === "undefined" || isThemePreviewMode()) return null;
  let visitorId = window.localStorage.getItem(VISITOR_KEY);
  if (!visitorId) { visitorId = makeId(); window.localStorage.setItem(VISITOR_KEY, visitorId); }
  const resolved = resolveSessionState(touchActivity);
  if (!resolved) return null;
  const session = resolved.state;
  let firstTouch = readJson<Record<string, unknown>>(window.localStorage, FIRST_TOUCH_KEY);
  if (!firstTouch) {
    firstTouch = { ...session.attribution, captured_at: new Date().toISOString() };
    window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch));
  }
  window.localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify({ ...session.attribution, captured_at: new Date().toISOString() }));
  return {
    created: resolved.created,
    attribution: {
      visitor_id: visitorId,
      session_id: session.id,
      started_at: session.started_at,
      ...session.attribution,
      fbp: cookie("_fbp"),
      fbc: cookie("_fbc"),
      first_touch: firstTouch,
    },
  };
}

export function getRuthAttribution(): RuthAttribution | null {
  return resolveAttribution(true)?.attribution || null;
}

export function getRuthSessionId() { return getRuthAttribution()?.session_id || ""; }

const META_EVENT_MAP: Record<string, string> = {
  page_view: "PageView",
  product_view: "ViewContent",
  cart_add: "AddToCart",
  checkout_view: "InitiateCheckout",
  payment_start: "AddPaymentInfo",
};
const GA_EVENT_MAP: Record<string, string> = {
  product_view: "view_item",
  cart_add: "add_to_cart",
  checkout_view: "begin_checkout",
  payment_start: "add_payment_info",
};

const TIKTOK_EVENT_MAP: Record<string, string> = {
  product_view: "ViewContent",
  cart_add: "AddToCart",
  checkout_view: "InitiateCheckout",
  payment_start: "AddPaymentInfo",
};

function commerceValue(metadata: Record<string, unknown>) {
  if (metadata.total_amount != null) return Number(metadata.total_amount);
  if (metadata.price != null) return Number(metadata.price) * Number(metadata.quantity || 1);
  return undefined;
}

function commerceItem(metadata: Record<string, unknown>) {
  const id = metadata.product_id || metadata.product_slug;
  const name = metadata.product_name;
  const price = metadata.price != null ? Number(metadata.price) : undefined;
  const quantity = metadata.quantity != null ? Number(metadata.quantity) : undefined;
  if (!id && !name && price == null && quantity == null) return null;
  return {
    ...(id ? { item_id: String(id), content_id: String(id) } : {}),
    ...(name ? { item_name: String(name), content_name: String(name) } : {}),
    ...(price != null && Number.isFinite(price) ? { price } : {}),
    ...(quantity != null && Number.isFinite(quantity) ? { quantity } : {}),
  };
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Diğer";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Diğer";
  const device_type = /iPad|Tablet/.test(ua) ? "tablet" : /Mobi|Android|iPhone|iPod/.test(ua) ? "mobile" : "desktop";
  return {
    browser,
    os,
    device_type,
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen_width: window.screen?.width || 0,
    screen_height: window.screen?.height || 0,
  };
}

function postRuthEvent(eventName: string, attribution: RuthAttribution, metadata: Record<string, unknown> = {}) {
  if (isThemePreviewMode()) return Promise.resolve(false);
  const eventId = makeId();
  const marketingConsent = hasMarketingConsent();
  const eventMetadata = {
    ...getDeviceInfo(),
    ...metadata,
    ...attribution,
    fbp: marketingConsent ? attribution.fbp : "",
    fbc: marketingConsent ? attribution.fbc : "",
    marketing_consent: marketingConsent,
    event_id: eventId,
    event_client_at: new Date().toISOString(),
  };

  const value = commerceValue(metadata);
  const item = commerceItem(metadata);

  const metaEvent = META_EVENT_MAP[eventName];
  if (marketingConsent && metaEvent && window.fbq) {
    const data: Record<string, unknown> = {};
    if (value != null && Number.isFinite(value)) data.value = value;
    if (data.value != null) data.currency = "TRY";
    if (metadata.product_slug) data.content_ids = [String(metadata.product_slug)];
    if (metadata.product_name) data.content_name = String(metadata.product_name);
    if (metadata.quantity) data.num_items = Number(metadata.quantity);
    window.fbq("track", metaEvent, data, { eventID: eventId });
  }

  const gaEvent = GA_EVENT_MAP[eventName];
  if (marketingConsent && gaEvent && window.gtag) window.gtag("event", gaEvent, metadata);

  const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();
  if (marketingConsent && gtmId && gaEvent && window.dataLayer) {
    const ecommerce = {
      ...(value != null && Number.isFinite(value) ? { value, currency: "TRY" } : {}),
      ...(item ? { items: [item] } : {}),
    };
    window.dataLayer.push({
      event: gaEvent,
      rosta_event_id: eventId,
      ...(Object.keys(ecommerce).length ? { ecommerce } : {}),
    });
  }

  const tiktokEvent = TIKTOK_EVENT_MAP[eventName];
  if (marketingConsent && tiktokEvent && window.ttq?.track) {
    const payload: Record<string, unknown> = {};
    if (value != null && Number.isFinite(value)) {
      payload.value = value;
      payload.currency = "TRY";
    }
    if (item) {
      payload.content_type = "product";
      if (item.content_id) payload.content_id = item.content_id;
      if (item.content_name) payload.description = item.content_name;
      if (item.quantity != null) payload.quantity = item.quantity;
      payload.contents = [{
        ...(item.content_id ? { content_id: item.content_id } : {}),
        ...(item.content_name ? { content_name: item.content_name } : {}),
        ...(item.price != null ? { price: item.price } : {}),
        ...(item.quantity != null ? { quantity: item.quantity } : {}),
      }];
    }
    window.ttq.track(tiktokEvent, payload);
  }

  return fetch("/api/events/collect", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", keepalive: true,
    body: JSON.stringify({ event_name: eventName, session_id: attribution.session_id, path: window.location.pathname, metadata: eventMetadata }),
  }).then((response) => response.ok).catch(() => false);
}

function ensureSessionStart(attribution: RuthAttribution) {
  const marker = `${SESSION_START_MARKER_PREFIX}${attribution.session_id}`;
  try {
    if (window.localStorage.getItem(marker)) return;
    window.localStorage.setItem(marker, String(Date.now()));
  } catch {}

  void postRuthEvent("session_start", attribution, {
    entry_path: window.location.pathname,
    page_title: document.title,
  }).then((ok) => {
    if (ok) return;
    try { window.localStorage.removeItem(marker); } catch {}
  });
}

export function trackRuthEvent(eventName: string, metadata: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || isThemePreviewMode()) return;
  const passive = eventName === "session_ping" || eventName === "page_leave" || eventName === "session_end";
  const resolved = resolveAttribution(!passive);
  if (!resolved) return;
  ensureSessionStart(resolved.attribution);
  void postRuthEvent(eventName, resolved.attribution, metadata);
}

function initializeMarketingTags() {
  if (isThemePreviewMode() || !hasMarketingConsent()) return;

  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const gtmId = (process.env.NEXT_PUBLIC_GTM_ID || process.env.NEXT_PUBLIC_GTM_CONTAINER_ID || "").trim();
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();
  const tiktokPixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim();

  if (gtmId && !document.querySelector("script[data-rosta-gtm]")) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    const script = document.createElement("script");
    script.async = true;
    script.dataset.rostaGtm = gtmId;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
    document.head.appendChild(script);
  }

  if (metaPixelId && !window.fbq) {
    const fbq = function (...args: unknown[]) { (fbq as unknown as { queue: unknown[] }).queue.push(args); } as unknown as Window["fbq"];
    Object.assign(fbq as object, { queue: [], loaded: true, version: "2.0" });
    window.fbq = fbq; window._fbq = fbq;
    const script = document.createElement("script"); script.async = true; script.src = "https://connect.facebook.net/en_US/fbevents.js"; document.head.appendChild(script);
    window.fbq?.("init", metaPixelId, {}, { external_id: getRuthAttribution()?.visitor_id });
  }
  if (gaId && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args: unknown[]) => { window.dataLayer?.push(args); };
    window.gtag("js", new Date());
    window.gtag("config", gaId, { send_page_view: false, cookie_flags: "SameSite=None;Secure" });
    const script = document.createElement("script"); script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`; document.head.appendChild(script);
  }

  if (tiktokPixelId && !document.querySelector("script[data-rosta-tiktok-pixel]")) {
    const ttq = (window.ttq = window.ttq || []) as TikTokPixelQueue;
    window.TiktokAnalyticsObject = "ttq";
    const methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
    ttq.methods = methods;
    ttq.setAndDefer = (target, method) => {
      (target as unknown as Record<string, (...args: unknown[]) => void>)[method] = (...args: unknown[]) => {
        target.push([method, ...args]);
      };
    };
    methods.forEach((method) => ttq.setAndDefer?.(ttq, method));
    ttq.instance = (pixelId) => {
      ttq._i = ttq._i || {};
      const instance = (ttq._i[pixelId] = ttq._i[pixelId] || ([] as unknown as TikTokPixelQueue));
      methods.forEach((method) => ttq.setAndDefer?.(instance, method));
      return instance;
    };
    ttq.load = (pixelId, options = {}) => {
      const src = "https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i = ttq._i || {};
      ttq._i[pixelId] = ttq._i[pixelId] || ([] as unknown as TikTokPixelQueue & { _u?: string });
      ttq._i[pixelId]._u = src;
      ttq._t = ttq._t || {};
      ttq._t[pixelId] = Date.now();
      ttq._o = ttq._o || {};
      ttq._o[pixelId] = options;
      const script = document.createElement("script");
      script.async = true;
      script.dataset.rostaTiktokPixel = pixelId;
      script.src = `${src}?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`;
      document.head.appendChild(script);
    };
    ttq.load(tiktokPixelId);
  }

  const clarityProjectId = (process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID || "").trim();
  if (clarityProjectId && !window.clarity) {
    window.clarity = (...args: unknown[]) => {
      const clarityQueue = window.clarity as unknown as { q?: unknown[] };
      clarityQueue.q = clarityQueue.q || [];
      clarityQueue.q.push(args);
    };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityProjectId)}`;
    document.head.appendChild(script);

    const attribution = getRuthAttribution();
    if (attribution) {
      window.clarity("identify", attribution.visitor_id, attribution.session_id);
      window.clarity("set", "traffic_source", attribution.source);
      window.clarity("set", "traffic_medium", attribution.medium);
      if (attribution.campaign) window.clarity("set", "campaign", attribution.campaign);
    }
  }
}

function replayCurrentPageToMarketing() {
  if (isThemePreviewMode() || !hasMarketingConsent()) return;
  const attribution = getRuthAttribution();
  if (!attribution) return;
  const eventId = makeId();
  const pathname = window.location.pathname;

  window.fbq?.("track", "PageView", {}, { eventID: eventId });
  window.gtag?.("event", "page_view", { page_path: `${pathname}${window.location.search}`, page_title: document.title });
  if (process.env.NEXT_PUBLIC_GTM_ID?.trim() && window.dataLayer) {
    window.dataLayer.push({
      event: "page_view",
      page_path: `${pathname}${window.location.search}`,
      page_title: document.title,
      rosta_event_id: eventId,
    });
  }
  window.ttq?.page?.();
  window.clarity?.("identify", attribution.visitor_id, attribution.session_id, pathname);
  window.clarity?.("set", "current_path", pathname);
  window.clarity?.("set", "traffic_source", attribution.source);
  window.clarity?.("set", "traffic_medium", attribution.medium);
  if (attribution.campaign) window.clarity?.("set", "campaign", attribution.campaign);
}

export function SiteAnalytics() {
  const pathname = usePathname();
  const pageStartedRef = useRef(Date.now());
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    initializeMarketingTags();
    const onConsent = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (value !== "accepted") return;
      initializeMarketingTags();
      replayCurrentPageToMarketing();
    };
    window.addEventListener("ruth:analytics-consent", onConsent);
    return () => window.removeEventListener("ruth:analytics-consent", onConsent);
  }, []);

  useEffect(() => {
    const attribution = getRuthAttribution();
    if (!attribution) return;
    ensureSessionStart(attribution);
    if (hasMarketingConsent()) {
      window.clarity?.("identify", attribution.visitor_id, attribution.session_id, pathname);
      window.clarity?.("set", "current_path", pathname);
      window.clarity?.("set", "traffic_source", attribution.source);
    }
    if (previousPathRef.current) {
      trackRuthEvent("page_leave", { pathname: previousPathRef.current, active_seconds: Math.max(1, Math.round((Date.now() - pageStartedRef.current) / 1000)) });
    }
    pageStartedRef.current = Date.now();
    previousPathRef.current = pathname;
    const query = window.location.search.replace(/^\?/, "");
    trackRuthEvent("page_view", { pathname, query, page_title: document.title });
    const productMatch = pathname.match(/^\/products\/([^/]+)/);
    if (productMatch) {
      const slug = decodeURIComponent(productMatch[1]);
      trackRuthEvent("product_view", { product_slug: slug, product_name: document.querySelector("h1")?.textContent?.trim() || slug });
    }
    if (hasMarketingConsent()) {
      window.gtag?.("event", "page_view", { page_path: `${pathname}${window.location.search}`, page_title: document.title });
      if (process.env.NEXT_PUBLIC_GTM_ID?.trim() && window.dataLayer) {
        window.dataLayer.push({
          event: "page_view",
          page_path: `${pathname}${window.location.search}`,
          page_title: document.title,
        });
      }
      window.ttq?.page?.();
    }
  }, [pathname]);

  useEffect(() => {
    let lastActivityWriteAt = 0;
    const markActivity = () => {
      const now = Date.now();
      if (now - lastActivityWriteAt < SESSION_ACTIVITY_WRITE_MS) return;
      lastActivityWriteAt = now;
      const resolved = resolveAttribution(true);
      if (resolved) ensureSessionStart(resolved.attribution);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") markActivity();
    };

    let observer: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== "undefined") {
      try {
        observer = new PerformanceObserver((list) => {
          if (list.getEntries().length > 0) markActivity();
        });
        observer.observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit & { durationThreshold: number });
      } catch {
        observer = null;
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    let activeSeconds = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        activeSeconds += 15;
        trackRuthEvent("session_ping", { active_seconds: activeSeconds });
      }
    }, 15000);
    const leave = () => {
      trackRuthEvent("page_leave", { pathname: previousPathRef.current || window.location.pathname, active_seconds: Math.max(1, Math.round((Date.now() - pageStartedRef.current) / 1000)) });
    };
    window.addEventListener("pagehide", leave);
    return () => { clearInterval(timer); window.removeEventListener("pagehide", leave); };
  }, []);
  return null;
}