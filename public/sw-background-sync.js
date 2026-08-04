// =============================================================================
// FERZU POS — Background Sync Service Worker Handler
// Este archivo NO es el SW principal — es un snippet que VitePWA inyecta
// a través de workbox.importScripts (ver vite.config.js → workbox.importScripts)
//
// Registra el evento 'sync' del Background Sync API:
// cuando el navegador detecta que volvió la red, dispara este handler
// incluso si la pestaña está cerrada.
// =============================================================================

self.addEventListener('sync', (event) => {
  if (event.tag === 'ferzu-sync-queue') {
    event.waitUntil(
      // Notificar a todos los clientes abiertos que hagan el sync
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_COMPLETE' });
        });
      })
    );
  }
});
