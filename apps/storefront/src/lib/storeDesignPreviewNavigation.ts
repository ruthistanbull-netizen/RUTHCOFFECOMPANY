/** Preserve the current editor session on same-origin programmatic navigation. */
export function storeDesignPreviewHref(href: string, currentHref: string) {
  try {
    const current = new URL(currentHref);
    const target = new URL(href, current);
    if (current.searchParams.get("themeEditor") !== "1" || current.searchParams.get("storeDesignV2") !== "1"
      || target.origin !== current.origin) return href;
    for (const key of ["themeEditor", "storeDesignV2", "editorOrigin", "storeDesignV2Preview"]) {
      const value = current.searchParams.get(key);
      if (value) target.searchParams.set(key, value);
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return href;
  }
}
