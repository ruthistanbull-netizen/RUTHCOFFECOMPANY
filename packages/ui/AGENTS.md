# Shared UI system contract

Everything in `packages/ui` is shared infrastructure. Components here must be reusable by admin and/or storefront without depending on page-specific DOM selectors or app-specific global listeners.

Read before changing shared UI behavior:

- `docs/architecture/GLOBAL_UI_INTERACTION_SYSTEM.md`
- `docs/architecture/MOTION_AND_USABILITY_PLAYBOOK.md`
- `docs/architecture/UNIVERSAL_USABILITY_CONVENTIONS.md`
- `docs/architecture/TYPOGRAPHY_SYSTEM.md`

## Ownership

`packages/ui` is the canonical home for cross-surface:

- motion tokens and variants,
- button/press semantics,
- overlays (modal, drawer, bottom sheet, popover, fullscreen/lightbox),
- dismissal policies (`light-dismiss`, `explicit-dismiss`, `protected-action`),
- focus management,
- select/combobox/picker primitives,
- toast/feedback primitives,
- save bar/dirty state primitives,
- list/table selection primitives,
- drag/tap/scroll intent sensors,
- responsive presentation adapters,
- loading/skeleton/empty/error states,
- typography families, semantic text roles and responsive type ramps.

It must not own commerce-domain decisions.

## Gesture rules

Shared gesture utilities must preserve native browser scrolling until a custom gesture clearly activates.

- Pointer/touch down alone is not intent to drag.
- Mouse/pen drag uses a movement threshold or handle.
- Touch drag uses delay + movement tolerance or handle.
- Vertical scroll intent cancels pending tap/drag on vertically scrolling surfaces.
- Never globally suppress `click` to repair a local drag/tap conflict.
- Do not require `touch-action: none` on entire scrollable cards when a smaller handle can own the drag.
- Keyboard accessibility is part of sortable behavior, not an optional enhancement.

## Universal usability ownership

- Reversible transient popovers/previews/lightboxes support safe outside-click/tap and Escape through the primitive, not caller listeners.
- Dirty/data-loss surfaces route every close path through one dirty-state policy.
- Protected financial/destructive surfaces cannot accidentally dismiss or double-submit.
- Overlay close restores focus unless workflow explicitly defines a better logical target.
- Resource row child actions do not bubble into row-open behavior.
- Shared copy, tooltip, overflow-menu, search-clear and feedback patterns own their own semantics.

## Typography ownership

- Shared typography exports semantic roles, not page-specific class patches.
- Admin and storefront may resolve the same semantic concept to app-specific family/size values while keeping one contract.
- Mobile and desktop type ramps are explicit responsive tokens; callers do not `scale()` text-containing UI to simulate a mobile layout.
- New font families require changing the canonical typography contract. App/page components cannot introduce arbitrary fonts.
- Avoid permanent transforms/blur on readable text. `font-synthesis: none` is part of the global contract.
- Numeric roles can expose tabular-number variants for stable operational columns/metrics.

## No app-DOM patching

Shared primitives must not:

- scan app markup by arbitrary class/text to locate controls,
- use `MutationObserver` to repair React output,
- call native value setters and synthesize form events,
- force z-index/pointer-events on unrelated overlays,
- depend on `apps/admin` or `apps/storefront` class names.

A shared component controls only its own rendered subtree and documented portals.

## Motion rules

- Add/extend named tokens in `motion.ts`; do not spread raw timing/easing constants through callers.
- Use transform/opacity first.
- Reduced-motion behavior is part of every shared motion primitive.
- Decorative animations must be interruptible.
- Same semantic interaction uses the same motion family across apps; presentation may adapt by viewport.
- Do not keep text under scaled/fractional resting transforms.

## API stability

When replacing a legacy behavior, prefer migrating callers to one canonical primitive instead of maintaining two parallel APIs. If a compatibility adapter is necessary, mark it deprecated and track removal. Do not create `V2/V3/V4` sibling primitives.