"use client";

import { useEffect } from "react";
import { findShippingDistrict, findShippingProvince, normalizeTurkishLocation, type ShippingLocation } from "@/lib/shippingLocations";

const API_PATH = "/api/shipping/locations";
const SELECT_CLASS = "mt-2 w-full rounded-lg border border-kraft/40 bg-carbon px-4 py-3 text-sm normal-case tracking-normal text-cream outline-none transition focus:border-brick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick";

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

function buildSelect(name: string, ariaLabel: string) {
  const select = document.createElement("select");
  select.className = SELECT_CLASS;
  select.dataset.ruthShippingLocationSelect = name;
  select.setAttribute("aria-label", ariaLabel);
  return select;
}

function replaceSelectOptions(select: HTMLSelectElement, placeholder: string, options: string[], selected: string) {
  select.replaceChildren();
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  for (const option of options) {
    const item = document.createElement("option");
    item.value = option;
    item.textContent = option;
    select.appendChild(item);
  }

  const normalizedSelected = normalizeTurkishLocation(selected);
  const matched = options.find((option) => normalizeTurkishLocation(option) === normalizedSelected) || "";
  select.value = matched;
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

      const existingCitySelect = document.querySelector<HTMLSelectElement>('select[data-ruth-shipping-location-select="city"]');
      const existingDistrictSelect = document.querySelector<HTMLSelectElement>('select[data-ruth-shipping-location-select="district"]');
      if (
        cityInput.dataset.ruthShippingLocationEnhanced === "1"
        && districtInput.dataset.ruthShippingLocationEnhanced === "1"
        && existingCitySelect
        && existingDistrictSelect
      ) {
        return;
      }

      existingCitySelect?.remove();
      existingDistrictSelect?.remove();

      const citySelect = buildSelect("city", "İl seç");
      const districtSelect = buildSelect("district", "İlçe seç");

      cityInput.dataset.ruthShippingLocationEnhanced = "1";
      districtInput.dataset.ruthShippingLocationEnhanced = "1";
      cityInput.classList.add("sr-only");
      districtInput.classList.add("sr-only");
      cityInput.insertAdjacentElement("afterend", citySelect);
      districtInput.insertAdjacentElement("afterend", districtSelect);

      const syncDistricts = (cityValue: string, districtValue = "") => {
        const province = selectProvince(locations, cityValue);
        const districts = province?.districts || [];
        replaceSelectOptions(districtSelect, "İlçe seç", districts, districtValue);

        const matchedDistrict = findShippingDistrict(province, districtValue);
        const canonicalCity = province?.province || "";
        const currentCity = clean(cityInput.value);
        const canonicalDistrict = matchedDistrict;
        if (canonicalCity !== currentCity) setReactInputValue(cityInput, canonicalCity);
        if (canonicalDistrict !== clean(districtInput.value)) setReactInputValue(districtInput, canonicalDistrict);
      };

      replaceSelectOptions(citySelect, "İl seç", locations.map((location) => location.province), cityInput.value);
      syncDistricts(cityInput.value, districtInput.value);

      citySelect.addEventListener("change", () => {
        const province = selectProvince(locations, citySelect.value);
        const canonicalCity = province?.province || "";
        setReactInputValue(cityInput, canonicalCity);
        setReactInputValue(districtInput, "");
        syncDistricts(canonicalCity, "");
      });

      districtSelect.addEventListener("change", () => {
        setReactInputValue(districtInput, districtSelect.value);
      });
    };

    enhanceTimer = window.setInterval(enhance, 350);
    observer = new MutationObserver(() => enhance());
    observer.observe(document.body, { subtree: true, childList: true });
    void loadLocations();

    return () => {
      cancelled = true;
      if (enhanceTimer !== null) window.clearInterval(enhanceTimer);
      observer?.disconnect();
    };
  }, []);

  return null;
}
