# Ruth Istanbul — Base44 Next Theme

Base44 tasarımından Next.js + Vercel + self-hosted Supabase yapısına çevrilmiş Ruth Istanbul site projesi.

## Sayfalar

- `/`
- `/products`
- `/products/[slug]`
- `/collections`
- `/collections/[slug]`
- `/category/[slug]`
- `/about`
- `/contact`
- `/shipping-returns`
- `/privacy-policy`
- `/terms`
- `/kvkk`

## Vercel ENV

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.ruthistanbul.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<self-hosted anon key>
SUPABASE_SERVICE_ROLE_KEY=<self-hosted service-role key; server-only>
NEXT_TELEMETRY_DISABLED=1
```

## Önemli

`SUPABASE_SERVICE_ROLE_KEY` yalnız server route/action kodunda kullanılabilir; browser bundle içine taşınamaz. Storefront ve panel production ortamı canonical self-hosted Supabase adresi `https://supabase.ruthistanbul.com` üzerinden çalışır.

Production deploy doğrulaması UI Architecture Guard snapshot kontrolüyle birlikte çalışır.

Snapshot-only CI düzeltmelerinden sonra production storefront build'i bilinçli olarak yeniden tetiklenir.

Deploy preflight marker: Phase 8 behavioral verifier alignment validated on 2026-08-28.
