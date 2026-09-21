"use client";

import type { SearchDiagnostics } from "@ruth-commerce/contracts";
import * as React from "react";
import { createPortal } from "react-dom";
import { EmptyState, Skeleton } from "./data-display";

export interface SearchShellSection<Result> {
  id: string;
  title: string;
  results: Result[];
  getResultKey: (result: Result, index: number) => React.Key;
  getResultLabel?: (result: Result) => string;
  renderResult: (result: Result) => React.ReactNode;
  onResultActivate?: (result: Result) => void;
  emptyLabel?: string;
  total?: number;
}

export interface SearchShellLoadContext {
  signal: AbortSignal;
  cursor?: string;
}

export interface SearchShellLoadResult<Result> {
  sections: Array<SearchShellSection<Result>>;
  nextCursor?: string;
  diagnostics?: SearchDiagnostics;
}

export type SearchShellProvider<Result> = (
  query: string,
  context: SearchShellLoadContext,
) => Promise<SearchShellLoadResult<Result>>;

export interface SearchShellProps<Result>
  extends Omit<React.HTMLAttributes<HTMLElement>, "onChange" | "onSubmit" | "onError"> {
  query: string;
  onQueryChange: (query: string) => void;
  onSearchSubmit?: (query: string) => void;
  loadSections?: SearchShellProvider<Result>;
  sections?: Array<SearchShellSection<Result>>;
  placeholder?: string;
  label?: string;
  hint?: string;
  loading?: boolean;
  error?: string | null;
  onSearchError?: (error: Error | null) => void;
  onDiagnostics?: (diagnostics: SearchDiagnostics) => void;
  minimumQueryLength?: number;
  debounceMs?: number;
  mode?: "inline" | "popover";
  idleTitle?: string;
  idleDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  retryLabel?: string;
  loadMoreLabel?: string;
  clearLabel?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  autoFocus?: boolean;
}

type FlattenedResult<Result> = {
  section: SearchShellSection<Result>;
  result: Result;
  localIndex: number;
  optionId: string;
};

