// Las ventas ahora sí soportan cola offline (ver src/lib/offline-db.ts) — el
// vendedor cuenta y guarda local si no hay señal, se sincroniza sola después.
// Aquí solo nos aseguramos de que la app misma (el "shell") cargue sin señal.
const CACHE_NAME = "wd-inventario-v2";
const ESTATICOS_PREFIX = ["/_next/static/", "/icons/"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function esEstatico(url) {
  return ESTATICOS_PREFIX.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const titulo = data.title || "Wolf Daniels — Inventario";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (esEstatico(url)) {
    // Cache-first: los assets con hash de Next casi nunca cambian de contenido.
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Network-first para páginas: siempre se intenta lo más fresco primero, pero
  // se guarda una copia para que la app cargue igual si luego se pierde la señal
  // a medio turno. Las rutas de /api/ nunca se cachean aquí — esas se manejan
  // con datos locales propios (ver src/lib/offline-db.ts) para no mezclar
  // fuentes de verdad.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match("/")))
  );
});
