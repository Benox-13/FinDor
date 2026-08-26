// Service Worker de Fînance — Fase 5 (PWA)
//
// Qué SÍ cachea: el archivo de la app (index.html), el manifest, los
// íconos, y las dos librerías externas (Chart.js, Supabase JS) — así la
// app abre rápido y puede lanzarse aunque no haya internet en ese momento.
//
// Qué NUNCA cachea: nada de supabase.co. Tus datos (transacciones, cuentas,
// etc.) siempre tienen que venir frescos de la red o fallar explícitamente
// si no hay conexión — jamás mostrar una copia vieja guardada en caché sin
// que la app lo sepa. El manejo de "sin conexión" para tus datos ya lo hace
// la app misma (Fase 4), no este archivo.

const CACHE_NAME = 'finance-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('SW: no se pudo pre-cachear todo el shell', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Candado de seguridad: nunca interceptar ni cachear nada hacia Supabase.
  if (url.hostname.endsWith('supabase.co')) return;
  if (event.request.method !== 'GET') return;

  // Estrategia "cache primero, actualiza en segundo plano" — rápido y
  // funciona offline, y la próxima vez que haya red ya tiene lo último.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
