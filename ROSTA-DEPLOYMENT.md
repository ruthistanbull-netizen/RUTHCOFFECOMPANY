# ROSTA Production Deployment

Production targets:

- Storefront: `https://rostacoffecompany.zeabur.app`
- Admin: `https://rostapanel.zeabur.app`
- Legacy Cloud project ref: `fposvxuryzidmeuwytbg` (rollback reference only)
- OVHcloud self-hosted API: `https://rosta-supabase.tail178b60.ts.net` (Tailscale Funnel)

## Storefront service

Use the repository root `Dockerfile`.

Required environment variables:

```env
ROSTA_APP=storefront
NEXT_PUBLIC_SITE_URL=https://rostacoffecompany.zeabur.app/
NEXT_PUBLIC_ADMIN_URL=https://rostapanel.zeabur.app/
NEXT_PUBLIC_SUPABASE_URL=https://rosta-supabase.tail178b60.ts.net
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ROSTA publishable key>
NEXT_PUBLIC_USE_SUPABASE_CATALOG=true
NEXT_PUBLIC_FAST_NAVIGATION_MODE=true
NEXT_PUBLIC_CATALOG_REVALIDATE_SECONDS=600

SUPABASE_SERVICE_ROLE_KEY=<ROSTA service role key>

REVALIDATE_SECRET=<shared revalidation secret>
WEBSITE_REVALIDATE_SECRET=<same shared revalidation secret>
CRON_SECRET=<ROSTA cron secret>
COMMERCE_WORKER_SECRET=<ROSTA commerce worker secret>
COMMERCE_HEALTH_SECRET=<ROSTA commerce health secret>

ACCOUNT_RATE_LIMIT_SALT=<random stable secret>
ORDER_TRACKING_RATE_LIMIT_SALT=<random stable secret>
CONTACT_IP_HASH_SALT=<random stable secret>
ANALYTICS_IP_HASH_SALT=<random stable secret>
```

Optional brand contact variables:

```env
NEXT_PUBLIC_ROSTA_INSTAGRAM_URL=
NEXT_PUBLIC_ROSTA_TIKTOK_URL=
NEXT_PUBLIC_ROSTA_WHATSAPP_URL=
NEXT_PUBLIC_ROSTA_SUPPORT_EMAIL=
```

PayTR production variables:

```env
PAYTR_MERCHANT_ID=
PAYTR_MERCHANT_KEY=
PAYTR_MERCHANT_SALT=
PAYTR_TEST_MODE=1
PAYTR_PAYMENT_FLOW=iframe_v2
```

Set `PAYTR_TEST_MODE=0` only after production PayTR credentials and callback configuration are verified.

Transactional Gmail worker variables:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GMAIL_TOKEN_ENCRYPTION_KEY=<same stable key as admin>
```

## Admin service

Use `Dockerfile.admin`.

Required environment variables:

```env
ROSTA_APP=admin
NEXT_PUBLIC_PANEL_URL=https://rostapanel.zeabur.app/
NEXT_PUBLIC_SUPABASE_URL=https://rosta-supabase.tail178b60.ts.net
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<ROSTA publishable key>
SUPABASE_SERVICE_ROLE_KEY=<ROSTA service role key>

NEXT_PUBLIC_STORE_URL=https://rostacoffecompany.zeabur.app/
NEXT_PUBLIC_SITE_URL=https://rostacoffecompany.zeabur.app/
WEBSITE_REVALIDATE_URL=https://rostacoffecompany.zeabur.app/api/revalidate
WEBSITE_REVALIDATE_SECRET=<same shared revalidation secret as storefront>
REVALIDATE_SECRET=<same shared revalidation secret as storefront>
```

One-time bootstrap:

```env
ADMIN_BOOTSTRAP_SECRET=<long random one-time secret>
```

Remove `ADMIN_BOOTSTRAP_SECRET` after the first admin user has been created successfully.

Gmail OAuth:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GMAIL_REDIRECT_URI=https://rostapanel.zeabur.app/api/email/gmail/callback
GMAIL_TOKEN_ENCRYPTION_KEY=<same stable key as storefront>
```

