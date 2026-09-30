const CACHE_NAME = 'los-bionicos-v17';

const ARCHIVOS_ESTATICOS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/sha256.js',
  './js/db.js',
  './js/auth.js',
  './js/app.js',
  './js/inicio.js',
  './js/productos.js',
  './js/venta.js',
  './js/reportes.js',
  './js/usuarios.js',
  './js/caja.js',
  './js/clientes.js',
  './js/respaldo.js',
  './js/registrar-sw.js',
  './pages/inicio.html',
  './pages/productos.html',
  './pages/venta.html',
  './pages/reportes.html',
  './pages/usuarios.html',
  './pages/caja.html',
  './pages/clientes.html',
  './pages/gastos.html',
  './pages/respaldo.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ARCHIVOS_ESTATICOS.map((url) => cache.add(url))
      );
    })
  );
});

// Nota: a propósito NO se usa self.skipWaiting() ni self.clients.claim().
// Esa combinación hace que el SW tome control de una pestaña que ya está
// navegando a mitad de camino, lo que puede romper esa navegación. Con el
// patrón estándar, el SW controla la app a partir de la SIGUIENTE carga,
// que es exactamente como se abre siempre esta PWA (ícono en pantalla de
// inicio del iPad) — no hay costo real en la práctica.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) => {
      return Promise.all(
        nombres
          .filter((nombre) => nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((respuestaCache) => {
      if (respuestaCache) return respuestaCache;

      return fetch(request, { cache: 'no-store' })
        .then((respuestaRed) => {
          // Solo se cachean respuestas 200 completas: una 304 (sin cuerpo)
          // guardada en caché rompería cualquier carga futura de esa URL.
          if (respuestaRed.ok && respuestaRed.status === 200) {
            const copia = respuestaRed.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copia))
            );
          }
          return respuestaRed;
        })
        .catch(() => {
          return new Response('', { status: 504, statusText: 'Sin conexión y sin caché disponible' });
        });
    })
  );
});
