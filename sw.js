/* sw.js — Service Worker: permite usar la app sin internet (offline). */
const CACHE = "cmc-v15";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/styles.css",
  "./assets/js/app.js",
  "./assets/js/ui.js",
  "./assets/js/storage.js",
  "./assets/js/export-word.js",
  "./assets/js/docparser.js",
  "./assets/js/modulos/partes.js",
  "./assets/js/modulos/documentacion.js",
  "./assets/js/modulos/biblioteca.js",
  "./assets/js/modulos/instructores.js",
  "./assets/js/modulos/corrector.js",
  "./assets/js/modulos/radiograma.js",
  "./assets/js/modulos/calendario.js",
  "./assets/js/modulos/notas.js",
  "./assets/js/modulos/contactos.js",
  "./assets/js/modulos/_placeholder.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/ejercito.jpg",
  "./assets/icons/eceme.png",
  "./assets/img/fondo-multicam.jpg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Estrategia "red primero": intenta la versión actualizada; si no hay internet,
// usa la copia en caché. Así siempre ves la última versión estando en línea,
// y la app sigue funcionando sin conexión.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === "basic") {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copia));
      }
      return res;
    }).catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
  );
});
