# ROSTA external integrations — connect after deploy

This repository contains the integration infrastructure only. Keep every credential blank until ROSTA's own account is ready. Never copy Ruth Istanbul account IDs, tokens, merchant credentials, OAuth refresh tokens, pixels, catalogs or email connections.

## Gmail

Admin Zeabur service:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GMAIL_REDIRECT_URI=https://rostapanel.zeabur.app/api/email/gmail/callback`
- `GMAIL_TOKEN_ENCRYPTION_KEY`

After those values are present, use **Entegrasyonlar → Gmail → Bağla** and authorize the ROSTA Gmail account. The account connection itself is stored through the panel OAuth flow; it is not seeded from Ruth.

Storefront transactional email worker uses the same Google client credentials and the same `GMAIL_TOKEN_ENCRYPTION_KEY`.

## Meta Ads / Meta Pixel / CAPI

Admin Zeabur service, for Ads Manager/reporting:
- `META_SYSTEM_USER_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_BUSINESS_ID`
- `META_PAGE_ID`
- `META_PIXEL_ID`
- `META_CATALOG_ID` (optional)
- `META_INSTAGRAM_ACTOR_ID` (optional)
- `META_APP_ID` (optional)
- `META_APP_SECRET` (optional)
- `META_GRAPH_API_VERSION` (optional; runtime has a default)

Storefront Zeabur service, for browser + server conversion measurement:
- `NEXT_PUBLIC_META_PIXEL_ID`
- `META_PIXEL_ID`
- `META_CAPI_ACCESS_TOKEN`
- `META_CAPI_TEST_EVENT_CODE` (test only)
- `META_GRAPH_API_VERSION` (optional)

Leave these blank until the ROSTA Business Manager, ad account and Pixel are ready.

## TikTok

Admin Zeabur service, for Ads API/reporting:
- `TIKTOK_ACCESS_TOKEN`
- `TIKTOK_ADVERTISER_ID`

Storefront Zeabur service, for TikTok Pixel:
- `NEXT_PUBLIC_TIKTOK_PIXEL_ID`

The storefront Pixel loads only after marketing consent and only when this Pixel ID is configured.

## Google Analytics 4

Storefront Zeabur service:
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- `GA4_MEASUREMENT_ID` (server fallback)
- `GA4_API_SECRET` (Measurement Protocol/server events)

Admin Zeabur service:
- `GA4_MEASUREMENT_ID`

## Google Tag Manager

Storefront Zeabur service:
- `NEXT_PUBLIC_GTM_ID`

Admin Zeabur service, for the integration status card:
- `GTM_CONTAINER_ID`

The storefront container loads only after marketing consent.

When GTM is configured, it owns browser-side GA4 delivery so the storefront does not also load direct gtag and double-count the same browser events. Server-side GA4 Measurement Protocol remains independent.

## Microsoft Clarity

Storefront Zeabur service:
- `NEXT_PUBLIC_CLARITY_PROJECT_ID`

Admin Zeabur service, for the integration status card:
- `CLARITY_PROJECT_ID`

There is no default Ruth Clarity project in ROSTA.

## PayTR

Admin Zeabur service:
- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`

Storefront Zeabur service:
- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `PAYTR_TEST_MODE=1` while testing, then `0` for production
- `PAYTR_DEBUG_ON`
- `PAYTR_NO_INSTALLMENT`
- `PAYTR_MAX_INSTALLMENT`
- `PAYTR_PAYMENT_FLOW=iframe_v2` unless intentionally switching flows

PayTR notification/callback URL:
- `https://rostacoffecompany.zeabur.app/api/paytr/callback`

Until merchant credentials exist, PayTR recovery jobs skip cleanly instead of pretending the provider is connected.

## ROSTA shipping prices

This is a commercial setting, not an inherited Ruth default. Configure it from **Panel → Kargo** before taking live checkout orders:
- free-shipping threshold
- customer shipping fee

Optional storefront env fallbacks exist as `FREE_SHIPPING_THRESHOLD` and `SHIPPING_FEE`, but the panel setting is preferred.

## Basit Kargo

Admin Zeabur service:
- `BASIT_KARGO_API_TOKEN`
- `BASIT_KARGO_API_BASE_URL=https://basitkargo.com/api`
- `BASIT_KARGO_API_TIMEOUT_MS=15000`
- `BASIT_KARGO_WEBHOOK_SECRET`
- `BASIT_KARGO_DEFAULT_HEIGHT`
- `BASIT_KARGO_DEFAULT_WIDTH`
- `BASIT_KARGO_DEFAULT_DEPTH`
- `BASIT_KARGO_DEFAULT_WEIGHT`

Webhook URL:
- `https://rostapanel.zeabur.app/api/shipping/basit-kargo/webhook`

Without `BASIT_KARGO_API_TOKEN`, the provider remains unbound.

## Search Console

Admin Zeabur service:
- `GOOGLE_SEARCH_CONSOLE_CLIENT_ID`
- `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET`
- `GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN`

Use ROSTA's own verified Search Console property.

## OpenAI / ROSTA Insight

Admin Zeabur service:
- `OPENAI_API_KEY`
- optional `ROSTA_INSIGHT_CHAT_MODEL`
- optional `ROSTA_INSIGHT_REALTIME_MODEL`
- optional `ROSTA_INSIGHT_TRANSCRIPTION_MODEL`
- optional `ROSTA_INSIGHT_VOICE`
- optional `ROSTA_INSIGHT_VAD_EAGERNESS`

## Zeabur / GitHub status integrations

Admin Zeabur service:
- `ZEABUR_SERVICE_ID`
- `ZEABUR_PROJECT_ID`
- `ZEABUR_WEB_URL`
- `GITHUB_TOKEN`
- `ROSTA_GITHUB_REPOSITORY=ruthistanbull-netizen/RUTHCOFFECOMPANY`

Use a GitHub token scoped only as broadly as ROSTA actually needs.

## Rule

A provider is allowed to be **not connected**. Missing credentials must produce a controlled “Bağlı değil / yapılandırılmadı” state, not a fake success and not a Ruth fallback.
