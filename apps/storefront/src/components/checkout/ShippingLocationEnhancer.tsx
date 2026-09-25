"use client";

import { useEffect } from "react";
import { findShippingDistrict, findShippingProvince, normalizeTurkishLocation, type ShippingLocation } from "@/lib/shippingLocations";

const API_PATH = "/api/shipping/locations";
const PICKER_ROOT_CLASS = "relative mt-2 w-full";
const PICKER_BUTTON_CLASS = "flex w-full items-center justify-between gap-3 rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-left text-sm normal-case tracking-normal text-cream outline-none transition hover:border-kraft/65 focus:border-brick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick";
const PICKER_PANEL_CLASS = "absolute left-0 right-0 top-full z-[120] mt-2 max-h-72 overflow-y-auto border border-kraft/40 bg-carbon-soft p-2 text-cream shadow-[0_18px_50px_color-mix(in_srgb,var(--rosta-carbon)_52%,transparent)]";
const PICKER_OPTION_CLASS = "block w-full px-3 py-2.5 text-left text-sm normal-case tracking-normal text-cream transition hover:bg-brick/10 focus:bg-brick/10 focus:outline-none";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectProvince(locations: ShippingLocation[], value: string) {
  return findShippingProvince(locations, value);
}

type LocationPicker = {
  root: HTMLDivElement;
  button: HTMLButtonElement;
  label: HTMLSpanElement;
  panel: HTMLDivElement;
};

function closeAllPickers(except?: HTMLElement | null) {
  for (const panel of Array.from(document.querySelectorAll<HTMLElement>("[data-ruth-shipping-picker-panel]"))) {
    const owner = panel.closest<HTMLElement>("[data-ruth-shipping-location-picker]");
    if (except && owner === except) continue;
    panel.hidden = true;
    const button = owner?.querySelector<HTMLButtonElement>("[data-ruth-shipping-picker-button]");
    button?.setAttribute("aria-expanded", "false");
  }
}

function buildPicker(name: string, ariaLabel: string): LocationPicker {
  const root = document.createElement("div");
  root.className = PICKER_ROOT_CLASS;
  root.dataset.ruthShippingLocationPicker = name;

  const button = document.createElement("button");
  button.type = "button";
  button.className = PICKER_BUTTON_CLASS;
  button.dataset.ruthShippingPickerButton = "1";
  button.setAttribute("aria-label", ariaLabel);
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");

  const label = document.createElement("span");
  label.className = "min-w-0 flex-1 truncate";

  const chevron = document.createElement("span");
  chevron.textContent = "⌄";
  chevron.setAttribute("aria-hidden", "true");
  chevron.className = "shrink-0 text-brick transition-transform";

  const panel = document.createElement("div");
  panel.className = PICKER_PANEL_CLASS;
  panel.dataset.ruthShippingPickerPanel = "1";
  panel.setAttribute("role", "listbox");
  panel.hidden = true;

  button.append(label, chevron);
  root.append(button, panel);

  button.addEventListener("click", () => {
    const shouldOpen = panel.hidden;
    closeAllPickers(shouldOpen ? root : null);
    panel.hidden = !shouldOpen;
    button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    chevron.style.transform = shouldOpen ? "rotate(180deg)" : "";
  });

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    chevron.style.transform = "";
    button.focus();
  });

  return { root, button, label, panel };
}

function setPickerOptions(
  picker: LocationPicker,
  placeholder: string,
  options: string[],
  selected: string,
  onSelect: (value: string) => void,
) {
  picker.panel.replaceChildren();
  const normalizedSelected = normalizeTurkishLocation(selected);
  const matched = options.find((option) => normalizeTurkishLocation(option) === normalizedSelected) || "";
  picker.label.textContent = matched || placeholder;
  picker.label.className = matched
    ? "min-w-0 flex-1 truncate text-cream"
    : "min-w-0 flex-1 truncate text-cream/65";

  for (const option of options) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = PICKER_OPTION_CLASS;
    item.textContent = option;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", option === matched ? "true" : "false");
    if (option === matched) item.className += " bg-brick/12 text-cream";
    item.addEventListener("click", () => {
      picker.label.textContent = option;
      picker.label.className = "min-w-0 flex-1 truncate text-cream";
      picker.panel.hidden = true;
      picker.button.setAttribute("aria-expanded", "false");
      onSelect(option);
      picker.button.focus();
    });
    picker.panel.appendChild(item);
  }

  if (!options.length) {
    const empty = document.createElement("div");
    empty.className = "px-3 py-3 text-sm text-cream/55";
    empty.textContent = "Önce il seç";
    picker.panel.appendChild(empty);
  }
}

