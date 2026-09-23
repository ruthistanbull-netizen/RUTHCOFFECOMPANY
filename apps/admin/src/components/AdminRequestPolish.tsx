"use client";

import { useEffect, useRef } from "react";

const ORDER_IMAGE_SELECTOR = [
  ".cr-order-detail-content .cr-image-button",
  ".cr-preparation-list .cr-image-button",
].join(",");
const VARIANT_LIST_SELECTOR = ".cr-drawer--product .cr-variant-list";
const HOVER_DELAY_MS = 2_000;

const CARE_PRESETS = [
  {
    value: "general",
    label: "Genel bakım önerisi",
    text: "Parfüm, su ve kimyasal temasından kaçının. Kullanmadığınızda kutusunda saklayın.",
  },
  {
    value: "silver",
    label: "925 ayar gümüş",
    text: "Parfüm, krem, deniz ve havuz suyuyla doğrudan temastan kaçının. Kararma oluştuğunda yumuşak bir gümüş parlatma beziyle nazikçe temizleyin ve kuru kutusunda saklayın.",
  },
  {
    value: "plated",
    label: "Altın kaplama / pirinç",
    text: "Kaplamanın ömrünü korumak için su, parfüm, krem ve kimyasallarla temastan kaçının. Kullanım sonrasında kuru ve yumuşak bir bezle silip ayrı kutusunda saklayın.",
  },
  {
    value: "steel",
    label: "Çelik",
    text: "Ürünü parfüm ve yoğun kimyasal temasından koruyun. Kullanım sonrasında yumuşak bir bezle kurulayın; çizilmeyi önlemek için diğer takılardan ayrı saklayın.",
  },
] as const;

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type PreviewData = {
  image: string;
  title: string;
  variants: string[];
  quantity: string;
};

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ");
}

function matchingElements(root: ParentNode, selector: string) {
  const matches: Element[] = [];
  if (root instanceof Element && root.matches(selector)) matches.push(root);
  root.querySelectorAll(selector).forEach((element) => matches.push(element));
  return matches;
}

