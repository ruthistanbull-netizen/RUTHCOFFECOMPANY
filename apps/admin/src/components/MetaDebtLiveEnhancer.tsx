"use client";

import { useEffect, useRef } from "react";
import { adminRequest } from "@/lib/adminApi";

type BalancePayload = {
  ok: boolean;
  fetchedAt: string;
  account: {
    id: string;
    name: string;
    currency: string;
    balance: number;
  };
  billing: {
    estimatedTaxRate: number;
    estimatedTax: number;
    totalDebt: number;
    estimated: boolean;
  };
};

const POLL_INTERVAL_MS = 60_000;

function money(value: number, currency: string) {
  const amount = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
  return `${amount} ${currency === "TRY" ? "TL" : currency}`;
}

function findTextElement(root: HTMLElement, values: string[]) {
  const wanted = new Set(values.map((value) => value.toLocaleLowerCase("tr-TR")));
  return Array.from(root.querySelectorAll<HTMLElement>("p,span")).find((element) => {
    const text = element.textContent?.trim().toLocaleLowerCase("tr-TR") || "";
    return wanted.has(text);
  }) || null;
}

function applyBilling(payload: BalancePayload) {
  const root = document.querySelector<HTMLElement>("[data-exact-base44-page='meta-ads']");
  if (!root) return;

  const label = findTextElement(root, ["Bakiye / Borç", "Mevcut Bakiye / Reklam Borcu"]);
  if (!label) return;

  const card = label.parentElement;
  if (!card) return;

  if (label.textContent !== "Mevcut Bakiye / Reklam Borcu") {
    label.textContent = "Mevcut Bakiye / Reklam Borcu";
  }

  const balanceLine = label.nextElementSibling as HTMLElement | null;
  const balanceText = money(payload.account.balance, payload.account.currency);
  if (balanceLine && balanceLine.textContent !== balanceText) {
    balanceLine.textContent = balanceText;
  }

  const existingTaxLine = balanceLine?.nextElementSibling as HTMLElement | null;
  const taxText = `+ ${money(payload.billing.estimatedTax, payload.account.currency)} tahmini vergi`;
  if (existingTaxLine && existingTaxLine.textContent !== taxText) {
    existingTaxLine.textContent = taxText;
    existingTaxLine.className = "mt-1 text-[8px] leading-3 text-muted";
  }

  let total = card.querySelector<HTMLElement>("[data-meta-total-debt='true']");
  if (!total) {
    total = document.createElement("div");
    total.dataset.metaTotalDebt = "true";
    total.className = "mt-2 border-t border-border-subtle pt-2";

    const totalLabel = document.createElement("p");
    totalLabel.dataset.metaTotalDebtLabel = "true";
    totalLabel.className = "text-[8px] uppercase tracking-wide text-subtle";
    totalLabel.textContent = "Vergi Dahil Toplam Borç";

    const totalValue = document.createElement("p");
    totalValue.dataset.metaTotalDebtValue = "true";
    totalValue.className = "mt-0.5 text-[11px] font-bold text-main";

    total.append(totalLabel, totalValue);
    card.appendChild(total);
  }

  const totalValue = total.querySelector<HTMLElement>("[data-meta-total-debt-value='true']");
  const totalText = money(payload.billing.totalDebt, payload.account.currency);
  if (totalValue && totalValue.textContent !== totalText) totalValue.textContent = totalText;

  card.dataset.metaDebtFetchedAt = payload.fetchedAt;
}

export function MetaDebtLiveEnhancer() {
  const latest = useRef<BalancePayload | null>(null);
  const lastFetchAt = useRef(0);

  useEffect(() => {
    let disposed = false;
    let scheduled = false;

    const applyLatest = () => {
      if (disposed || !latest.current) return;
      applyBilling(latest.current);
    };

    const scheduleApply = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        applyLatest();
      });
    };

    const refreshBalance = async () => {
      try {
        const payload = await adminRequest<BalancePayload>("/api/meta-ads/account-balance", {
          hardRefresh: true,
          ttlMs: 0,
          staleMs: 0,
          timeoutMs: 30_000,
        });
        if (disposed) return;
        latest.current = payload;
        lastFetchAt.current = Date.now();
        applyLatest();
      } catch {
        // Main Meta dashboard already surfaces connection errors. Keep the
        // minute-by-minute balance refresh silent so it never spams toasts.
      }
    };

    void refreshBalance();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshBalance();
    }, POLL_INTERVAL_MS);

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAt.current >= POLL_INTERVAL_MS) void refreshBalance();
      else scheduleApply();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
