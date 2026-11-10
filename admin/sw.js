// Service worker mínimo: habilita instalación como app. Los datos siempre van a la red.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