function setControlValue(control: FormControl, value: string) {
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

function controlByLabel(row: HTMLElement, label: string) {
  const normalizedLabel = normalize(label);
  const field = [...row.querySelectorAll<HTMLElement>(".cr-field")].find((item) => {
    const caption = item.querySelector(":scope > span")?.textContent || "";
    return normalize(caption) === normalizedLabel;
  });
  return field?.querySelector<FormControl>("input, select, textarea") || null;
}

function selectedVariantRows(list: HTMLElement) {
  return [...list.querySelectorAll<HTMLElement>(":scope > article")].filter((row) => {
    return row.querySelector<HTMLInputElement>(".cr-variant-bulk-select input")?.checked;
  });
}

function updateBulkToolbar(list: HTMLElement) {
  const toolbar = list.previousElementSibling;
  if (!(toolbar instanceof HTMLElement) || !toolbar.classList.contains("cr-variant-bulk-toolbar")) return;

  const rows = [...list.querySelectorAll<HTMLElement>(":scope > article")];
  const selected = selectedVariantRows(list);
  const count = toolbar.querySelector<HTMLElement>("[data-variant-selected-count]");
  const selectAll = toolbar.querySelector<HTMLInputElement>("[data-variant-select-all]");
  const actions = toolbar.querySelectorAll<HTMLButtonElement>("[data-variant-bulk-action]");

  if (count) count.textContent = `${selected.length} varyant seçili`;
  if (selectAll) {
    selectAll.checked = rows.length > 0 && selected.length === rows.length;
    selectAll.indeterminate = selected.length > 0 && selected.length < rows.length;
  }
  actions.forEach((button) => {
    button.disabled = selected.length === 0;
  });

  rows.forEach((row) => {
    const checked = row.querySelector<HTMLInputElement>(".cr-variant-bulk-select input")?.checked;
    row.classList.toggle("is-bulk-selected", Boolean(checked));
  });
}

function addVariantSelectors(list: HTMLElement) {
  [...list.querySelectorAll<HTMLElement>(":scope > article")].forEach((row, index) => {
    if (row.dataset.variantBulkReady === "true") return;
    row.dataset.variantBulkReady = "true";

    const label = document.createElement("label");
    label.className = "cr-variant-bulk-select";
    label.title = `${index + 1}. varyantı seç`;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("aria-label", `${index + 1}. varyantı toplu işlem için seç`);
    input.addEventListener("change", () => updateBulkToolbar(list));

    const marker = document.createElement("span");
    marker.setAttribute("aria-hidden", "true");
    label.append(input, marker);
    row.prepend(label);
  });
}

function applyVariantBulkAction(list: HTMLElement, toolbar: HTMLElement) {
  const rows = selectedVariantRows(list);
  if (!rows.length) return;

  const price = toolbar.querySelector<HTMLInputElement>("[data-variant-bulk-price]")?.value.trim() || "";
  const stock = toolbar.querySelector<HTMLInputElement>("[data-variant-bulk-stock]")?.value.trim() || "";
  const status = toolbar.querySelector<HTMLSelectElement>("[data-variant-bulk-status]")?.value || "";

  rows.forEach((row) => {
    if (price !== "") {
      const control = controlByLabel(row, "Fiyat");
      if (control) setControlValue(control, price);
    }
    if (stock !== "") {
      const control = controlByLabel(row, "Stok");
      if (control) setControlValue(control, stock);
    }
    if (status) {
      const control = controlByLabel(row, "Durum");
      if (control) setControlValue(control, status);
    }
  });

  toolbar.classList.add("is-applied");
  window.setTimeout(() => toolbar.classList.remove("is-applied"), 900);
}

function deleteSelectedVariants(list: HTMLElement) {
  const rows = selectedVariantRows(list);
  if (!rows.length) return;
  if (!window.confirm(`${rows.length} varyant silinsin mi?`)) return;

  [...rows].reverse().forEach((row) => {
    row.querySelector<HTMLButtonElement>(".cr-icon-button--danger")?.click();
  });
  window.setTimeout(() => updateBulkToolbar(list), 0);
}

function createVariantBulkToolbar(list: HTMLElement) {
  if (list.previousElementSibling?.classList.contains("cr-variant-bulk-toolbar")) {
    addVariantSelectors(list);
    updateBulkToolbar(list);
    return;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "cr-variant-bulk-toolbar";
  toolbar.innerHTML = `
    <div class="cr-variant-bulk-toolbar__select">
      <label><input type="checkbox" data-variant-select-all><span></span><strong>Tümünü seç</strong></label>
      <small data-variant-selected-count>0 varyant seçili</small>
    </div>
    <label class="cr-variant-bulk-field"><span>Fiyat</span><input data-variant-bulk-price type="number" min="0" step="0.01" placeholder="Değiştirme"></label>
    <label class="cr-variant-bulk-field"><span>Stok</span><input data-variant-bulk-stock type="number" min="0" step="1" placeholder="Değiştirme"></label>
    <label class="cr-variant-bulk-field"><span>Durum</span><select data-variant-bulk-status><option value="">Değiştirme</option><option value="in_stock">Stokta</option><option value="out_of_stock">Stokta yok</option></select></label>
    <div class="cr-variant-bulk-toolbar__actions">
      <button class="cr-button cr-button--secondary" type="button" data-variant-bulk-action="apply" disabled>Seçililere uygula</button>
      <button class="cr-button cr-button--danger" type="button" data-variant-bulk-action="delete" disabled>Seçilileri sil</button>
    </div>
  `;
  list.insertAdjacentElement("beforebegin", toolbar);

  const selectAll = toolbar.querySelector<HTMLInputElement>("[data-variant-select-all]");
  selectAll?.addEventListener("change", () => {
    list.querySelectorAll<HTMLInputElement>(".cr-variant-bulk-select input").forEach((input) => {
      input.checked = Boolean(selectAll.checked);
    });
    updateBulkToolbar(list);
  });

  toolbar.querySelector<HTMLButtonElement>("[data-variant-bulk-action='apply']")
    ?.addEventListener("click", () => applyVariantBulkAction(list, toolbar));
  toolbar.querySelector<HTMLButtonElement>("[data-variant-bulk-action='delete']")
    ?.addEventListener("click", () => deleteSelectedVariants(list));

  addVariantSelectors(list);
  updateBulkToolbar(list);
}

function enhanceVariantBulkActions(root: ParentNode) {
  matchingElements(root, VARIANT_LIST_SELECTOR).forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    createVariantBulkToolbar(element);
  });
}

