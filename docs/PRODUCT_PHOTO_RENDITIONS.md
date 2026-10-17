# Product photo renditions

The authenticated upload/edit routes own product photo processing. RR HUB and
the web image editor use the same focal-point/zoom contract. No database schema
or gallery column changes are needed; existing product/variant gallery writes
and conflict checks remain authoritative.

## Storage contract

Each upload or edit creates a fresh `products/crops-v1/<UUID>/` asset family in
the brand's existing product-media bucket:

- `original`: uncut uploaded bytes with their actual image MIME type.
- `website.webp`: 1200 × 1600, 3:4.
- `application.webp`: 1200 × 1800, 2:3.
- `edits.json`: version 1, independent `website` and `application` drafts.

Each draft has `focalX`, `focalY` (0...1), `zoom` (1...4), quarter-turn `rotation`
and `flipX`. EXIF orientation is applied first, then rotation, then horizontal
mirroring; focal coordinates refer to that oriented image. Both crops are
always rendered from the uncut original, never from a previous crop.

The existing gallery stores `website.webp`. The Ruth native shopping app's
common image resolver selects the sibling `application.webp` only for this
asset family. Old URLs are unchanged. Opening an old image uses its existing
file as the source; previously removed pixels cannot be recovered.

`GET /api/products/edit-image?url=...` returns source + both drafts.
`POST /api/products/edit-image` requires `{url, edits:{website,application}}`.
The web editor was migrated with the API; reload any open old editor after
deployment. Admin authentication and HTTPS/source validation remain required.

An asset family is returned only after all four uploads succeed. Partial
uploads are removed on failure; the existing gallery still references the old
immutable family until its normal gallery save succeeds. Existing families
are never overwritten or deleted by editing.

## Self-hosted rollout

1. The operator runs `ops/product-photo-renditions-storage.sql` manually on each
   brand's **self-hosted** database. It adds JSON/GIF MIME types only to existing
   product buckets with an allowlist; it preserves all other types/policies.
   Do not execute this against the connected hosted Supabase project.
2. Deploy the web/admin backend and editor together, then build the RR HUB and
   shopping iOS feature branches. Server credentials stay server-side.
3. Verify a square upload, edit each target independently, reopen the editor,
   check Website 3:4 / shopping app 2:3, and drag first/middle/last positions in
   product and variant galleries. Main product galleries save automatically;
   variant galleries keep their existing explicit Save action.

Automated tests: `npx tsx --tsconfig tsconfig.json --test tests/product-photo-assets.test.ts`
from `apps/admin`. Tests use in-memory Storage and real Sharp; no DB access.

Rollback: restore API/editor/iOS code together. Existing gallery URLs continue
to point to valid website images. Keep immutable sources/renditions in Storage;
the MIME additions do not require a rollback. An asset-family cleanup policy
is outside this change and must account for gallery references/revisions.
