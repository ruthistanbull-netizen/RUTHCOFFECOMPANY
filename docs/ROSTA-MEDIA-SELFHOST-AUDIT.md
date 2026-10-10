# ROSTA media and self-host audit — 2026-10-10

The audit covers the admin and storefront source trees, shared packages, upload APIs, Store Design V2 draft/preview/publish paths, agent API boundaries, deployment files, and database/Storage endpoints. No production records or media objects were changed during diagnosis.

## Confirmed causes and changes

| Finding | Evidence | Change |
| --- | --- | --- |
| Retired Cloud Storage is still requested | Mobile hero and scroll media returned HTTP 402 with `exceed_cached_egress_quota`; browser reported `ERR_BLOCKED_BY_ORB` and video format errors | Rewrite both old Cloud and self-host public assets through the storefront media gateway, independently of environment variables |
| Storefront build embeds the storefront URL as the database URL | Public bundle called the database URL validator with `https://rostacoffecompany.zeabur.app/`; the caught error left legacy media unchanged | Both build configs embed the self-host URL; shared resolver defaults to self-host and treats the retired address solely as an input alias |
| Responsive overrides reintroduce old addresses | Desktop editorial media loaded, then mobile overrides switched to old Cloud assets and failed | Normalize nested media documents, mobile overrides, previews, draft/publish input and semantic media updates consistently |
| Self-host metadata reports success while file reads fail | All 53 published objects return HEAD 200, but GET with a byte range returns 500 for 24 objects; full GET also fails on checked Studio/wholesale samples | Added a repeatable public GET-based checker. Application URL fixes cannot repair this Storage backend failure; server logs and the migrated physical files must be inspected |
| New product/generic uploads expose different delivery URLs | Five upload endpoints returned raw Storage URLs while theme upload used the media gateway | All return the same public media delivery contract |
| Images pass through without optimization | Current editorial PNG is 2,022,536 bytes at 1108×1419 | New theme images preserve aspect ratio/alpha and are encoded as WebP, capped at 2560 pixels without enlargement; this sample becomes 210,554 bytes, a 90% reduction |
| Long streams can be interrupted by a connection deadline | Proxy fetch signals remained active throughout the response body | Deadline covers connection and response headers; the streamed body may continue after that deadline |
| Browser cache is shortened by the proxy | Storage advertises a year; proxy changes it to five minutes | Timestamp/UUID upload paths receive immutable one-year caching; mutable filenames retain the shorter policy |
| Every asset is relayed through another app | Storefront tries the panel bridge before direct Storage | Try canonical public Storage directly, retain the panel bridge as fallback; no service key is required for public reads |
| Validation/seek responses are lost | Proxy accepts only `response.ok` | Preserve HTTP 304/416, conditional headers and video byte ranges |
| Alternate admin image lacks the converter | `Dockerfile.admin` does not install ffmpeg although upload invokes it | Install ffmpeg in that image too |
| Legacy configuration can return | Both `.env.example` files and storefront README name the retired Cloud database | Examples/documentation now name the self-host URL |

## Database and object evidence

- Active API: `https://rosta-supabase.tail178b60.ts.net`, publicly reachable through Tailscale Funnel.
- Public settings were read from the active API with the deployed public anon key, without exposing keys in the report.
- Published revision 261 has 53 unique media URLs: 36 still name the retired Cloud origin. All 53 self-host HEAD requests return HTTP 200. **This is metadata evidence, not proof that file bytes exist or are readable.** The subsequent GET audit returns 206 with media bytes for 29 objects and 500 `InternalError` for 24. Full GET on checked failing Studio/wholesale samples also returns 500, and the live storefront gateway returns 502 for them.
- The published document has 99 URL occurrences across nested fields: 66 Cloud, 32 storefront gateway and one self-host URL. Copies of URLs in multiple fields account for the difference from unique object counts.
- Panel and storefront publication status both report revision 261 and `inSync: true`. This isolates the observed failure to media delivery/responsive overrides rather than a missing publish write.
- Old Cloud metadata shows 135 objects and 20 videos in `rosta-media`; its Storage service rejects public downloads because of cached-egress quota. Old metadata is historical evidence, not the active Storage configuration.
- Current video GET with `Range: bytes=0-65535` returns 206 and a correct `Content-Range`. The migrated original mobile hero is a valid H.264/yuv420p MP4, 720×1280, 14.28 seconds. Its browser format error came from the quota JSON response.
- The public catalog exposes one product and four image rows pointing to one unique media path. That path also has HEAD 200 and a failing ranged GET. Product media must be included in the server-side repair, not only theme media.
- Fourteen Studio/wholesale images reached the canonical self-host in a full scroll test, but all returned backend 500 / gateway 502. Homepage theme images loaded with no broken images or retired Cloud requests. Do not interpret successful URL normalization as a complete live repair.
- Raw records containing legacy references remain readable. The display adapter converts them; the next authorized design save writes normalized references. Historical snapshots were not rewritten or deleted.

## Source scan and validation

- Full tracked-file inventory: 1,566 files, plus three new source/test files. 1,543 UTF-8 text files were inspected and 26 binary files identified. Generated build output, dependencies and local credentials are excluded from the source inventory.
- Runtime endpoint guard scans 1,195 source files. No unapproved database endpoint remains.
- The retired address exists only in one compatibility constant, negative tests, historical deployment documentation and read-only detection scripts. It is never a connection fallback. Foreign tenants and signed/private URLs are preserved or rejected as appropriate.
- Nine media regression tests cover missing/stale config, tenant isolation, nested mobile/poster references, encoded filenames, same-origin delivery, cache policy and uninterrupted slow streaming.
- Image checks cover aspect ratio, no enlargement, alpha preservation and rejection of corrupt bytes.
- Admin/storefront production builds and all-app type checks pass.
- Run `python3 scripts/rosta-public-media-delivery-check.py` to check actual public bytes against the current published revision; `--gateway` checks the live storefront delivery path. It retries transient server failures once, compares failing reads with HEAD, prints no credentials and exits nonzero for failed media.
- The broad core suite has seven existing failures with identical names on the untouched baseline. The original Store Design verifier has a temporal-dead-zone error at `blockRenderer`; parity verifier has existing brand/metadata assertions. These are recorded rather than reported as passed.
- GitHub Actions `rosta-check` did not execute any steps: GitHub reports "The job was not started because your account is locked due to a billing issue." The separate Supabase Preview integration still points to the retired Cloud project and is disabled; it does not run a self-host preview.

## Access limits

Authenticated upload/publish clicks were not performed without a panel session. Current bucket metadata is not available to the public anon role. The authenticated self-host server/container session is unavailable here, so the exact cause of the 24 persistent Storage GET failures remains unverified: physical-file migration, object versions/paths, backend configuration and logs must be checked on that server. Full container configuration, global upload limits, private table data, RLS and resumable-upload infrastructure also require authenticated server access; old Cloud bucket settings must not be mistaken for those settings.