function enhanceCareAdvice(root: ParentNode) {
  matchingElements(root, ".cr-drawer--product .cr-field").forEach((element) => {
    if (!(element instanceof HTMLLabelElement) || element.dataset.carePresetReady === "true") return;
    const caption = element.querySelector(":scope > span")?.textContent || "";
    if (normalize(caption) !== "bakim onerisi") return;

    const textarea = element.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) return;
    element.dataset.carePresetReady = "true";
    element.classList.add("cr-care-advice-picker");

    const select = document.createElement("select");
    select.className = "cr-care-preset-select";
    select.setAttribute("aria-label", "Bakım önerisi şablonu seç");
    select.innerHTML = [
      ...CARE_PRESETS.map((preset) => `<option value="${preset.value}">${preset.label}</option>`),
      '<option value="custom">Özel bakım önerisi</option>',
    ].join("");

    const current = textarea.value.trim();
    const matching = CARE_PRESETS.find((preset) => preset.text === current);
    select.value = matching?.value || "custom";
    select.addEventListener("change", () => {
      const preset = CARE_PRESETS.find((item) => item.value === select.value);
      if (preset) setControlValue(textarea, preset.text);
      textarea.hidden = select.value !== "custom";
      if (select.value === "custom") textarea.focus();
    });
    textarea.addEventListener("input", () => {
      const preset = CARE_PRESETS.find((item) => item.text === textarea.value.trim());
      select.value = preset?.value || "custom";
    });

    textarea.insertAdjacentElement("beforebegin", select);
    textarea.hidden = select.value !== "custom";
  });
}

function enhanceAddressBlocks(root: ParentNode) {
  matchingElements(root, ".cr-order-detail-content *, .ruth-drawer *, .cr-drawer *").forEach((element) => {
    if (!(element instanceof HTMLElement) || element.dataset.addressLabelReady === "true") return;
    const ownText = normalize(element.childElementCount ? "" : element.textContent || "");
    if (ownText !== "teslimat adresi" && ownText !== "adres") return;

    element.dataset.addressLabelReady = "true";
    element.classList.add("cr-address-label");
    const next = element.nextElementSibling;
    if (next instanceof HTMLElement) next.classList.add("cr-address-value");
    else element.parentElement?.classList.add("cr-address-block");
  });
}

function findOrderItem(button: HTMLElement) {
  let current: HTMLElement | null = button;
  for (let depth = 0; depth < 7 && current; depth += 1) {
    const text = normalize(current.innerText || "");
    if (/\b\d+\s*adet\b/.test(text) || text.includes("renk:") || text.includes("varyant:")) {
      return current;
    }
    current = current.parentElement;
  }
  return button.parentElement;
}

