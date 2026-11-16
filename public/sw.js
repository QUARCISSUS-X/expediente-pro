// Service worker de la web instalable (PWA): guarda el programa para que abra sin conexión.
// Primero intenta la red (así llegan las versiones nuevas) y, si no hay conexión, usa la copia guardada.
// Los proyectos no pasan por aquí: viven en IndexedDB del navegador.
const CACHE = 'expediente-pro-v1';
const BASE = ['./', './index.html', './manifest.webmanifest', './iconos/icono-128.png', './iconos/icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          void caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return r;
      })
      .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
