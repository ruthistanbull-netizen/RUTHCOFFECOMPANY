const PUSH_BRAND_TITLE = "ROSTA Coffee";

// This worker owns push only; activating an update does not replace a page or cache.
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};
  } catch {
    payload = { title: PUSH_BRAND_TITLE, body: event.data ? event.data.text() : "Yeni bildirim" };
  }

  const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : PUSH_BRAND_TITLE;
  const body = typeof payload.body === "string" && payload.body.trim() ? payload.body.trim() : "Yeni bildirim";
  const nativeBody = title === PUSH_BRAND_TITLE ? body : `${title}\n${body}`;
  const options = {
    body: nativeBody,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "rosta-panel-notification",
    renotify: true,
    requireInteraction: true,
    data: { url: payload.url || "/", type: payload.type || payload.kind || "default" },
    actions: [
      { action: "open", title: "Aç" },
      { action: "dismiss", title: "Kapat" },
    ],
  };

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        client.postMessage({
          // Keep the current Commerce client event contract so the notification
          // center and sound layer continue to receive the same message shape.
          kind: "ruth-push",
          payload: { ...payload, title, type: payload.type || payload.kind || "default", tag: options.tag },
        });
      }
      await self.registration.showNotification(PUSH_BRAND_TITLE, options);
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const destination = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("navigate" in client) await client.navigate(destination);
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(destination);
    }),
  );
});
