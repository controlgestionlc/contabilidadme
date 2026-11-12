/* SCI - Service Worker
   Reconstruido en v90 (el archivo anterior fue sobrescrito con el contenido
   de index.html y el SW no registraba). Estrategia: cache-first con
   precache versionado; la red actualiza el cache en segundo plano. */

/* VERSION: único punto a cambiar en cada release. CACHE y las refs ?v= de
   ASSETS se derivan de aquí, así no pueden volver a desalinearse (hasta v107
   la lista quedó congelada en ?v=99 y el precache no servía a la app, que
   pedía otra URL: en terreno sin señal eso dejaba la app sin archivos). */
const VERSION = 184;
const CACHE = 'sci-v' + VERSION;
const V = '?v=' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css' + V,
  './js/core.js' + V,
  './js/inventario.js' + V,
  './js/cuaderno.js' + V,
  './js/huerto.js' + V,
  './js/presupuesto.js' + V,
  './js/ordencompra.js' + V,
  './js/actualizacion.js' + V,
  './js/helada.js' + V,
  './data/presupuesto-data.js' + V,
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Solo GET y mismo origen; Firebase/CDNs van directo a la red.
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
