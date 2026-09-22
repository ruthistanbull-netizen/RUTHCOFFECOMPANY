# ROSTA Production Deployment

Production targets:

- Storefront: `https://rostacoffecompany.zeabur.app`
- Admin: `https://rostapanel.zeabur.app`
- Supabase project ref: `fposvxuryzidmeuwytbg`

## Storefront service

Use the repository root `Dockerfile`.

Required environment variables:

```env
ROSTA_APP=storefront
NEXT_PUBLIC_SITE_URL=https://rostacoffecompany.zeabur.app/
NEXT_PUBLIC_ADMIN_URL=https://rostapanel.zeabur.app/
NEXT_PUBLIC_SUPABASE_URL=https://fposvxuryzidmeuwytbg.supabase.co
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
NEXT_PUBLIC_SUPABASE_URL=https://fposvxuryzidmeuwytbg.supabase.co
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

Do not reuse secrets from Ruth Istanbul commerce.

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

- Admin and storefront reject any Supabase hostname outside `fposvxuryzidmeuwytbg.supabase.co`.
- Storefront Docker image no longer builds or starts the admin application.
- Runtime catalog has no Ruth Istanbul static-product fallback.
- Legacy ikas image-cache tooling is removed.
- ROSTA Points uses the ROSTA-named public RPC layer.
- Internal commerce queues, email queue, analytics and contact data are stored in the ROSTA Supabase project.
