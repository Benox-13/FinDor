// Service Worker de Fînance — v2
//
// Qué SÍ cachea: el archivo de la app (index.html), el manifest, los íconos y las dos
// librerías externas (Chart.js, Supabase JS) — así la app puede abrirse aunque no haya
// internet en ese momento.
//
// Qué NUNCA cachea: nada de supabase.co. Tus datos (transacciones, cuentas, etc.) siempre
// vienen frescos de la red o fallan explícitamente si no hay conexión. El manejo de
// "sin conexión" para tus datos lo hace la app misma, no este archivo.
//
// Cambios de la v2 (respecto a la v1):
// 1) La PÁGINA de la app (index.html) ahora es "red primero": con internet siempre carga la
//    última versión publicada (antes había que abrir la app dos veces para ver una versión
//    nueva). Si la red tarda más de 3 s o falla, se abre la copia guardada y la red sigue
//    actualizándola en segundo plano.
// 2) La precarga es tolerante: si falta un archivo (por ejemplo un ícono), los demás se
//    guardan igual. Antes, un solo archivo faltante hacía fallar toda la precarga.
// 3) Nombre de caché nuevo (v2): al activarse se borra la caché v1 y todos empiezan limpios.
// 4) Un enlace con parámetros (por ejemplo el de recuperar contraseña) también abre la app
//    sin internet.

const CACHE_NAME = 'finance-shell-v2';
const NAV_TIMEOUT_MS = 3000;
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
      .then((cache) => Promise.allSettled(SHELL_FILES.map((url) => cache.add(url))))
      .then((results) => {
        const fallaron = results.filter((r) => r.status === 'rejected').length;
        if (fallaron) console.warn('SW: no se pudieron pre-cachear ' + fallaron + ' archivo(s); el resto sí se guardó');
      })
      .catch((err) => console.warn('SW: error en la precarga', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function scopeUrl(path) { return new URL(path, self.registration.scope).href; }

// Clave de caché de una navegación: la misma dirección sin parámetros ni #
function navKey(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
}

// Página de la app: red primero (con límite de tiempo) y copia guardada como respaldo
async function handleNavigation(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const key = navKey(request.url);
  const root = scopeUrl('./'), index = scopeUrl('./index.html');

  const fromCache = async () =>
    (await cache.match(key)) || (await cache.match(index)) || (await cache.match(root));

  const network = fetch(request).then((res) => {
    if (res && res.status === 200) {
      // La app es un solo documento: se actualiza bajo su propia clave y bajo las dos de la raíz
      const keys = new Set([key]);
      if (key === root || key === index) { keys.add(root); keys.add(index); }
      keys.forEach((k) => cache.put(k, res.clone()));
    }
    return res;
  });

  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), NAV_TIMEOUT_MS); });
  const first = await Promise.race([network.catch(() => null), timeout]);
  clearTimeout(timer);

  if (first && first.ok) return first;                 // red a tiempo y correcta
  const cached = await fromCache();
  if (cached) {                                         // red lenta, caída o con error: copia guardada
    event.waitUntil(network.catch(() => {}));           // y que la red siga actualizando la caché
    return cached;
  }
  return first || network;                              // sin copia guardada: lo que responda la red
}

// Archivos de apoyo (íconos, librerías): rápido desde caché y se actualizan en segundo plano
function handleAsset(request, event) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => cached);
    if (cached) event.waitUntil(network.then(() => {}, () => {}));
    return cached || network;
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Candado de seguridad: nunca interceptar ni cachear nada hacia Supabase.
  if (url.hostname.endsWith('supabase.co')) return;
  if (request.method !== 'GET') return;

  const esNavegacion = request.mode === 'navigate' && url.origin === self.location.origin;
  event.respondWith(esNavegacion ? handleNavigation(request, event) : handleAsset(request, event));
});
