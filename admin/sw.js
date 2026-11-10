// Service worker: habilita instalación como app y recibe notificaciones push.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "FZ Studio", {
    body: d.body || "", tag: d.tag, icon: "/img/icon-192.png", badge: "/img/icon-192.png"
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.includes("/admin") && "focus" in c) return c.focus();
    return self.clients.openWindow("/admin/");
  }));
});
