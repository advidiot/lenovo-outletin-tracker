self.addEventListener("push", function (event) {
  if (!event.data) {
    console.log("[Service Worker] Push event received with no data.");
    return;
  }

  try {
    const payload = event.data.json();
    console.log("[Service Worker] Push payload:", payload);

    const title = payload.title || "TrackFurb Alert";
    const productCode = payload.product_code || "";
    
    // Build notification options
    const options = {
      body: payload.body || "A tracked laptop has an update!",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: productCode ? `laptop-alert-${productCode}` : "general-alert",
      renotify: true,
      data: {
        url: productCode && productCode !== "TEST" ? `/laptop/${productCode}` : "/browse"
      }
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error("[Service Worker] Error displaying push notification:", err);
    
    // Fallback if data is not JSON
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("TrackFurb Alert", {
        body: text,
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        data: { url: "/browse" }
      })
    );
  }
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/browse";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      // If a window is already open, navigate it to targetUrl and focus
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && "focus" in client) {
          return client.navigate(targetUrl).then(c => c.focus());
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
