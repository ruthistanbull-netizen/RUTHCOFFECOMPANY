export const ROSTA_ENTERED_KEY = "rosta_panel_hub_entered_v1";
export const RUTH_ENTERED_KEY = "rr_hub_ruth_entered_v1";
export const RR_HUB_PWA_HANDOFF_KEY = "rr_hub_pwa_handoff_v1";

let pwaStartupChecked = false;

function isStandaloneWebApp() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || navigatorWithStandalone.standalone === true;
}

export function clearRRHubWorkspaceSelection() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ROSTA_ENTERED_KEY);
    window.sessionStorage.removeItem(RUTH_ENTERED_KEY);
  } catch {}
}

export function markRRHubWorkspaceHandoff() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RR_HUB_PWA_HANDOFF_KEY, "1");
  } catch {}
}

export function prepareRRHubWorkspaceForDocument() {
  if (typeof window === "undefined" || pwaStartupChecked) return;
  pwaStartupChecked = true;

  if (!isStandaloneWebApp()) return;

  let isHubHandoff = false;
  try {
    isHubHandoff = window.sessionStorage.getItem(RR_HUB_PWA_HANDOFF_KEY) === "1";
    window.sessionStorage.removeItem(RR_HUB_PWA_HANDOFF_KEY);
  } catch {}

  // Internal document loads, reloads and browser back/forward must keep the
  // selected workspace. The PWA start URL is "/", so only a genuine root launch
  // without an explicit handoff resets the brand choice and returns to RR HUB.
  if (!isHubHandoff && window.location.pathname === "/") {
    clearRRHubWorkspaceSelection();
  }
}

export function hasRostaWorkspaceAccess() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ROSTA_ENTERED_KEY) === "1";
  } catch {
    return false;
  }
}

export function hasRuthWorkspaceAccess() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(RUTH_ENTERED_KEY) === "1";
  } catch {
    return false;
  }
}


export function navigateRostaPanelDocument(target: string | URL, options?: { replace?: boolean }) {
  if (typeof window === "undefined") return;

  let url: URL;
  try {
    url = target instanceof URL ? target : new URL(String(target), window.location.href);
  } catch {
    return;
  }

  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }

  markRRHubWorkspaceHandoff();

  if (options?.replace) window.location.replace(url.href);
  else window.location.assign(url.href);
}
