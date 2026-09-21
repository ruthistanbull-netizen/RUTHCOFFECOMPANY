import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const headerPath = fileURLToPath(
  new URL("../src/components/Header.tsx", import.meta.url),
);
const layoutPath = fileURLToPath(
  new URL("../src/app/layout.tsx", import.meta.url),
);
const mobileChromePath = fileURLToPath(
  new URL("../src/components/MobileSafeAreaContinuity.tsx", import.meta.url),
);
const requestedFixesPath = fileURLToPath(
  new URL("../src/components/StorefrontRequestedFixes.tsx", import.meta.url),
);

const oldHeaderRules = `.ruth-zara-header{height:64px;color:var(--ink);background:transparent;border-bottom:1px solid transparent;transition:background-color 450ms ease-in-out,border-color 450ms ease-in-out,box-shadow 450ms ease-in-out,backdrop-filter 450ms ease-in-out}.ruth-zara-header.is-scrolled{background:color-mix(in srgb,var(--ivory) 94%,transparent);border-color:color-mix(in srgb,var(--gold) 22%,transparent);box-shadow:0 2px 18px rgb(44 37 32/5%);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}.ruth-zara-header.is-contrast{background:transparent;border-color:transparent;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}`;

const newHeaderRules = `.ruth-zara-header{height:64px;color:var(--ink);background:transparent;border:0!important;outline:0!important;box-shadow:none!important;transition:background-color 450ms ease-in-out,backdrop-filter 450ms ease-in-out}.ruth-zara-header::before{content:none!important;display:none!important;border:0!important;outline:0!important;box-shadow:none!important}.ruth-zara-header::after{content:""!important;display:block!important;position:absolute!important;right:0!important;bottom:-1px!important;left:0!important;height:1px!important;background:transparent!important;border:0!important;outline:0!important;box-shadow:none!important;pointer-events:none!important}.ruth-zara-header.is-scrolled{background:color-mix(in srgb,var(--ivory) 94%,transparent);border:0!important;outline:0!important;box-shadow:none!important;-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}.ruth-zara-header.is-contrast{background:transparent;border:0!important;outline:0!important;box-shadow:none!important;-webkit-backdrop-filter:none;backdrop-filter:none}`;

const oldInnerRule = `.ruth-zara-header-inner{height:64px;padding-inline:16px}`;
const newInnerRule = `.ruth-zara-header-inner{height:64px;padding-inline:16px;border:0!important;outline:0!important;box-shadow:none!important}`;

const oldMobileThemeColor = `      applyThemeColorWithoutTakingHeadOwnership(color);`;
const legacyTransparentThemeColor = `      applyThemeColorWithoutTakingHeadOwnership("transparent");`;
const newMobileThemeColor = `      applyThemeColorWithoutTakingHeadOwnership(DEFAULT_SURFACE);`;

const forcedMobileTopDivider = `          height: max(env(safe-area-inset-top), 1px);`;
const transparentMobileTopDivider = `          height: 0 !important;
          min-height: 0 !important;
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;`;

const layoutAnchor = `          .site-app-shell .product-card-image-frame img,`;
const layoutGuard = `          html body.site-app-shell header.ruth-zara-header,
          html body.site-app-shell header.ruth-zara-header.is-scrolled,
          html body.site-app-shell header.ruth-zara-header.is-contrast,
          html body.site-app-shell header.ruth-zara-header > .ruth-zara-header-inner {
            border: 0 !important;
            border-top: 0 !important;
            border-right: 0 !important;
            border-bottom: 0 !important;
            border-left: 0 !important;
            outline: 0 !important;
            box-shadow: none !important;
          }

          html body.site-app-shell header.ruth-zara-header::before,
          html body.site-app-shell header.ruth-zara-header > .ruth-zara-header-inner::before,
          html body.site-app-shell header.ruth-zara-header > .ruth-zara-header-inner::after,
          html body.site-app-shell main::before,
          html body.site-app-shell main::after {
            content: none !important;
            display: none !important;
            border: 0 !important;
            outline: 0 !important;
            box-shadow: none !important;
          }

          html body.site-app-shell header.ruth-zara-header::after {
            content: "" !important;
            display: block !important;
            position: absolute !important;
            right: 0 !important;
            bottom: -1px !important;
            left: 0 !important;
            width: auto !important;
            height: 1px !important;
            background: transparent !important;
            border: 0 !important;
            outline: 0 !important;
            box-shadow: none !important;
            pointer-events: none !important;
          }

          html body.site-app-shell main {
            border-top: 0 !important;
            outline: 0 !important;
            box-shadow: none !important;
          }

${layoutAnchor}`;

