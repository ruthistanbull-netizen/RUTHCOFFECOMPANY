# ROSTA panel data loading

The shared panel request path now starts the live read immediately rather than waiting for the optional persisted read-model. Concurrent consumers share one request, including warmup and freshness reconciliation. An aborted consumer does not abort another consumer; mutations and token rotation prevent older responses from replacing newer cache entries. Invalid success bodies are rejected instead of becoming false empty lists.

Products, orders and customers no longer wait for counters for unrelated tables. A non-empty list can render immediately; an empty list must still agree with its own live count. Product relations are joined into the product query while category and collection dictionaries load concurrently. The selected editable product opens independently of the full catalogue and field settings; late auxiliary results cannot reset the current draft.

The Supabase server transport shares identical concurrent GET/HEAD requests only, with authorization and representation headers included in the key. It has no persisted response cache. Writes detach in-flight reads. REST read and write deadlines are 8 and 30 seconds and remain active through the response body; abort is propagated to HTTP transport. PostgreSQL cancellation depends on the server. Supabase SDK retries can create additional attempts before an individual attempt expires. Auth user reads use a 3-second transport deadline. Other Auth and Storage operations keep their existing transport.

Concurrent JWT verification has no result TTL. ROSTA mutations still fetch authoritative app_metadata separately, including disabled-account and role checks. Coffee field defaults, editable information_sections, appointment invalidation, the ROSTA Supabase URL assertion and existing media handling remain intact. No database, schema or production environment changes are required.

## Verification

- Panel CJS runtime tests: 44 passed, including 17 shared-read/transport/auth regressions and ROSTA live role revocation.
- Panel registry tests: 3 passed.
- All workspace type checks passed.
- Changed-source ESLint: no errors; 85 legacy-pattern warnings. The existing Ruth Next/TypeScript configuration was supplied explicitly because the ROSTA admin package has no ESLint configuration.
- Public read-only query against the current self-hosted ROSTA database: HTTP 200 in 773 ms, with all four product relation paths and information_sections accepted. This is one observation, not a private panel latency benchmark.
- Existing commerce-core suite: 98/105 pass, with the same seven failures reproduced against unchanged main sources. The failures concern three Node module-resolution tests, Ruthie registry expectations and three theme normalization expectations.
- Existing ROSTA parity verifier: the same ten stale source-pattern findings are present on main (footer types, shortcut and PWA/notification branding patterns).

Both production builds passed: admin (webpack) and storefront (Turbopack). Local workspace root discovery initially failed because npm install was run without generating a lockfile; generating the local installation lockfile restored the normal build path. No build configuration change was needed. Browser fixtures passed all 12 scenarios at 390, 768 and 1440 pixels: immediate populated list, editable quick detail, editable studio detail and false-empty protection. Auxiliary catalogue/settings responses were delayed 3.5 seconds; the product name could be edited within the 2.5-second assertion and remained edited after late data arrived. Screenshots were inspected for mobile list and desktop studio. The initial fixture omitted the ROSTA hub selection and was corrected without changing application auth. Private production list/edit flows require an authenticated admin session; public probes and local intercepted fixtures do not replace that validation.
