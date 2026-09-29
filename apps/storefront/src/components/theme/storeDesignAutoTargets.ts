export const STORE_DESIGN_TARGET_SELECTOR = "[data-editor-id][data-editor-type]";

const AUTO_CANDIDATE_SELECTOR = [
  "a[href]",
  "button",
  "img",
  "video",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "[data-store-design-editable-text=\"true\"]",
].join(",");

function autoKind(element: Element) {
  if (element instanceof HTMLAnchorElement) return { type: "link-element", kind: "link" };
  if (element instanceof HTMLButtonElement) return { type: "button-element", kind: "button" };
  if (element instanceof HTMLImageElement) return { type: "image-element", kind: "image" };
  if (element instanceof HTMLVideoElement) return { type: "video-element", kind: "video" };
  return { type: "text-element", kind: "text" };
}

function autoLabel(element: Element, fallback: string) {
  if (element instanceof HTMLImageElement) return element.alt?.trim() || "Görsel";
  if (element instanceof HTMLVideoElement) return element.getAttribute("aria-label")?.trim() || "Video";
  const label = element.getAttribute("aria-label")?.trim()
    || element.textContent?.replace(/\s+/g, " ").trim()
    || fallback;
  return label.slice(0, 80);
}

function editableCandidate(element: Element | null) {
  if (!element) return null;
  const candidate = element.closest<HTMLElement>(AUTO_CANDIDATE_SELECTOR);
  if (!candidate) return null;
  if (candidate.matches(STORE_DESIGN_TARGET_SELECTOR)) return candidate;
  if (candidate.closest('[data-theme-editor-ignore="true"]')) return null;
  return candidate;
}

function candidatesInside(parent: HTMLElement) {
  return Array.from(parent.querySelectorAll<HTMLElement>(AUTO_CANDIDATE_SELECTOR))
    .filter((candidate) => {
      if (candidate.closest('[data-theme-editor-ignore="true"]')) return false;
      const semanticParent = candidate.parentElement?.closest<HTMLElement>(STORE_DESIGN_TARGET_SELECTOR);
      if (semanticParent !== parent) return false;
      if (candidate.matches(STORE_DESIGN_TARGET_SELECTOR) && candidate.dataset.storeDesignAutoTarget !== "true") return false;
      return true;
    });
}

function decorateParent(parent: HTMLElement) {
  const parentId = parent.dataset.editorId?.trim();
  if (!parentId) return;

  const counters = new Map<string, number>();
  for (const candidate of candidatesInside(parent)) {
    const { type, kind } = autoKind(candidate);
    const index = counters.get(kind) || 0;
    counters.set(kind, index + 1);
    candidate.dataset.editorId = `${parentId}::auto:${kind}:${index}`;
    candidate.dataset.editorType = type;
    candidate.dataset.editorLabel = autoLabel(candidate, type);
    candidate.dataset.editorInstance = `auto:${kind}:${index}`;
    candidate.dataset.storeDesignAutoTarget = "true";
    if (type === "text-element" || type === "link-element" || type === "button-element") {
      candidate.dataset.storeDesignEditableText = "true";
    }
  }
}

export function ensureStoreDesignAutoTarget(element: Element | null) {
  const candidate = editableCandidate(element);
  if (!candidate) return null;
  if (candidate.matches(STORE_DESIGN_TARGET_SELECTOR) && candidate.dataset.storeDesignAutoTarget !== "true") return candidate;

  const parent = candidate.parentElement?.closest<HTMLElement>(STORE_DESIGN_TARGET_SELECTOR);
  if (!parent) return candidate.matches(STORE_DESIGN_TARGET_SELECTOR) ? candidate : null;
  decorateParent(parent);
  return candidate.matches(STORE_DESIGN_TARGET_SELECTOR) ? candidate : null;
}

export function decorateStoreDesignAutoTargets(root: ParentNode = document) {
  const parents = Array.from(root.querySelectorAll<HTMLElement>(STORE_DESIGN_TARGET_SELECTOR))
    .filter((parent) => parent.dataset.storeDesignAutoTarget !== "true");
  for (const parent of parents) decorateParent(parent);
}
