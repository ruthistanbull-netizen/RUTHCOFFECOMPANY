"use client";

import { ArrowLeft, Boxes, PackagePlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { SaveLifecycleProvider, useSaveLifecycle } from "@ruth-commerce/ui";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { ExactProducts } from "./ExactProducts";
import { ExactProductStudioWorkspace } from "./ExactProductStudioWorkspace";
import { ProductDiscountSummary } from "./ProductDiscountSummary";
import { ExactWorkspaceModal } from "./ExactWorkspaceModal";
import { ExactButton, ExactFormModal, ExactSearchInput } from "./primitives";

const LEGACY_PRODUCT_CREATED_MESSAGE = "Ürün oluşturuldu ve düzenleme modunda açık bırakıldı.";
type ProductRoute = { id: string; type: "single" | "bundle" };
type CatalogRelationPopupState = { field: HTMLElement; title: string } | null;

function selectedCatalogButtons(options: HTMLElement) {
  return Array.from(options.querySelectorAll<HTMLButtonElement>("button")).filter((button) => button.classList.contains("bg-accent"));
}

function syncCatalogRelationField(field: HTMLElement) {
  const options = field.querySelector<HTMLElement>("[data-catalog-relation-options]");
  const trigger = field.querySelector<HTMLButtonElement>("[data-catalog-relation-trigger]");
  if (!options || !trigger) return;

  const selected = selectedCatalogButtons(options);
  const value = trigger.querySelector<HTMLElement>("[data-catalog-relation-value]");
  if (!value) return;

  const nextText = selected.length === 0
    ? "Seçim yap"
    : selected.length === 1
      ? selected[0]?.textContent?.trim() || "1 seçili"
      : `${selected.length} seçili`;
  if (value.textContent !== nextText) value.textContent = nextText;
  trigger.dataset.hasSelection = selected.length ? "true" : "false";
}

function enhanceCatalogRelations(
  scope: ParentNode,
  openPopup: (field: HTMLElement, title: string) => void,
) {
  scope
    .querySelectorAll<HTMLElement>('[data-exact-base44-page="product-studio"] p.ruth-type-label')
    .forEach((label) => {
      const title = label.textContent?.trim() || "";
      if (title !== "Koleksiyonlar" && title !== "Kategoriler") return;

      const field = label.parentElement as HTMLElement | null;
      const options = label.nextElementSibling as HTMLElement | null;
      if (!field || !options || !options.querySelector("button")) return;

      if (field.dataset.catalogRelationEnhanced !== "true") {
        field.dataset.catalogRelationEnhanced = "true";
        options.dataset.catalogRelationOptions = "true";
        options.style.display = "none";
        options.setAttribute("aria-hidden", "true");

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.dataset.catalogRelationTrigger = "true";
        trigger.className = "exact-catalog-relation-trigger";
        trigger.setAttribute("aria-haspopup", "dialog");

        const value = document.createElement("span");
        value.dataset.catalogRelationValue = "true";
        value.className = "exact-catalog-relation-value";
        value.textContent = "Seçim yap";

        const chevron = document.createElement("span");
        chevron.className = "exact-catalog-relation-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = "⌄";
        trigger.append(value, chevron);
        trigger.addEventListener("click", () => openPopup(field, title));
        field.insertBefore(trigger, options);
      }

      syncCatalogRelationField(field);
    });
}

function normalizeProductUi(
  scope: ParentNode = document,
  openPopup?: (field: HTMLElement, title: string) => void,
) {
  document.querySelectorAll<HTMLElement>(".z-toast span.flex-1").forEach((node) => {
    if (node.textContent?.trim() === LEGACY_PRODUCT_CREATED_MESSAGE) {
      node.textContent = "Ürün oluşturuldu.";
    }
  });

  scope
    .querySelectorAll<HTMLLabelElement>('[data-exact-base44-page="product-studio"] label')
    .forEach((label) => {
      if (label.textContent?.trim() !== "Karşılaştırma fiyatı") return;
      const field = label.parentElement as HTMLElement | null;
      if (!field) return;
      field.hidden = true;
      field.setAttribute("aria-hidden", "true");
      field.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
        input.disabled = true;
        input.tabIndex = -1;
      });
    });

  if (openPopup) enhanceCatalogRelations(scope, openPopup);
}

