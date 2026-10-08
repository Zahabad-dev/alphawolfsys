// Las ventas ahora sí soportan cola offline (ver src/lib/offline-db.ts) — el
// vendedor cuenta y guarda local si no hay señal, se sincroniza sola después.
// Aquí solo nos aseguramos de que la app misma (el "shell") cargue sin señal.
const CACHE_NAME = "wd-inventario-v6";
const ESTATICOS_PREFIX = ["/_next/static/", "/icons/"];

// Pantallas principales de cada rol que se precargan apenas se instala el
// service worker — así cargan sin señal desde la primera vez que se abre la
// app, sin depender de que cada quien las haya visitado antes a mano. Cada
// usuario solo puede precargar de verdad las que su propio rol puede ver
// (las demás simplemente fallan en silencio, ver más abajo) — por eso no
// hace daño listarlas todas juntas para todos los roles.
// OJO: "/" no se precarga a propósito — es una redirección que depende de
// con qué sesión/rol se instaló el service worker, y guardarla causaba que
// alguien sin señal terminara viendo una pantalla cacheada de otra sesión,
// sin relación con lo que veía.
const PRECARGA_URLS = [
  "/offline",
  "/venta",
  "/venta/escanear",
  "/venta/confirmar",
  "/venta/salida",
  "/inventario",
  "/admin/dashboard",
  "/admin/precios",
  "/admin/inventario",
  "/admin/corte",
  "/admin/traspasos",
  "/admin/usuarios",
  "/admin/sucursales",
  "/admin/historial",
  "/admin/ranking",
  "/soporte",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECARGA_URLS.map((url) =>
          fetch(url, { credentials: "same-origin" })
            .then((response) => {
              if (response.ok) return cache.put(url, response);
            })
            .catch(() => {
              // Sin señal en el momento de instalar, o la ruta pidió login —
              // no debe tumbar la instalación del resto del service worker.
            })
        )
      )
    )
  );
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
      .catch(() =>
        caches.match(request).then((exacto) => {
          if (exacto) return exacto;
          // Páginas con query string (ej. /venta/confirmar?token=... o los
          // controles de /admin/precios/.../qr) cambian de parámetros pero el
          // HTML/JS es el mismo shell — si nunca se cacheó ESA combinación
          // exacta, cualquier otra copia de la misma ruta sirve de respaldo
          // (los datos reales siempre se leen de la URL/sesión real, no de
          // la respuesta cacheada). Si ni eso hay, aviso claro de sin conexión
          // en vez de fallar sin explicación.
          return caches
            .match(request, { ignoreSearch: true })
            .then((aproximado) => aproximado || caches.match("/offline"));
        })
      )
  );
});
