"use client";

import { Check, ChevronDown, Truck, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

import styles from "./AdminOrderShippingSelect.module.css";

type CarrierRow = {
  code: string;
  name: string;
  detail: string;
  price: string;
  logo: string;
  cheapest: boolean;
  checked: boolean;
  radio: HTMLInputElement;
};

const ROOT_SELECTOR = '[data-order-shipping-inline-picker="true"]';
const MOUNT_SELECTOR = '[data-order-shipping-select-mount="true"]';

function clean(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isKaCarrier(name: string) {
  return /\s-\s*KA$/i.test(clean(name));
}

function isContractedCarrier(name: string, detail: string) {
  return Boolean(name) && !isKaCarrier(name) && /canlı fiyat/i.test(detail);
}

function snapshotRows(root: HTMLElement) {
  const rows: CarrierRow[] = [];
  root.querySelectorAll<HTMLLabelElement>("fieldset label").forEach((label) => {
    const radio = label.querySelector<HTMLInputElement>('input[type="radio"]');
    if (!radio) return;

    const name = clean(label.querySelector("strong")?.textContent);
    const detail = clean(label.querySelector("small")?.textContent);
    const price = clean(label.querySelector("b")?.textContent);
    const logo = label.querySelector<HTMLImageElement>("img")?.src || "";
    const cheapest = /en uygun/i.test(clean(label.querySelector("em")?.textContent));

    if (!isContractedCarrier(name, detail)) return;

    rows.push({
      code: radio.value,
      name,
      detail,
      price: price && price !== "—" ? price : "",
      logo,
      cheapest,
      checked: radio.checked,
      radio,
    });
  });
  return rows;
}

function pruneLegacyCarrierPicker() {
  document.querySelectorAll<HTMLFieldSetElement>(".ruth-modal fieldset").forEach((fieldset) => {
    if (clean(fieldset.querySelector("legend")?.textContent) !== "Kargo firması") return;

    const visibleRadios: HTMLInputElement[] = [];
    let selectedVisible = false;
    fieldset.querySelectorAll<HTMLLabelElement>("label").forEach((label) => {
      const radio = label.querySelector<HTMLInputElement>('input[type="radio"]');
      if (!radio) return;
      const name = clean(label.querySelector("strong")?.textContent);
      const detail = clean(label.querySelector("small")?.textContent);
      const visible = isContractedCarrier(name, detail);
      label.style.display = visible ? "" : "none";
      if (!visible) return;
      visibleRadios.push(radio);
      if (radio.checked) selectedVisible = true;
    });

    const fallbackRadio = visibleRadios[0];
    if (!selectedVisible && fallbackRadio && !fieldset.disabled) fallbackRadio.click();
  });
}

function polishInlinePicker(root: HTMLElement, fieldset: HTMLElement) {
  fieldset.style.display = "none";

  root.style.padding = "14px";
  root.style.border = "1px solid hsl(var(--border-subtle))";
  root.style.borderRadius = "var(--radius-card)";
  root.style.background = "hsl(var(--surface-secondary))";
  root.style.boxSizing = "border-box";

  const actionRow = root.lastElementChild instanceof HTMLElement ? root.lastElementChild : null;
  if (!actionRow) return;
  actionRow.style.justifyContent = "flex-end";

  const selectedSummary = Array.from(actionRow.children).find((node) => node instanceof HTMLSpanElement) as HTMLElement | undefined;
  if (selectedSummary) selectedSummary.style.display = "none";
}

function restoreInlinePicker(root: HTMLElement) {
  root.querySelector<HTMLElement>("fieldset")?.style.removeProperty("display");
  root.style.removeProperty("padding");
  root.style.removeProperty("border");
  root.style.removeProperty("border-radius");
  root.style.removeProperty("background");
  root.style.removeProperty("box-sizing");

  const actionRow = root.lastElementChild instanceof HTMLElement ? root.lastElementChild : null;
  if (!actionRow) return;
  actionRow.style.removeProperty("justify-content");
  Array.from(actionRow.children).forEach((node) => {
    if (node instanceof HTMLSpanElement) node.style.removeProperty("display");
  });
}

function sameRows(left: CarrierRow[], right: CarrierRow[]) {
  if (left.length !== right.length) return false;
  return left.every((row, index) => {
    const next = right[index];
    return Boolean(next)
      && row.code === next.code
      && row.name === next.name
      && row.detail === next.detail
      && row.price === next.price
      && row.logo === next.logo
      && row.cheapest === next.cheapest
      && row.checked === next.checked
      && row.radio === next.radio;
  });
}

export function AdminOrderShippingSelect() {
  const [mountTarget, setMountTarget] = useState<HTMLElement | null>(null);
  const [rows, setRows] = useState<CarrierRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let frame = 0;

    const sync = () => {
      frame = 0;
      pruneLegacyCarrierPicker();

      const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
      const fieldset = root?.querySelector<HTMLElement>("fieldset") || null;
      if (!root || !fieldset) {
        setMountTarget(null);
        setRows([]);
        setOpen(false);
        return;
      }

      let mount = root.querySelector<HTMLElement>(MOUNT_SELECTOR);
      if (!mount) {
        mount = document.createElement("div");
        mount.dataset.orderShippingSelectMount = "true";
        fieldset.insertAdjacentElement("beforebegin", mount);
      }

      const nextRows = snapshotRows(root);
      const selectedVisible = nextRows.some((row) => row.checked);
      if (nextRows.length && !selectedVisible) {
        nextRows[0].radio.click();
        nextRows[0].checked = true;
      }

      polishInlinePicker(root, fieldset);
      root.dataset.carrierSelectPolished = "true";
      setMountTarget((current) => current === mount ? current : mount);
      setRows((current) => sameRows(current, nextRows) ? current : nextRows);
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["checked", "disabled"] });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>(ROOT_SELECTOR).forEach((root) => {
        restoreInlinePicker(root);
        delete root.dataset.carrierSelectPolished;
      });
      document.querySelectorAll<HTMLElement>(MOUNT_SELECTOR).forEach((node) => node.remove());
      document.querySelectorAll<HTMLFieldSetElement>(".ruth-modal fieldset").forEach((fieldset) => {
        if (clean(fieldset.querySelector("legend")?.textContent) !== "Kargo firması") return;
        fieldset.querySelectorAll<HTMLLabelElement>("label").forEach((label) => label.style.removeProperty("display"));
      });
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const selected = useMemo(() => rows.find((row) => row.checked) || rows[0] || null, [rows]);

  if (!mountTarget || !rows.length || !selected) return null;

  const selectCarrier = (row: CarrierRow) => {
    if (!row.radio.checked) row.radio.click();
    setRows((current) => current.map((item) => ({ ...item, checked: item.code === row.code })));
    setOpen(false);
  };

  return <>
    {createPortal(
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className={styles.triggerLogo} aria-hidden="true">
          {selected.logo ? <img src={selected.logo} alt="" /> : <Truck />}
        </span>
        <span className={styles.triggerCopy}>
          <small>Kargo firması</small>
          <strong>{selected.name}</strong>
        </span>
        <span className={styles.triggerMeta}>
          {selected.cheapest ? <em>En uygun</em> : null}
          {selected.price ? <b>{selected.price}</b> : null}
        </span>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </button>,
      mountTarget,
    )}

    {open && typeof document !== "undefined" ? createPortal(
      <div className="admin-select-popup-layer" role="presentation">
        <button
          type="button"
          className="admin-select-popup-backdrop"
          aria-label="Kargo firması seçim penceresi arka planı"
          onClick={() => setOpen(false)}
        />
        <section className="admin-select-popup-card" role="dialog" aria-modal="true" aria-label="Kargo firması">
          <header className="admin-select-popup-header">
            <div><span>Seçim</span><h2>Kargo firması</h2></div>
            <button type="button" className="admin-select-popup-close" aria-label="Kapat" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
          </header>
          <div className={`admin-select-popup-options ${styles.options}`} role="listbox" aria-label="Kargo firması">
            {rows.map((row) => (
              <button
                key={row.code}
                type="button"
                role="option"
                aria-selected={row.checked}
                className={`${styles.option} ${row.checked ? styles.optionSelected : ""}`}
                onClick={() => selectCarrier(row)}
              >
                <span className={styles.optionLogo} aria-hidden="true">
                  {row.logo ? <img src={row.logo} alt="" /> : <Truck />}
                </span>
                <span className={styles.optionCopy}>
                  <strong>{row.name}</strong>
                  <small>{row.detail}</small>
                </span>
                <span className={styles.optionMeta}>
                  {row.cheapest ? <em>En uygun</em> : null}
                  {row.price ? <b>{row.price}</b> : null}
                </span>
                <span className={styles.check} aria-hidden="true">{row.checked ? <Check /> : null}</span>
              </button>
            ))}
          </div>
        </section>
      </div>,
      document.body,
    ) : null}
  </>;
}
