# Eğlence / birlikte izleme

`/eglence` is the authenticated panel entry (System → Eğlence). Creating a room
returns a host session and a 256-bit invitation. `/eglence/oda/[id]#davet=…`
is the standalone guest entry; AppFrame does not mount admin bootstrap, shell,
notification polling or operational overlays there. An invitation never grants
panel permissions. Rooms expire after 24 hours and admit eight active members.

## Deployment

Run `docs/self-hosted-sql/20261019012412_entertainment_watch_rooms.sql` once in
the **corresponding self-hosted database** for each panel. Keep Ruth and ROSTA
databases separate. Do not run this against a connected hosted Supabase project.
The SQL is deliberately outside Supabase's auto-deployed migrations directory, so the legacy hosted GitHub integration cannot apply this self-hosted-only setup. There are no new required environment variables or dependencies. Existing
server-side Supabase credentials are reused, and never sent to guests.

The tables have RLS enabled, no anonymous/authenticated grants, and no client
policies. Server APIs authorize every request using room-scoped hashed member
tokens. The separate invitation only permits joining. Only the creating admin
can recover a host session; only a host can change source/playback or close the
room. Playback updates use revision comparisons, and room join capacity is
serialized by an invoker trigger. Expired-room data is removed by cascade when
another room is created. No cron/realtime publication setup is required.

## Source behavior

- YouTube links use the official iframe player API; playback follows the host.
- Direct MP4/WebM and other browser-supported video files use native video.
- Website URLs open in a sandboxed preview. Cross-origin browsing and a site's
  embedded video cannot be synchronized by this panel. The UI states this.
- For arbitrary sites, the host opens the source in a separate desktop tab and
  selects **Sekmeyi paylaş**, with tab audio enabled. Guests can view on phones.
  The host preview is muted locally to prevent feedback.
- Screen capture requires a supported desktop browser and HTTPS. Protected
  content and some audio sources cannot be captured. No proxy removes provider
  restrictions, paywalls, frame headers or DRM.
- Browser autoplay may require each guest to press **İzlemeyi başlat** once.

Screen sharing uses WebRTC, with room-scoped offer/answer/ICE transport. STUN is
configured by default. Restrictive NAT/firewall combinations need a TURN relay.
An optional server-only `WATCH_PARTY_ICE_SERVERS_JSON` accepts an RTCIceServer
array, including TURN URLs and credentials. These relay credentials are returned
only to joined participants; use scoped/short-lived TURN credentials where
available. Missing TURN cannot guarantee screen sharing between all networks.

## Verification

- `node --test apps/admin/tests/entertainment.test.cjs` runs real route handlers
  and migration against PGlite: invitation, host/guest authorization, room
  isolation, revision conflict, chat, targeted signaling, capacity, RLS,
  expiry/cleanup and URL parsing.
- `npm run typecheck:admin-app`, `npm run build:admin` and
  `npm run build:storefront` cover the application build.
- With a local admin server running, `node apps/admin/tests/entertainment-browser.cjs`
  runs two isolated browser sessions with actual handlers/Postgres behind a test
  transport. It checks join, play/pause/seek, chat, guest isolation, three widths,
  and real WebRTC transport with a generated test screen. Requires Playwright's
  browser and ffmpeg; `WATCH_TEST_URL` selects the server. Optional
  `WATCH_AXE_MODULE` points to axe.min.js for an accessibility scan.

Production SQL application, Zeabur build completion, real YouTube availability,
desktop tab/audio permissions and cross-network TURN connectivity still require
verification in the deployed self-hosted environment.
