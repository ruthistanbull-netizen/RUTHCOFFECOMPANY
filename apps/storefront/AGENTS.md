# Storefront implementation contract

This file extends the repository root `AGENTS.md` for everything under `apps/storefront`.

Before changing UI read:

- `docs/architecture/GLOBAL_UI_INTERACTION_SYSTEM.md`
- `docs/architecture/MOTION_AND_USABILITY_PLAYBOOK.md`
- `docs/architecture/UNIVERSAL_USABILITY_CONVENTIONS.md`
- `docs/architecture/TYPOGRAPHY_SYSTEM.md`
- `docs/architecture/VISUAL_INTEGRITY_AND_RUTHIE_IDENTITY.md`
- `docs/architecture/PHASE14_PERFORMANCE_TIMEOUT_ELIMINATION.md`

## Zero-patch rule

Do not fix storefront interaction bugs with another document/window listener, DOM query, MutationObserver, CSS override layer or `*Polish*`/`*Fix*`/`*Enhancer*` component that scans rendered markup.

When a behavior is wrong, identify its current owner, move the rule into the canonical component/shared primitive and remove the superseded behavior. New `V2/V3/V4` copies are not an acceptable migration strategy.

## Browser-native behavior first

- Vertical page scroll, pinch zoom, text selection, native links and form controls must keep their browser semantics unless a specific component intentionally owns that gesture.
- A touch that begins on a clickable product/card/menu control and turns into a scroll must not activate that control on release.
- Never use `preventDefault()` before a custom gesture has actually activated.
- Prefer `touch-action: pan-y`, `pan-x` or `manipulation` over broad `touch-action: none` when one axis should remain native.
- Swipe navigation must not compete with vertical scroll, lightbox pan/zoom or browser back gestures.

## Universal usability conventions

Transient UI follows `UNIVERSAL_USABILITY_CONVENTIONS.md`.

- Reversible lightbox/preview/popover/dropdown surfaces use light-dismiss where safe: outside click/tap + Escape + visible close path as appropriate.
- Clicking the empty lightbox backdrop closes the lightbox; clicking/dragging/zooming the media itself does not.
- Dirty forms never lose work through backdrop/Escape/swipe dismissal.
- Closing overlays restores focus/context to the opener.
- Menu/select/popover outside click closes the transient surface.
- Browser Back keeps platform expectations and must not be hijacked by decorative transitions.
- Mobile swipe convenience always has a visible button alternative.

## Responsive parity

Mobile and desktop are the same product system with different ergonomics.

- A feature or animation added on mobile receives a desktop-appropriate presentation, and vice versa.
- Do not duplicate commerce/state logic in separate mobile and desktop components.
- Mobile may use bottom sheets, edge-to-edge media and sticky bottom CTA patterns.
- Desktop may use centered dialogs, side panels, hover previews and keyboard shortcuts.
- Data, navigation state, focus behavior, validation and mutation semantics remain shared.
- Same design language does not mean identical dimensions: mobile and desktop use separate presentation metrics and must not be implemented by scaling one version into the other.
- Accidental clipping, text/control collision, fixed UI covering content or unexpected horizontal overflow is a regression at every breakpoint.

## Typography contract

Storefront typography follows `TYPOGRAPHY_SYSTEM.md`.

- Montserrat Variable is the functional family for navigation, product info, forms, cart, checkout and body content.
- Cinzel is the single editorial display family and is restricted to selected hero/campaign/collection display headings.
- Do not introduce page-specific font families.
- Storefront visual font sizes preserve the approved component design metrics unless an explicit design change is approved; semantic infrastructure must not silently resize the site.
- Font weight/family may be centralized without changing approved size/layout metrics.
- Do not fix text quality with new `TextSharpness`/CSS override layers.
- Resting text must not stay under scale/fractional transforms; product zoom scales image, not product title/price UI.
- Desktop rasterization must be visually clean rather than visibly jagged/pixelated; canonical font loading/rendering is Phase 4 ownership and real-browser/device certification is part of Phase 15.
- Turkish glyphs, fallback behavior, clipping and enlarged text must be tested.

## Motion

Use `@ruth-commerce/ui/motion` tokens and shared variants.

- Prefer transform/opacity.
- Respect `prefers-reduced-motion`.
- Motion is interruptible; a new user interaction cancels decorative motion.
- Do not apply view/page transitions universally. Use them only where they explain continuity (for example product card -> product detail, gallery/lightbox or collection/product context) and do not use them to slow forms, checkout or every route.
- Never hide the LCP image behind a long JS-triggered entrance animation.
- Do not use long blur-to-sharp effects for readable text.

## Global interaction primitives

Shared behavior belongs in `packages/ui` when it is used by both apps or across multiple storefront surfaces. Examples:

- press/tap feedback,
- modal/drawer/bottom-sheet behavior,
- lightbox focus/dismissal contract,
- gesture intent thresholds,
- carousel/gallery sensors,
- toast/status feedback,
- search/filter shells,
- motion variants,
- skeleton/empty/error patterns,
- typography roles/type ramps.

Page components compose these primitives; they do not globally rewrite unrelated rendered elements.

## Product/gallery interaction

- Vertical scrolling must remain available when touch starts on product media unless the gallery has deliberately activated a horizontal/zoom gesture.
- Horizontal swipe activation requires directional intent; vertical intent yields to page scroll.
- Do not loop galleries unless the product requirement explicitly calls for looping.
- Lightbox open/close animation must share one system on mobile and desktop, adapted to viewport size.
- Close, next/previous and zoom controls must be reachable by touch, mouse and keyboard.
- Empty backdrop click/tap closes a reversible lightbox when no zoom/pan gesture is active.
- Lightbox focus/scroll lock/Escape/focus restore are owned by the shared overlay primitive, not custom page listeners.

## Performance and accessibility

Phase 14 is the dedicated **Performance & Timeout Elimination** phase defined by `PHASE14_PERFORMANCE_TIMEOUT_ELIMINATION.md`.

- Primary touch targets should be at least 44x44 CSS px on the customer storefront where practical.
- Do not disable user zoom globally.
- Hover is enhancement only; no required action is hover-only.
- Preserve focus-visible and restore focus after overlays.
- Avoid full-screen GPU layers over long pages and image grids.
- Do not use tiny text as a density technique.
- Do not solve slow product/catalog pages by merely increasing hard timeout constants.
- Dynamic routes should acknowledge navigation immediately with client transitions/loading boundaries instead of appearing frozen while server data resolves.
- Use framework caching/tagged revalidation/prefetch where correctness permits, and avoid sequential data waterfalls when work can be consolidated or parallelized.
- Product-page data should converge on one canonical read/query owner rather than many remote round trips for current product, neighbors and relations.
- A temporary live-data slowdown should prefer a safe last-known-good/cache/loading state where product correctness permits rather than turning an expected fallback into a user-visible timeout.
- Phase 14 improvements require measured p50/p95/p99 and production runtime evidence; subjective speed alone is not acceptance.

## Required regression behavior

Any clickable element in a scrolling region must pass:

1. touch starts on the clickable element,
2. vertical movement scrolls the page,
3. release does not click/navigate,
4. a stationary tap still clicks/navigates.

Any horizontal swipe surface must also prove that a primarily vertical gesture scrolls the page instead of navigating the carousel/product sequence.

Any reversible overlay/lightbox must test outside-click where policy allows, Escape, visible Close, focus restoration and zoom/drag not accidentally dismissing it. Typography changes test 390/768/1440 widths and Turkish glyphs.