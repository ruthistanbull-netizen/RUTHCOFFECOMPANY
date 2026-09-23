"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, useOverlayBehavior } from "@ruth-commerce/ui";

type SelectOption = {
  value: string;
  label: string;
  disabled: boolean;
};

type SelectSnapshot = {
  element: HTMLSelectElement;
  label: string;
  value: string;
  options: SelectOption[];
};

function readableLabel(select: HTMLSelectElement) {
  const aria = select.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  const id = select.id;
  const explicit = id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`) : null;
  if (explicit?.textContent?.trim()) return explicit.textContent.trim();
  const wrapping = select.closest("label");
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim().replace(select.textContent || "", "").trim() || "Seçenek";
  const field = select.closest<HTMLElement>("[data-exact-field], .space-y-1, .space-y-1\\.5");
  const fieldLabel = field?.querySelector<HTMLElement>("label, .ruth-type-label")?.textContent?.trim();
  return fieldLabel || select.name || "Seçenek";
}

function snapshot(select: HTMLSelectElement): SelectSnapshot {
  return {
    element: select,
    label: readableLabel(select),
    value: select.value,
    options: Array.from(select.options).map((option) => ({
      value: option.value,
      label: option.textContent?.trim() || option.label || option.value,
      disabled: option.disabled,
    })),
  };
}

function setNativeSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function AdminNativeSelectPickerBridge() {
  const [active, setActive] = useState<SelectSnapshot | null>(null);
  const activeRef = useRef<SelectSnapshot | null>(null);
  const close = useCallback(() => {
    const previous = activeRef.current?.element;
    activeRef.current = null;
    setActive(null);
    window.requestAnimationFrame(() => previous?.focus({ preventScroll: true }));
  }, []);
  const overlay = useOverlayBehavior({ active: Boolean(active), onClose: close, dismissalPolicy: "light-dismiss" });

  const open = useCallback((select: HTMLSelectElement) => {
    if (select.disabled || select.multiple || select.size > 1) return;
    const next = snapshot(select);
    activeRef.current = next;
    setActive(next);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const select = target.closest<HTMLSelectElement>("select");
      if (!select || select.disabled || select.multiple || select.size > 1) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open(select);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const select = target.closest<HTMLSelectElement>("select");
      if (!select || select.disabled || select.multiple || select.size > 1) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open(select);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      if (event.target.disabled || event.target.multiple || event.target.size > 1) return;
      if (!["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open(event.target);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!active) return;
    const element = active.element;
    if (!element.isConnected) close();
  }, [active, close]);

  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <div className="ruth-picker-layer" role="presentation" data-admin-native-select-picker="true">
      <button
        type="button"
        className="ruth-picker-backdrop"
        aria-label={`${active.label} seçim penceresini kapat`}
        onClick={overlay.onBackdropClick}
      />
      <section
        ref={overlay.containerRef}
        className="ruth-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={active.label}
        tabIndex={-1}
      >
        <header className="ruth-picker-header">
          <div>
            <span>Seçim</span>
            <h2>{active.label}</h2>
          </div>
          <Pressable type="button" className="ruth-picker-close" aria-label="Kapat" pressStrength="icon" onClick={close}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" /></svg>
          </Pressable>
        </header>
        <div className="ruth-picker-options" role="listbox" aria-label={active.label} data-many-options={active.options.length > 8 ? "true" : "false"}>
          {active.options.map((option, index) => {
            const selected = option.value === active.value;
            return (
              <Pressable
                key={`${option.value}:${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                data-autofocus={selected && !option.disabled ? "true" : undefined}
                className={`ruth-picker-option ${selected ? "is-selected" : ""}`}
                pressStrength="subtle"
                onClick={() => {
                  if (option.disabled || !active.element.isConnected) return;
                  setNativeSelectValue(active.element, option.value);
                  close();
                }}
              >
                <span className="ruth-picker-option-copy"><strong>{option.label}</strong></span>
                <span className="ruth-picker-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              </Pressable>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  );
}