Google OAuth authorized redirect URI must include:

```text
https://rostapanel.zeabur.app/api/email/gmail/callback
```

## Secret equality rules

These values must intentionally match across services:

1. Admin `WEBSITE_REVALIDATE_SECRET` = storefront `WEBSITE_REVALIDATE_SECRET` / `REVALIDATE_SECRET`.
2. Admin `GMAIL_TOKEN_ENCRYPTION_KEY` = storefront `GMAIL_TOKEN_ENCRYPTION_KEY`.
3. Both services must use the same ROSTA Supabase project and service-role key.

Do not reuse secrets from any legacy commerce environment.

## First production activation order

1. Deploy storefront with the storefront-only root Dockerfile.
2. Deploy admin with `Dockerfile.admin`.
3. Confirm admin `/api/health/ready`.
4. Create the first admin account through the one-time bootstrap endpoint.
5. Remove `ADMIN_BOOTSTRAP_SECRET` and redeploy admin.
6. Sign in to admin and connect the ROSTA Gmail account from **E-posta**.
7. Add a test category, product, variant and stock from admin.
8. Confirm the product appears on storefront after revalidation.
9. Test cart, checkout draft and ROSTA Points.
10. Configure PayTR production credentials/callback and perform a controlled payment test.
11. Confirm order creation, stock update, order-confirmation email and order tracking.
12. Run the commerce worker with `Authorization: Bearer <COMMERCE_WORKER_SECRET>` and confirm queues remain healthy.

## Isolation guarantees

- Admin and storefront connect only to the ROSTA OVHcloud Funnel origin. The retired Cloud address is recognized solely to translate imported configuration/media into the self-host target; it is never a connection fallback. Ruth Supabase is never a valid ROSTA target.
- Storefront Docker image no longer builds or starts the admin application.
- Runtime catalog has no legacy static-product fallback.
- Legacy image-cache tooling is removed.
- ROSTA Points uses the ROSTA-named public RPC layer.
- Internal commerce queues, email queue, analytics and contact data are stored in the ROSTA Supabase project.

## ROSTA OVHcloud account and staged cutover

- Only run ROSTA owner bootstrap against local ROSTA API `127.0.0.1:18000`.
- Before deploying the role-enforced admin code, run `python3 scripts/bootstrap-rosta-owner.py` (read-only preview), then `python3 scripts/bootstrap-rosta-owner.py --apply` interactively on the ROSTA VPS. The password must NEVER be saved in this repository or provided in a screenshot.
- `Hesabım → Yeni Kullanıcı → Geçici Şifre` already offers direct account creation. Only the authenticated owner may create accounts; server-controlled `app_metadata.panel_role` now determines permissions.
- Keep ROSTA cron jobs disabled until all integrations and worker schedules are reviewed. Self-hosted `pg_cron` does not inherit Supabase Cloud schedules.
- Zeabur storefront and panel must both use the SAME ROSTA OVHcloud API URL, ROSTA OVHcloud `ANON_KEY` for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and ROSTA OVHcloud `SERVICE_ROLE_KEY` for server-only `SUPABASE_SERVICE_ROLE_KEY`.
- Run `node scripts/audit-rosta-supabase-endpoints.mjs` from a repository checkout before merge and verify any legacy absolute Storage URLs in ROSTA site settings, hero/scroll media, and product media. Importantly, copied Storage metadata is not equivalent to a copied physical object.
- Run `python3 scripts/rosta-public-media-delivery-check.py` and then the same command with `--gateway`. Both must exit successfully and return actual image/video bytes. A successful HEAD response alone does not certify a migrated object. If direct Storage returns 500, inspect its container logs, physical object data, configured backend/volume and object versions before treating the migration as complete.
- Confirm Supabase Auth redirect URLs, CORS/preflight requests, Storage GET/POST, HTTPS certificate, product/cart reads, checkout and payment callback behavior before enabling live traffic.
- Do not modify Ruth's Caddy, Docker networks, containers, database, or HTTPS configuration.
