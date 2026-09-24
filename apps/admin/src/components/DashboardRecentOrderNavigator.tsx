"use client";

import { useEffect } from "react";

function cleanOrderNumber(value: string) {
  return value.replace(/^#/, "").trim();
}

export function DashboardRecentOrderNavigator() {
  useEffect(() => {
    const onDashboardClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>(
        ".cr-dashboard-orders a[href*='/orders?'][href*='order=']",
      );
      if (!anchor) return;

      const url = new URL(anchor.href, window.location.origin);
      const orderNumber = cleanOrderNumber(
        anchor.querySelector("strong")?.textContent || "",
      );
      if (orderNumber) url.searchParams.set("q", orderNumber);
      url.searchParams.set("source", "dashboard");

      // Tam sayfa geçişi, dashboard ve orders client state'leri arasında kalan
      // eski route/cache durumunu ortadan kaldırır.
      event.preventDefault();
      window.location.assign(`${url.pathname}${url.search}`);
    };

    let openedOrder = "";
    const openRequestedOrder = () => {
      if (window.location.pathname !== "/orders") return;
      const params = new URLSearchParams(window.location.search);
      const orderId = params.get("order") || "";
      const orderNumber = cleanOrderNumber(params.get("q") || "");
      if (!orderId || !orderNumber || openedOrder === orderId) return;
      if (document.querySelector(".ruth-drawer")) {
        openedOrder = orderId;
        return;
      }

      const card = [...document.querySelectorAll<HTMLElement>(".cr-order-card")]
        .find((element) => {
          const number = cleanOrderNumber(
            element.querySelector(".cr-order-card__number strong")?.textContent || "",
          );
          return number === orderNumber;
        });
      if (!card) return;

      openedOrder = orderId;
      card.click();
    };

    document.addEventListener("click", onDashboardClick, true);
    const observer = new MutationObserver(openRequestedOrder);
    observer.observe(document.body, { childList: true, subtree: true });
    openRequestedOrder();

    return () => {
      document.removeEventListener("click", onDashboardClick, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
