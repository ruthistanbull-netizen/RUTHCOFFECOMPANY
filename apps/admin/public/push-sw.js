self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "ROSTA Panel", body: event.data ? event.data.text() : "Yeni bildirim" };
  }

  const title = payload.title || "ROSTA Panel";
  const options = {
    body: payload.body || "Yeni bildirim",
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
      await self.registration.showNotification(title, options);
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
