"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useOverlayBehavior } from "./overlays";
import { Pressable } from "./pressable";

export type PickerOption = {
  value: string;
  label: React.ReactNode;
  textValue?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  group?: string;
};

export interface PickerProps {
  value: string;
  options: PickerOption[];
  onValueChange: (value: string) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
  "aria-describedby"?: string;
  optionListLabel?: string;
}

function optionText(option: PickerOption | undefined) {
  if (!option) return "";
  if (option.textValue) return option.textValue;
  return typeof option.label === "string" || typeof option.label === "number" ? String(option.label) : option.value;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

export function Picker({
  value,
  options,
  onValueChange,
  label,
  placeholder = "Seçim yap",
  disabled = false,
  className = "",
  name,
  id,
  "aria-describedby": ariaDescribedBy,
  optionListLabel,
}: PickerProps) {
  const [open, setOpen] = React.useState(false);
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const close = React.useCallback(() => setOpen(false), []);
  const selected = React.useMemo(() => options.find((option) => option.value === value), [options, value]);
  const enabledIndexes = React.useMemo(
    () => options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0),
    [options],
  );

  const overlay = useOverlayBehavior({
    active: open,
    onClose: close,
    dismissalPolicy: "light-dismiss",
  });
  const setDialogNode = React.useCallback((node: HTMLElement | null) => {
    dialogRef.current = node;
    overlay.containerRef(node);
  }, [overlay.containerRef]);

  React.useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const openPicker = React.useCallback(() => {
    if (disabled) return;
    setOpen(true);
  }, [disabled]);

  const focusOption = React.useCallback((index: number) => {
    const node = dialogRef.current?.querySelector<HTMLButtonElement>(`[data-ruth-picker-option-index="${index}"]`);
    node?.focus({ preventScroll: true });
  }, []);

  const moveOptionFocus = React.useCallback((direction: 1 | -1) => {
    if (!enabledIndexes.length || typeof document === "undefined") return;
    const active = document.activeElement instanceof HTMLElement
      ? Number(document.activeElement.dataset.ruthPickerOptionIndex ?? -1)
      : -1;
    const currentPosition = enabledIndexes.indexOf(active);
    const fallback = direction > 0 ? 0 : enabledIndexes.length - 1;
    const nextPosition = currentPosition < 0
      ? fallback
      : (currentPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    focusOption(enabledIndexes[nextPosition]);
  }, [enabledIndexes, focusOption]);

  const popup = open && typeof document !== "undefined" ? createPortal(
    <div
      className="ruth-picker-layer"
      role="presentation"
      data-dismissal-policy={overlay.dismissalPolicy}
    >
      <button
        type="button"
        className="ruth-picker-backdrop"
        aria-label={`${label} seçim penceresini kapat`}
        onClick={overlay.onBackdropClick}
      />
      <section
        ref={setDialogNode}
        className="ruth-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-dismissal-policy={overlay.dismissalPolicy}
        tabIndex={-1}
      >
        <header className="ruth-picker-header">
          <div>
            <span>Seçim</span>
            <h2>{label}</h2>
          </div>
          <Pressable
            type="button"
            className="ruth-picker-close"
            aria-label="Kapat"
            pressStrength="icon"
            onClick={close}
          >
            <CloseIcon />
          </Pressable>
        </header>
        <div
          className="ruth-picker-options"
          role="listbox"
          aria-label={optionListLabel || label}
          data-many-options={options.length > 8 ? "true" : "false"}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveOptionFocus(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveOptionFocus(-1);
            } else if (event.key === "Home" && enabledIndexes.length) {
              event.preventDefault();
              focusOption(enabledIndexes[0]);
            } else if (event.key === "End" && enabledIndexes.length) {
              event.preventDefault();
              focusOption(enabledIndexes[enabledIndexes.length - 1]);
            }
          }}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={`${option.value}:${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`ruth-picker-option ${isSelected ? "is-selected" : ""}`}
                data-ruth-picker-option-index={index}
                data-autofocus={isSelected && !option.disabled ? "true" : undefined}
                pressStrength="subtle"
                onClick={() => {
                  if (option.disabled) return;
                  onValueChange(option.value);
                  close();
                }}
              >
                <span className="ruth-picker-option-copy">
                  <strong>{option.label}</strong>
                  {option.description || option.group ? <small>{option.description || option.group}</small> : null}
                </span>
                <span className="ruth-picker-check" aria-hidden="true">{isSelected ? "✓" : ""}</span>
              </Pressable>
            );
          })}
        </div>
      </section>
    </div>,
    document.body,
  ) : null;

  const selectedText = selected ? optionText(selected) : value || placeholder;

  return (
    <>
      <Pressable
        id={id}
        type="button"
        disabled={disabled}
        className={`ruth-picker-trigger ${className}`.trim()}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${selectedText}`}
        aria-describedby={ariaDescribedBy}
        pressStrength="subtle"
        onClick={openPicker}
        onKeyDown={(event) => {
          if (disabled || open) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openPicker();
          }
        }}
      >
        <span className={`ruth-picker-trigger-value ${selected ? "" : "is-placeholder"}`.trim()}>{selected?.label ?? (value || placeholder)}</span>
        <span className="ruth-picker-trigger-chevron"><ChevronIcon /></span>
      </Pressable>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {popup}
    </>
  );
}