function mergeSections<Result>(
  previous: Array<SearchShellSection<Result>>,
  incoming: Array<SearchShellSection<Result>>,
): Array<SearchShellSection<Result>> {
  const previousById = new Map(previous.map((section) => [section.id, section]));
  return incoming.map((section) => {
    const current = previousById.get(section.id);
    if (!current) return section;

    const seen = new Set(current.results.map((result, index) => String(current.getResultKey(result, index))));
    const appended = section.results.filter((result, index) => {
      const key = String(section.getResultKey(result, index));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { ...section, results: [...current.results, ...appended] };
  });
}

export function SearchShell<Result>({
  query,
  onQueryChange,
  onSearchSubmit,
  loadSections,
  sections = [],
  placeholder = "Ara",
  label = "Arama",
  hint,
  loading = false,
  error = null,
  onSearchError,
  onDiagnostics,
  minimumQueryLength = 2,
  debounceMs = 250,
  mode = "inline",
  idleTitle = "Aramaya başlayın",
  idleDescription = "Sonuçları görmek için en az iki karakter yazın.",
  emptyTitle = "Sonuç bulunamadı",
  emptyDescription = "Farklı bir ifade deneyin veya filtreleri temizleyin.",
  retryLabel = "Tekrar dene",
  loadMoreLabel = "Daha fazla sonuç",
  clearLabel = "Aramayı temizle",
  leading,
  trailing,
  autoFocus = false,
  className = "",
  ...props
}: SearchShellProps<Result>) {
  const normalizedQuery = query.trim();
  const isIdle = normalizedQuery.length < minimumQueryLength;
  const inputId = React.useId();
  const resultsId = `${inputId}-results`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const optionRefs = React.useRef(new Map<number, HTMLDivElement>());
  const abortRef = React.useRef<AbortController | null>(null);
  const requestSequence = React.useRef(0);
  const [loadedSections, setLoadedSections] = React.useState<Array<SearchShellSection<Result>>>([]);
  const [internalLoading, setInternalLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [internalError, setInternalError] = React.useState<string | null>(null);
  const [nextCursor, setNextCursor] = React.useState<string | undefined>();
  const [isOpen, setIsOpen] = React.useState(mode === "inline");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

  const effectiveSections = loadSections ? loadedSections : sections;
  const effectiveLoading = loading || internalLoading;
  const effectiveError = error || internalError;
  const resultCount = effectiveSections.reduce((total, section) => total + section.results.length, 0);
  const hasSelectableResults = !effectiveLoading && !isIdle && !effectiveError && resultCount > 0;

  const flattenedResults = React.useMemo<Array<FlattenedResult<Result>>>(() => {
    let globalIndex = 0;
    return effectiveSections.flatMap((section) => section.results.map((result, localIndex) => {
      const flattened = {
        section,
        result,
        localIndex,
        optionId: `${inputId}-option-${globalIndex}`,
      };
      globalIndex += 1;
      return flattened;
    }));
  }, [effectiveSections, inputId]);

  const listboxIds = effectiveSections
    .filter((section) => section.results.length > 0)
    .map((section) => `${inputId}-${section.id}-listbox`);

  const setSearchError = React.useCallback((nextError: Error | null) => {
    setInternalError(nextError?.message ?? null);
    onSearchError?.(nextError);
  }, [onSearchError]);

  const runSearch = React.useCallback(async (options: { cursor?: string; append?: boolean } = {}) => {
    if (!loadSections || normalizedQuery.length < minimumQueryLength) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const sequence = ++requestSequence.current;
    options.append ? setLoadingMore(true) : setInternalLoading(true);
    setSearchError(null);

    try {
      const response = await loadSections(normalizedQuery, { signal: controller.signal, cursor: options.cursor });
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setLoadedSections((current) => options.append ? mergeSections(current, response.sections) : response.sections);
      setNextCursor(response.nextCursor);
      if (response.diagnostics) onDiagnostics?.(response.diagnostics);
      setIsOpen(true);
      setActiveIndex(-1);
    } catch (caught) {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
      setSearchError(caught instanceof Error ? caught : new Error("Arama yapılamadı."));
      if (!options.append) setLoadedSections([]);
    } finally {
      if (sequence === requestSequence.current) {
        setInternalLoading(false);
        setLoadingMore(false);
      }
    }
  }, [loadSections, minimumQueryLength, normalizedQuery, onDiagnostics, setSearchError]);

  React.useEffect(() => {
    if (!loadSections) return;
    if (isIdle) {
      abortRef.current?.abort();
      setLoadedSections([]);
      setNextCursor(undefined);
      setSearchError(null);
      setActiveIndex(-1);
      if (mode === "popover") setIsOpen(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch();
    }, Math.max(0, debounceMs));

    return () => window.clearTimeout(timer);
  }, [debounceMs, isIdle, loadSections, mode, runSearch, setSearchError]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  React.useEffect(() => {
    if (activeIndex >= flattenedResults.length) setActiveIndex(flattenedResults.length - 1);
  }, [activeIndex, flattenedResults.length]);

  const updateAnchorRect = React.useCallback(() => {
    if (formRef.current) setAnchorRect(formRef.current.getBoundingClientRect());
  }, []);

  React.useEffect(() => {
    if (mode !== "popover" || !isOpen) return;
    updateAnchorRect();
    window.addEventListener("resize", updateAnchorRect);
    window.addEventListener("scroll", updateAnchorRect, true);
    return () => {
      window.removeEventListener("resize", updateAnchorRect);
      window.removeEventListener("scroll", updateAnchorRect, true);
    };
  }, [isOpen, mode, updateAnchorRect]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || formRef.current?.contains(target) || overlayRef.current?.contains(target)) return;
      setIsOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  function activateResult(index: number) {
    const item = flattenedResults[index];
    if (!item) return;
    if (item.section.onResultActivate) {
      item.section.onResultActivate(item.result);
    } else {
      optionRefs.current.get(index)?.querySelector<HTMLElement>("a[href],button:not([disabled]),[role='button']")?.click();
    }
    if (mode === "popover") setIsOpen(false);
  }

  function clearSearch() {
    abortRef.current?.abort();
    requestSequence.current += 1;
    onQueryChange("");
    setLoadedSections([]);
    setNextCursor(undefined);
    setSearchError(null);
    setActiveIndex(-1);
    if (mode === "popover") setIsOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => flattenedResults.length === 0 ? -1 : (current + 1) % flattenedResults.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => flattenedResults.length === 0 ? -1 : (current <= 0 ? flattenedResults.length - 1 : current - 1));
      return;
    }
    if (event.key === "Home" && flattenedResults.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && flattenedResults.length > 0) {
      event.preventDefault();
      setActiveIndex(flattenedResults.length - 1);
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      activateResult(activeIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      abortRef.current?.abort();
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isIdle) return;
    onSearchSubmit?.(normalizedQuery);
    if (loadSections) void runSearch();
    setIsOpen(true);
  }

  const resultsContent = (
    <div
      ref={overlayRef}
      id={resultsId}
      className={`ruth-search-shell__results ${mode === "popover" ? "ruth-search-shell__results--popover" : ""}`.trim()}
      role={hasSelectableResults ? undefined : "status"}
      aria-label={hasSelectableResults ? undefined : `${label} sonuçları`}
      aria-live={hasSelectableResults ? undefined : "polite"}
      aria-busy={effectiveLoading}
      style={mode === "popover" && anchorRect ? {
        position: "fixed",
        left: Math.max(12, anchorRect.left),
        top: anchorRect.bottom + 8,
        width: Math.min(anchorRect.width, window.innerWidth - 24),
        maxHeight: Math.max(220, window.innerHeight - anchorRect.bottom - 24),
      } : undefined}
    >
      {effectiveLoading && !loadingMore ? (
        <div className="ruth-search-shell__loading" aria-label="Arama sonuçları yükleniyor">
          <Skeleton height={52} rounded />
          <Skeleton height={52} rounded />
          <Skeleton height={52} rounded />
        </div>
      ) : isIdle ? (
        <EmptyState title={idleTitle} description={idleDescription} />
      ) : effectiveError ? (
        <EmptyState
          title="Arama tamamlanamadı"
          description={effectiveError}
          action={loadSections ? <button type="button" className="ruth-search-shell__retry" onClick={() => void runSearch()}>{retryLabel}</button> : null}
        />
      ) : resultCount === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="ruth-search-shell__sections">
          {effectiveSections.map((section) => {
            let sectionStart = 0;
            for (const candidate of effectiveSections) {
              if (candidate.id === section.id) break;
              sectionStart += candidate.results.length;
            }
            const headingId = `${inputId}-${section.id}`;
            const listboxId = `${headingId}-listbox`;
            return (
              <section key={section.id} className="ruth-search-shell__section">
                <div className="ruth-search-shell__section-heading">
                  <h3 id={headingId}>{section.title}</h3>
                  <span>{section.total ?? section.results.length}</span>
                </div>
                {section.results.length > 0 ? (
                  <div className="ruth-search-shell__list" id={listboxId} role="listbox" aria-labelledby={headingId}>
                    {section.results.map((result, localIndex) => {
                      const globalIndex = sectionStart + localIndex;
                      const option = flattenedResults[globalIndex];
                      return (
                        <div
                          key={section.getResultKey(result, localIndex)}
                          ref={(node) => {
                            if (node) optionRefs.current.set(globalIndex, node);
                            else optionRefs.current.delete(globalIndex);
                          }}
                          id={option?.optionId}
                          className={`ruth-search-shell__result ${activeIndex === globalIndex ? "is-active" : ""}`.trim()}
                          role="option"
                          aria-selected={activeIndex === globalIndex}
                          aria-label={section.getResultLabel?.(result)}
                          onMouseMove={() => setActiveIndex(globalIndex)}
                          onClick={() => activateResult(globalIndex)}
                        >
                          {section.renderResult(result)}
                        </div>
                      );
                    })}
                  </div>
                ) : section.emptyLabel ? (
                  <p className="ruth-search-shell__section-empty">{section.emptyLabel}</p>
                ) : null}
              </section>
            );
          })}
          {loadSections && nextCursor ? (
            <button
              type="button"
              className="ruth-search-shell__load-more"
              disabled={loadingMore}
              onClick={() => void runSearch({ cursor: nextCursor, append: true })}
            >
              {loadingMore ? "Yükleniyor…" : loadMoreLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );

  const shouldRenderResults = mode === "inline" || (isOpen && !isIdle);
  const controlledIds = hasSelectableResults && listboxIds.length > 0 ? listboxIds.join(" ") : resultsId;

  return (
    <section className={`ruth-search-shell ruth-search-shell--${mode} ${className}`.trim()} aria-label={label} {...props}>
      <form ref={formRef} className="ruth-search-shell__form" role="search" onSubmit={submit}>
        {leading ? <div className="ruth-search-shell__leading" aria-hidden="true">{leading}</div> : null}
        <div className="ruth-search-shell__field">
          <label htmlFor={inputId}>{label}</label>
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            role="combobox"
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setActiveIndex(-1);
              if (mode === "popover") setIsOpen(true);
            }}
            onFocus={() => {
              if (!isIdle) setIsOpen(true);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            aria-describedby={hintId}
            aria-autocomplete="list"
            aria-controls={controlledIds}
            aria-expanded={shouldRenderResults && hasSelectableResults}
            aria-activedescendant={activeIndex >= 0 ? flattenedResults[activeIndex]?.optionId : undefined}
            autoComplete="off"
            autoFocus={autoFocus}
          />
          {query ? (
            <button
              type="button"
              className="ruth-search-shell__clear"
              onClick={clearSearch}
              aria-label={clearLabel}
            >
              <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {hint ? <p id={hintId}>{hint}</p> : null}
        </div>
        {trailing ? <div className="ruth-search-shell__trailing">{trailing}</div> : null}
      </form>

      {shouldRenderResults ? (
        mode === "popover" && typeof document !== "undefined"
          ? createPortal(resultsContent, document.body)
          : resultsContent
      ) : null}
    </section>
  );
}