function previewData(button: HTMLElement): PreviewData | null {
  const image = button.querySelector<HTMLImageElement>("img")?.currentSrc
    || button.querySelector<HTMLImageElement>("img")?.src
    || "";
  if (!image) return null;

  const item = findOrderItem(button);
  const rawLines = (item?.innerText || "")
    .split(/\n|·|\u2022/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = rawLines.find((line) => {
    const normalized = normalize(line);
    return !normalized.includes("adet")
      && !normalized.includes("renk:")
      && !normalized.includes("varyant:")
      && !/^[-+]?\s*[₺€$]?\s*[\d.,]+/.test(line);
  }) || button.getAttribute("aria-label") || "Ürün";

  const variantKeys = ["renk:", "beden:", "olcu:", "materyal:", "kaplama:", "varyant:"];
  const variants = rawLines
    .filter((line) => variantKeys.some((key) => normalize(line).includes(key)))
    .map((line) => line.replace(/\s*-\s*\d+\s*adet\s*$/i, "").trim());
  const quantityMatch = (item?.innerText || "").match(/(\d+)\s*adet/i);

  return {
    image,
    title,
    variants: [...new Set(variants)],
    quantity: quantityMatch?.[1] || "1",
  };
}

function buildPreview(data: PreviewData) {
  const preview = document.createElement("aside");
  preview.className = "cr-order-inline-preview";
  preview.setAttribute("role", "dialog");
  preview.setAttribute("aria-label", `${data.title} ürün görseli`);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "cr-order-inline-preview__close";
  close.setAttribute("aria-label", "Önizlemeyi kapat");
  close.textContent = "×";

  const image = document.createElement("img");
  image.src = data.image;
  image.alt = data.title;

  const copy = document.createElement("div");
  copy.className = "cr-order-inline-preview__copy";
  const title = document.createElement("strong");
  title.textContent = data.title;
  copy.append(title);

  data.variants.forEach((variant) => {
    const row = document.createElement("span");
    row.textContent = variant;
    copy.append(row);
  });
  const quantity = document.createElement("span");
  quantity.innerHTML = `<b>Adet</b><em>${data.quantity}</em>`;
  copy.append(quantity);

  preview.append(close, image, copy);
  return preview;
}

function positionPreview(preview: HTMLElement, anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const mobile = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  const preferredWidth = mobile
    ? Math.min(window.innerWidth - 20, Math.max(230, rect.width * 3.4))
    : Math.min(430, Math.max(300, rect.width * 4.7));
  preview.style.width = `${preferredWidth}px`;
  preview.style.left = "10px";
  preview.style.top = "10px";

  const measured = preview.getBoundingClientRect();
  const left = Math.min(
    window.innerWidth - measured.width - 10,
    Math.max(10, rect.left + rect.width / 2 - measured.width / 2),
  );
  const above = rect.top - measured.height - 10;
  const top = above >= 10
    ? above
    : Math.min(window.innerHeight - measured.height - 10, rect.bottom + 10);

  preview.style.left = `${Math.max(10, left)}px`;
  preview.style.top = `${Math.max(10, top)}px`;
}

export function AdminRequestPolish() {
  const hoverTimerRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const previewAnchorRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearHoverTimer = () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    };
    const clearCloseTimer = () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    };
    const closePreview = () => {
      clearCloseTimer();
      previewRef.current?.remove();
      previewRef.current = null;
      previewAnchorRef.current = null;
    };
    const scheduleClose = () => {
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(closePreview, 140);
    };
    const openPreview = (button: HTMLElement) => {
      const data = previewData(button);
      if (!data) return;
      closePreview();
      const preview = buildPreview(data);
      previewRef.current = preview;
      previewAnchorRef.current = button;
      document.body.appendChild(preview);
      positionPreview(preview, button);
      preview.querySelector("button")?.addEventListener("click", closePreview);
      preview.addEventListener("pointerenter", clearCloseTimer);
      preview.addEventListener("pointerleave", scheduleClose);
    };

    const enhance = (root: ParentNode = document) => {
      enhanceVariantBulkActions(root);
      enhanceCareAdvice(root);
      enhanceAddressBlocks(root);
    };

    enhance();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) enhance(node);
        });
        const list = mutation.target instanceof Element
          ? mutation.target.closest<HTMLElement>(VARIANT_LIST_SELECTOR)
          : null;
        if (list) {
          addVariantSelectors(list);
          updateBulkToolbar(list);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>(ORDER_IMAGE_SELECTOR);
      if (button) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearHoverTimer();
        openPreview(button);
        return;
      }
      const preview = previewRef.current;
      if (preview && !preview.contains(event.target)) closePreview();
    };

    const onPointerOver = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>(ORDER_IMAGE_SELECTOR);
      if (!button) return;
      event.stopImmediatePropagation();
      clearCloseTimer();
      if (!supportsHover || button.contains(event.relatedTarget as Node | null)) return;
      clearHoverTimer();
      hoverTimerRef.current = window.setTimeout(() => openPreview(button), HOVER_DELAY_MS);
    };

    const onPointerOut = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>(ORDER_IMAGE_SELECTOR);
      if (!button) return;
      event.stopImmediatePropagation();
      if (button.contains(event.relatedTarget as Node | null)) return;
      clearHoverTimer();
      if (previewAnchorRef.current === button) scheduleClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    const onViewportChange = () => closePreview();

    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      clearHoverTimer();
      closePreview();
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, []);

  return null;
}
