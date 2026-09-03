// Service worker de la app de inspección de campo.
//
// BUMPEAR CACHE en cada cambio de este archivo o del precache. Sin bumpear, los usuarios ven
// la versión vieja por días; y en una PWA instalada no pueden hacer Ctrl+Shift+R.
const CACHE = "eq-torre-v1";

// Rutas relativas: el scope es /INSPECCION-DE-CAMPO-EQ-DE-TORRE/, no la raíz.
const PRECACHE = ["./", "./index.html", "./manifest.json", "./icono-192.png", "./icono-512.png"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // La Cache API solo acepta http(s). Un chrome-extension:// o un blob: hace throw en cache.put.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // NUNCA cachear las llamadas a Power Automate: un estado cacheado es peor que un error de red.
  if (url.hostname.includes("powerplatform.com") || url.hostname.includes("logic.azure.com")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit ?? caches.match("./index.html")),
      ),
  );
});
