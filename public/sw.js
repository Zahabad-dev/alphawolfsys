// Service worker mínimo: instalabilidad + carga rápida de estáticos.
// Las ventas siempre requieren conexión en vivo (sin cola/sync offline a propósito,
// para no reintroducir el riesgo de doble registro que el diseño del ledger evita).
const CACHE_NAME = "wd-inventario-v1";
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

  // Network-first para páginas/datos: el vendedor siempre debe ver stock/ventas frescos.
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((r) => r || caches.match("/")))
  );
});