let headerSource = await readFile(headerPath, "utf8");
let headerChanged = false;

if (headerSource.includes(oldHeaderRules)) {
  headerSource = headerSource.replace(oldHeaderRules, newHeaderRules);
  headerChanged = true;
} else if (!headerSource.includes(newHeaderRules)) {
  throw new Error("Global header seam patch failed: header rule was not found.");
}

if (headerSource.includes(oldInnerRule)) {
  headerSource = headerSource.replace(oldInnerRule, newInnerRule);
  headerChanged = true;
} else if (!headerSource.includes(newInnerRule)) {
  throw new Error("Global header seam patch failed: inner header rule was not found.");
}

if (headerChanged) {
  await writeFile(headerPath, headerSource, "utf8");
}

let layoutSource = await readFile(layoutPath, "utf8");
let layoutChanged = false;
const originalLayout = layoutSource;

if (!layoutSource.includes(layoutGuard) && layoutSource.includes(layoutAnchor)) {
  layoutSource = layoutSource.replace(layoutAnchor, layoutGuard);
  layoutChanged = true;
}

layoutSource = layoutSource.replace(
  `            border-color: rgba(184, 151, 106, 0.18) !important;`,
  `            border: 0 !important;\n            outline: 0 !important;\n            box-shadow: none !important;`,
);
layoutSource = layoutSource.replace(
  `            border-color: rgba(184, 151, 106, 0.20) !important;`,
  `            border: 0 !important;\n            outline: 0 !important;\n            box-shadow: none !important;`,
);

if (layoutSource !== originalLayout) {
  layoutChanged = true;
}

if (layoutChanged) {
  await writeFile(layoutPath, layoutSource, "utf8");
}

let mobileChromeSource = await readFile(mobileChromePath, "utf8");
let mobileChromeChanged = false;

if (mobileChromeSource.includes(oldMobileThemeColor)) {
  mobileChromeSource = mobileChromeSource.replace(
    oldMobileThemeColor,
    newMobileThemeColor,
  );
  mobileChromeChanged = true;
} else if (mobileChromeSource.includes(legacyTransparentThemeColor)) {
  mobileChromeSource = mobileChromeSource.replace(
    legacyTransparentThemeColor,
    newMobileThemeColor,
  );
  mobileChromeChanged = true;
} else if (!mobileChromeSource.includes(newMobileThemeColor)) {
  throw new Error("Mobile browser surface patch failed: theme-color sync was not found.");
}

if (mobileChromeChanged) {
  await writeFile(mobileChromePath, mobileChromeSource, "utf8");
}

let requestedFixesSource = await readFile(requestedFixesPath, "utf8");
let requestedFixesChanged = false;

if (requestedFixesSource.includes(forcedMobileTopDivider)) {
  requestedFixesSource = requestedFixesSource.replace(
    forcedMobileTopDivider,
    transparentMobileTopDivider,
  );
  requestedFixesChanged = true;
} else if (!requestedFixesSource.includes(transparentMobileTopDivider)) {
  // The one-pixel layer may already have been removed by a previous deployment
  // or by a later source edit. That is the desired final state, so do not make
  // an otherwise healthy build fail merely because the old patch anchor is gone.
  const alreadyHasSafeAreaRule =
    requestedFixesSource.includes("html.ruth-home-page-active body::before") &&
    requestedFixesSource.includes("height: env(safe-area-inset-top) !important;");
  if (!alreadyHasSafeAreaRule) {
    throw new Error("Mobile top divider patch failed: neither the legacy layer nor the current safe-area rule was found.");
  }
}

if (requestedFixesChanged) {
  await writeFile(requestedFixesPath, requestedFixesSource, "utf8");
}

console.log("Removed the forced mobile top divider and matched browser chrome to the cream surface.");