function ProductPopupSearchBridge() {
  const [value, setValue] = useState("");

  const mirrorSearch = useCallback((next: string) => {
    setValue(next);
    const input = document.querySelector<HTMLInputElement>(
      '[data-workspace-kind="product"] [data-exact-base44-page="product-studio"] input[placeholder="Düzenlenecek ürünü ara..."]',
    );
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, []);

  return (
    <ExactSearchInput
      value={value}
      onChange={mirrorSearch}
      placeholder="Düzenlenecek ürünü ara..."
    />
  );
}

function ExactProductsPopupHostContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { requestTransition, transitionPending } = useSaveLifecycle();
  const routeOpen = searchParams.get("productModal") === "1";
  const routeType = searchParams.get("type") === "bundle" ? "bundle" : "single";
  const routeId = searchParams.get("id") || "";
  const [workspaceSession, setWorkspaceSession] = useState(0);
  const [presentedOpen, setPresentedOpen] = useState(routeOpen);
  const [presentedRoute, setPresentedRoute] = useState<ProductRoute>({ id: routeId, type: routeType });
  const [catalogRelationPopup, setCatalogRelationPopup] = useState<CatalogRelationPopupState>(null);
  const [catalogRelationRevision, setCatalogRelationRevision] = useState(0);
  const acceptedRouteRef = useRef<ProductRoute>({ id: routeId, type: routeType });
  const internalClosingRef = useRef(false);
  const routeExitDecisionRef = useRef(false);
  const routeChangeDecisionRef = useRef<string | null>(null);

  const openCatalogRelationPopup = useCallback((field: HTMLElement, title: string) => {
    setCatalogRelationRevision((current) => current + 1);
    setCatalogRelationPopup({ field, title });
  }, []);

  const closeCatalogRelationPopup = useCallback(() => {
    setCatalogRelationPopup(null);
  }, []);

  useEffect(() => {
    if (!catalogRelationPopup) return;
    if (!catalogRelationPopup.field.isConnected) closeCatalogRelationPopup();
  }, [catalogRelationPopup, closeCatalogRelationPopup, presentedRoute.id, presentedRoute.type]);

  useEffect(() => {
    if (!presentedOpen) {
      closeCatalogRelationPopup();
      return;
    }

    let observer: MutationObserver | null = null;
    let findFrame = 0;
    let syncFrame = 0;
    let attempts = 0;
    let modal: HTMLElement | null = null;

    const scheduleNormalize = () => {
      if (syncFrame || !modal) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        if (modal?.isConnected) normalizeProductUi(modal, openCatalogRelationPopup);
      });
    };

    const attach = () => {
      findFrame = 0;
      modal = document.querySelector<HTMLElement>(
        '[data-exact-workspace-modal][data-workspace-kind="product"]',
      );
      if (!modal) {
        attempts += 1;
        if (attempts < 90) findFrame = window.requestAnimationFrame(attach);
        return;
      }

      normalizeProductUi(modal, openCatalogRelationPopup);
      observer = new MutationObserver(scheduleNormalize);
      observer.observe(modal, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    };

    findFrame = window.requestAnimationFrame(attach);
    return () => {
      observer?.disconnect();
      closeCatalogRelationPopup();
      if (findFrame) window.cancelAnimationFrame(findFrame);
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
    };
  }, [closeCatalogRelationPopup, openCatalogRelationPopup, presentedOpen, presentedRoute.id, presentedRoute.type]);

  const productUrl = useCallback((params: URLSearchParams) => {
    const query = params.toString();
    return query ? `/products?${query}` : "/products";
  }, []);

  const replaceProductLocation = useCallback((params: URLSearchParams) => {
    router.replace(productUrl(params), { scroll: false });
  }, [productUrl, router]);

  const setAcceptedRoute = useCallback((next: ProductRoute) => {
    acceptedRouteRef.current = next;
    setPresentedRoute(next);
  }, []);

  const navigateProductDirect = useCallback((productId: string, productType: "single" | "bundle") => {
    closeCatalogRelationPopup();
    const next = { id: productId, type: productType } satisfies ProductRoute;
    setAcceptedRoute(next);
    setPresentedOpen(true);

    const params = new URLSearchParams(searchParams.toString());
    params.set("productModal", "1");
    if (productId) params.set("id", productId);
    else params.delete("id");
    params.set("type", productType);

    const currentId = searchParams.get("id") || "";
    const currentType = searchParams.get("type") === "bundle" ? "bundle" : "single";
    if (routeOpen && currentId === productId && currentType === productType) return;
    replaceProductLocation(params);
  }, [closeCatalogRelationPopup, replaceProductLocation, routeOpen, searchParams, setAcceptedRoute]);

  const navigateProduct = useCallback((productId: string, productType: "single" | "bundle") => {
    const accepted = acceptedRouteRef.current;
    if (accepted.id === productId && accepted.type === productType) return;
    void requestTransition(() => navigateProductDirect(productId, productType));
  }, [navigateProductDirect, requestTransition]);

  const commitClose = useCallback(() => {
    closeCatalogRelationPopup();
    internalClosingRef.current = true;
    setPresentedOpen(false);
    setWorkspaceSession((current) => current + 1);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("productModal");
    params.delete("id");
    params.delete("type");
    router.replace(productUrl(params), { scroll: false });
  }, [closeCatalogRelationPopup, productUrl, router, searchParams]);

  const restoreAcceptedRoute = useCallback(() => {
    const accepted = acceptedRouteRef.current;
    navigateProductDirect(accepted.id, accepted.type);
  }, [navigateProductDirect]);

  useEffect(() => {
    if (routeOpen) {
      const next = { id: routeId, type: routeType } satisfies ProductRoute;
      const accepted = acceptedRouteRef.current;
      const routeKey = `${next.id}:${next.type}`;
      const acceptedKey = `${accepted.id}:${accepted.type}`;

      if (!presentedOpen) {
        if (!internalClosingRef.current) {
          setAcceptedRoute(next);
          setPresentedOpen(true);
        }
        return;
      }
      if (routeKey === acceptedKey || routeChangeDecisionRef.current === routeKey) return;

      routeChangeDecisionRef.current = routeKey;
      void requestTransition(() => setAcceptedRoute(next)).then((continued) => {
        routeChangeDecisionRef.current = null;
        if (!continued) restoreAcceptedRoute();
      });
      return;
    }

    routeChangeDecisionRef.current = null;
    if (internalClosingRef.current) {
      internalClosingRef.current = false;
      routeExitDecisionRef.current = false;
      return;
    }
    if (!presentedOpen || routeExitDecisionRef.current) return;

    routeExitDecisionRef.current = true;
    void requestTransition(() => {
      setPresentedOpen(false);
      setWorkspaceSession((current) => current + 1);
    }).then((continued) => {
      routeExitDecisionRef.current = false;
      if (!continued) restoreAcceptedRoute();
    });
  }, [presentedOpen, requestTransition, restoreAcceptedRoute, routeId, routeOpen, routeType, setAcceptedRoute]);

  const close = useCallback(() => {
    void requestTransition(commitClose);
  }, [commitClose, requestTransition]);

  const openCreate = useCallback((nextType: "single" | "bundle") => {
    void requestTransition(() => {
      setWorkspaceSession((current) => current + 1);
      navigateProductDirect("", nextType);
    });
  }, [navigateProductDirect, requestTransition]);

  const handleSaved = useCallback((productId: string) => {
    window.setTimeout(() => normalizeProductUi(document, openCatalogRelationPopup), 0);
    if (!productId) return;

    if (!presentedRoute.id) {
      if (!transitionPending) commitClose();
      return;
    }

    if (productId === presentedRoute.id) return;
    navigateProductDirect(productId, presentedRoute.type);
  }, [commitClose, navigateProductDirect, openCatalogRelationPopup, presentedRoute.id, presentedRoute.type, transitionPending]);

  const intercept = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const link = target.closest("a");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("/products/studio")) return;
    event.preventDefault();
    event.stopPropagation();

    const url = new URL(href, window.location.origin);
    const nextId = url.searchParams.get("id") || "";
    const nextType = url.searchParams.get("type") === "bundle" ? "bundle" : "single";
    void requestTransition(() => {
      if (!nextId) setWorkspaceSession((current) => current + 1);
      navigateProductDirect(nextId, nextType);
    });
  };

  const headerActions = (
    <>
      <ExactButton variant="secondary" size="sm" onClick={close}>
        <ArrowLeft className="h-4 w-4" /> Ürünlere dön
      </ExactButton>
      <ExactButton size="sm" onClick={() => openCreate("single")}>
        <PackagePlus className="h-4 w-4" /> Yeni Ürün
      </ExactButton>
      <ExactButton variant="secondary" size="sm" onClick={() => openCreate("bundle")}>
        <Boxes className="h-4 w-4" /> Paket ürün
      </ExactButton>
    </>
  );

  const relationSource = catalogRelationPopup?.field.querySelector<HTMLElement>("[data-catalog-relation-options]") || null;
  const relationOptions = relationSource
    ? Array.from(relationSource.querySelectorAll<HTMLButtonElement>("button"))
    : [];
  void catalogRelationRevision;

  return (
    <div onClickCapture={intercept}>
      <style jsx global>{`
        .z-toast {
          z-index: 2147483647 !important;
        }
        .exact-catalog-relation-trigger {
          display: flex;
          width: 100%;
          min-height: 44px;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid hsl(var(--border-subtle));
          border-radius: var(--radius-small);
          background: hsl(var(--surface-secondary));
          padding: 0 12px;
          color: hsl(var(--text-muted));
          text-align: left;
          transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
        }
        .exact-catalog-relation-trigger:hover,
        .exact-catalog-relation-trigger:focus-visible {
          border-color: hsl(var(--border-strong));
          color: hsl(var(--text-main));
          outline: none;
        }
        .exact-catalog-relation-trigger[data-has-selection="true"] {
          color: hsl(var(--text-main));
        }
        .exact-catalog-relation-value {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 600;
        }
        .exact-catalog-relation-chevron {
          flex: none;
          color: hsl(var(--text-subtle));
          font-size: 18px;
          line-height: 1;
          transform: translateY(-1px);
        }
        .exact-catalog-relation-options {
          display: grid;
          max-height: min(52dvh, 440px);
          gap: 8px;
          overflow-y: auto;
          overscroll-behavior: contain;
        }
      `}</style>
      <ExactProducts />
      <ExactWorkspaceModal
        open={presentedOpen}
        onClose={close}
        title={presentedRoute.id ? "Ürün Düzenleme" : presentedRoute.type === "bundle" ? "Paket Ürün Oluştur" : "Ürün Oluştur"}
        kind="product"
        headerActions={headerActions}
        toolbarSearch={<ProductPopupSearchBridge />}
      >
        {presentedRoute.id ? <ProductDiscountSummary productId={presentedRoute.id} /> : null}
        <ExactProductStudioWorkspace
          key={`${workspaceSession}:${presentedRoute.type}:${presentedRoute.id}`}
          productId={presentedRoute.id}
          productType={presentedRoute.type}
          onSaved={handleSaved}
          onSelectProduct={navigateProduct}
        />
      </ExactWorkspaceModal>

      <ExactFormModal
        open={Boolean(catalogRelationPopup && relationSource)}
        onClose={closeCatalogRelationPopup}
        title={catalogRelationPopup?.title || "Katalog seçimi"}
        subtitle="Birden fazla seçim yapabilirsin"
        size="sm"
        dismissalPolicy="light-dismiss"
        footer={<ExactButton className="w-full sm:w-auto" onClick={closeCatalogRelationPopup}>Bitti</ExactButton>}
      >
        <div
          className="exact-catalog-relation-options"
          role="listbox"
          aria-multiselectable="true"
          aria-label={catalogRelationPopup?.title || "Katalog seçimi"}
        >
          {relationOptions.map((source, index) => {
            const selected = source.classList.contains("bg-accent");
            return (
              <button
                key={`${source.textContent || "option"}:${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                className={`admin-select-popup-option ${selected ? "is-selected" : ""}`}
                onClick={() => {
                  source.click();
                  window.requestAnimationFrame(() => {
                    if (catalogRelationPopup?.field.isConnected) syncCatalogRelationField(catalogRelationPopup.field);
                    setCatalogRelationRevision((current) => current + 1);
                  });
                }}
              >
                <span className="admin-select-popup-option-copy">
                  <strong>{source.textContent?.trim() || `Seçenek ${index + 1}`}</strong>
                </span>
                <span className="admin-select-popup-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </ExactFormModal>
    </div>
  );
}

export function ExactProductsPopupHost() {
  return (
    <SaveLifecycleProvider>
      <ExactProductsPopupHostContent />
    </SaveLifecycleProvider>
  );
}
