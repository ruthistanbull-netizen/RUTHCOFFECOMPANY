"use client";

import { useEffect } from "react";

const ADJUSTABLE_RING_VALUE = "Ayarlanabilir Yüzük Gövdesi";

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ");
}

function sectionLabel(section: HTMLElement) {
  return normalize(
    section.querySelector<HTMLElement>(".cr-inspector-section__header span")?.textContent || "",
  );
}

function fieldByCaption(root: ParentNode, caption: string) {
  const expected = normalize(caption);
  return [...root.querySelectorAll<HTMLLabelElement>("label.cr-field")].find((label) => {
    const value = label.querySelector<HTMLElement>(":scope > span")?.textContent || "";
    return normalize(value) === expected;
  }) || null;
}

function setNativeValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const prototype = control instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(control, value);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function classifySections(drawer: HTMLElement) {
  const body = drawer.querySelector<HTMLElement>(":scope > .cr-drawer__body");
  if (!body) return;

  body.classList.add("cr-product-editor-body--ordered");
  body.querySelectorAll<HTMLElement>(":scope > .cr-inspector-section").forEach((section) => {
    const label = sectionLabel(section);
    section.classList.toggle("cr-product-section--content", label === "icerik");
    section.classList.toggle("cr-product-section--variant", label === "varyantlar" || label === "set icerigi");
    section.classList.toggle("cr-product-section--grouping", label === "gruplama");
  });
}

function currentSizeChoice(sizeSelect: HTMLSelectElement, usageTextarea: HTMLTextAreaElement) {
  const usage = normalize(usageTextarea.value);
  if (usage.includes("ayarlanabilir yuzuk govdesi") || usage.includes("ayarlanabilir")) return "adjustable";
  if (sizeSelect.value === "necklace" || usage.includes("kolye olcu tablosu")) return "size_table";
  return "size_table";
}

function applySizeChoice(drawer: HTMLElement, value: "size_table" | "adjustable") {
  const content = [...drawer.querySelectorAll<HTMLElement>(".cr-inspector-section")]
    .find((section) => sectionLabel(section) === "icerik");
  if (!content) return;

  const sizeField = fieldByCaption(content, "Ölçü tablosu");
  const usageField = fieldByCaption(content, "Ölçü ve kullanım metni");
  const sizeSelect = sizeField?.querySelector<HTMLSelectElement>("select.cr-size-choice-native, select:not(.cr-size-choice-picker)");
  const usageTextarea = usageField?.querySelector<HTMLTextAreaElement>("textarea");
  if (!sizeSelect || !usageTextarea) return;

  if (value === "size_table") {
    setNativeValue(sizeSelect, "necklace");
    window.requestAnimationFrame(() => {
      const nextUsage = fieldByCaption(content, "Ölçü ve kullanım metni")
        ?.querySelector<HTMLTextAreaElement>("textarea");
      if (nextUsage && nextUsage.value) setNativeValue(nextUsage, "");
    });
    return;
  }

  setNativeValue(sizeSelect, "none");
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const nextUsage = fieldByCaption(content, "Ölçü ve kullanım metni")
        ?.querySelector<HTMLTextAreaElement>("textarea");
      if (nextUsage && nextUsage.value !== ADJUSTABLE_RING_VALUE) {
        setNativeValue(nextUsage, ADJUSTABLE_RING_VALUE);
      }
    });
  });
}

function enhanceSizeChoice(drawer: HTMLElement) {
  const content = [...drawer.querySelectorAll<HTMLElement>(".cr-inspector-section")]
    .find((section) => sectionLabel(section) === "icerik");
  if (!content) return;

  const sizeField = fieldByCaption(content, "Ölçü tablosu");
  const usageField = fieldByCaption(content, "Ölçü ve kullanım metni");
  const nativeSelect = sizeField?.querySelector<HTMLSelectElement>("select:not(.cr-size-choice-picker)");
  const usageTextarea = usageField?.querySelector<HTMLTextAreaElement>("textarea");
  if (!sizeField || !usageField || !nativeSelect || !usageTextarea) return;

  sizeField.classList.add("cr-size-choice-field");
  usageField.classList.add("cr-size-usage-field--hidden");
  nativeSelect.classList.add("cr-size-choice-native");

  let picker = sizeField.querySelector<HTMLSelectElement>(".cr-size-choice-picker");
  if (!picker) {
    picker = document.createElement("select");
    picker.className = "cr-size-choice-picker";
    picker.setAttribute("aria-label", "Ölçü ve kullanım seçeneği");
    picker.innerHTML = [
      '<option value="size_table">Ölçü Tablosu</option>',
      '<option value="adjustable">Ayarlanabilir Yüzük Gövdesi</option>',
    ].join("");
    picker.addEventListener("change", () => {
      applySizeChoice(drawer, picker?.value === "adjustable" ? "adjustable" : "size_table");
    });
    nativeSelect.insertAdjacentElement("afterend", picker);
  }

  const choice = currentSizeChoice(nativeSelect, usageTextarea);
  picker.value = choice;
  if (choice === "size_table" && nativeSelect.value !== "necklace") {
    applySizeChoice(drawer, "size_table");
  } else if (choice === "adjustable" && normalize(usageTextarea.value) !== normalize(ADJUSTABLE_RING_VALUE)) {
    applySizeChoice(drawer, "adjustable");
  }
}

function enhanceDrawer(drawer: HTMLElement) {
  classifySections(drawer);
  enhanceSizeChoice(drawer);
}

export function AdminProductEditorCorrections() {
  useEffect(() => {
    const enhance = (root: ParentNode = document) => {
      const drawers: HTMLElement[] = [];
      if (root instanceof HTMLElement && root.matches(".cr-drawer--product")) drawers.push(root);
      root.querySelectorAll<HTMLElement>(".cr-drawer--product").forEach((drawer) => drawers.push(drawer));
      drawers.forEach(enhanceDrawer);
    };

    enhance();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.target instanceof Element) {
          const drawer = mutation.target.closest<HTMLElement>(".cr-drawer--product");
          if (drawer) enhanceDrawer(drawer);
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) enhance(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
