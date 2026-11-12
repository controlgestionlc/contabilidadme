/* Este archivo quedó por error (era del SCI). Se deja como "interruptor":
   cualquier navegador que haya registrado el SCI en este sitio lo desinstala,
   borra sus cachés y recarga la página, volviendo a Contabilidad.
   Puede eliminarse del repositorio en unos días. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('sci-')).map(k => caches.delete(k)));
  await self.registration.unregister();
  const clientes = await self.clients.matchAll({ type: 'window' });
  clientes.forEach(c => c.navigate(c.url));
})()));