export function ShippingLocationEnhancer() {
  useEffect(() => {
    let cancelled = false;
    let locations: ShippingLocation[] = [];
    let observer: MutationObserver | null = null;
    let enhanceTimer: number | null = null;

    const loadLocations = async () => {
      try {
        const response = await fetch(API_PATH, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data?.ok || !Array.isArray(data.locations)) {
          throw new Error(data?.error || "Adres listesi alınamadı.");
        }
        locations = data.locations as ShippingLocation[];
        if (!cancelled) enhance();
      } catch (error) {
        console.error("Teslimat il/ilçe listesi yüklenemedi:", error);
      }
    };

    const enhance = () => {
      if (cancelled || !locations.length) return;

      const cityInput = document.querySelector<HTMLInputElement>('input[autocomplete="address-level1"]');
      const districtInput = document.querySelector<HTMLInputElement>('input[autocomplete="address-level2"]');
      if (!cityInput || !districtInput) return;

      const existingCityPicker = document.querySelector<HTMLElement>('[data-ruth-shipping-location-picker="city"]');
      const existingDistrictPicker = document.querySelector<HTMLElement>('[data-ruth-shipping-location-picker="district"]');
      if (
        cityInput.dataset.ruthShippingLocationEnhanced === "1"
        && districtInput.dataset.ruthShippingLocationEnhanced === "1"
        && existingCityPicker
        && existingDistrictPicker
      ) {
        return;
      }

      existingCityPicker?.remove();
      existingDistrictPicker?.remove();

      const cityPicker = buildPicker("city", "İl seç");
      const districtPicker = buildPicker("district", "İlçe seç");

      cityInput.dataset.ruthShippingLocationEnhanced = "1";
      districtInput.dataset.ruthShippingLocationEnhanced = "1";
      cityInput.classList.add("sr-only");
      districtInput.classList.add("sr-only");
      cityInput.insertAdjacentElement("afterend", cityPicker.root);
      districtInput.insertAdjacentElement("afterend", districtPicker.root);

      const syncDistricts = (cityValue: string, districtValue = "") => {
        const province = selectProvince(locations, cityValue);
        const districts = province?.districts || [];
        const matchedDistrict = findShippingDistrict(province, districtValue);
        const canonicalCity = province?.province || "";
        const canonicalDistrict = matchedDistrict;
        if (canonicalCity !== clean(cityInput.value)) setReactInputValue(cityInput, canonicalCity);
        if (canonicalDistrict !== clean(districtInput.value)) setReactInputValue(districtInput, canonicalDistrict);

        setPickerOptions(districtPicker, "İlçe seç", districts, canonicalDistrict, (value) => {
          setReactInputValue(districtInput, value);
        });
      };

      setPickerOptions(
        cityPicker,
        "İl seç",
        locations.map((location) => location.province),
        cityInput.value,
        (value) => {
          const province = selectProvince(locations, value);
          const canonicalCity = province?.province || "";
          setReactInputValue(cityInput, canonicalCity);
          setReactInputValue(districtInput, "");
          syncDistricts(canonicalCity, "");
        },
      );
      syncDistricts(cityInput.value, districtInput.value);
    };

    const onDocumentPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-ruth-shipping-location-picker]")) return;
      closeAllPickers();
    };
    document.addEventListener("pointerdown", onDocumentPointerDown, true);

    enhanceTimer = window.setInterval(enhance, 350);
    observer = new MutationObserver(() => enhance());
    observer.observe(document.body, { subtree: true, childList: true });
    void loadLocations();

    return () => {
      cancelled = true;
      if (enhanceTimer !== null) window.clearInterval(enhanceTimer);
      observer?.disconnect();
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    };
  }, []);

  return null;
}
