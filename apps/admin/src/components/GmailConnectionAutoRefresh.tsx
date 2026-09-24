"use client";

import { useEffect } from "react";

import { adminRequest } from "@/lib/adminApi";

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const LAST_ATTEMPT_KEY = "ruth_gmail_connection_refresh_v1";

function lastAttemptAt() {
  try {
    return Number(window.localStorage.getItem(LAST_ATTEMPT_KEY) || 0);
  } catch {
    return 0;
  }
}

function rememberAttempt() {
  try {
    window.localStorage.setItem(LAST_ATTEMPT_KEY, String(Date.now()));
  } catch {
    // Local storage kapalıysa yalnız mevcut sekme zamanlayıcısı çalışır.
  }
}

export function GmailConnectionAutoRefresh() {
  useEffect(() => {
    let disposed = false;

    const refresh = async (force = false) => {
      if (disposed || document.visibilityState === "hidden") return;
      if (!force && Date.now() - lastAttemptAt() < REFRESH_INTERVAL_MS) return;

      // Başarısız ağ isteğinde görünürlük değişimlerinin sürekli istek atmasını
      // engellemek için deneme zamanı istekten hemen önce kaydedilir.
      rememberAttempt();
      try {
        await adminRequest("/api/email/gmail/refresh", {
          method: "POST",
          body: "{}",
          confirmation: false,
          invalidate: ["/api/email/status"],
        });
      } catch {
        // Gmail bağlantı ekranında durum görünür; arka plan kontrolü paneli bölmez.
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(true), REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
