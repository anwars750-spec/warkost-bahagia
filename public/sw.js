/* Web Push only: no fetch interception or offline/auth response caching. */
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
function safeTarget(data) {
  const id = Number(data?.orderId);
  return Number.isSafeInteger(id) && id > 0 ? `/?pushOrder=${id}` : "/";
}
async function authorized(data) {
  if (!/^[a-f0-9]{64}$/.test(data?.deliveryKey || "")) return false;
  try {
    const response = await fetch(`/api/push?delivery=${data.deliveryKey}`, {
      credentials: "include",
      cache: "no-store",
    });
    return response.ok && (await response.json()).allowed === true;
  } catch {
    return false;
  }
}
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data?.json();
      } catch {
        return;
      }
      if (!data || typeof data.body !== "string" || !(await authorized(data)))
        return;
      await self.registration.showNotification("Warkost Bahagia", {
        body: data.body.slice(0, 180),
        icon: "/push-icon-192.png",
        tag: `warkost:${data.eventType}:${data.orderId}`,
        data: {
          orderId: data.orderId,
          deliveryKey: data.deliveryKey,
          url: safeTarget(data),
        },
      });
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const data = event.notification.data;
      const target = new URL(
        (await authorized(data)) ? safeTarget(data) : "/",
        self.location.origin,
      ).href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("navigate" in client) await client.navigate(target);
        await client.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "WARKOST_SESSION_ENDED") return;
  event.waitUntil(
    self.registration
      .getNotifications()
      .then((items) => items.forEach((item) => item.close())),
  );
});
