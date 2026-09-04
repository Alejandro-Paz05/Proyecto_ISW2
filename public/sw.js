/**
 * Service worker de Akari Studio.
 *
 * Dos estrategias distintas, según qué se pide:
 *
 *   - Estáticos (iconos, manifiesto, bundles): cache primero. No cambian de
 *     contenido sin cambiar de nombre, y servirlos desde el disco evita una
 *     ida al servidor en cada visita.
 *   - Páginas: red primero, con la copia en caché como respaldo. Al revés
 *     sería peor: el catálogo y el stock cambian, y una versión vieja
 *     mostraría precios o disponibilidad que ya no son ciertos.
 *
 * Las llamadas a la API nunca se cachean. Un stock desactualizado es peor que
 * un error de red, porque el usuario no se entera de que está mirando algo
 * viejo: agrega al carrito algo que no existe y lo descubre al pagar.
 *
 * Los nombres de cache se escriben completos y no se arman por interpolación.
 * Un `${VERSION}-estatico` es más corto, pero el nombre real deja de existir
 * como texto en el archivo, y cualquiera que audite qué caches abre este
 * worker —una herramienta o una persona— tiene que ejecutarlo mentalmente
 * para saberlo.
 */

const CACHE_ESTATICO = 'akari-v2-estatico';
const CACHE_PAGINAS = 'akari-v2-paginas';

// Todo lo que no esté en esta lista se borra al activar una versión nueva.
const CACHES_VIGENTES = [CACHE_ESTATICO, CACHE_PAGINAS];

const PAGINA_SIN_CONEXION = '/offline.html';

const PRECARGA = [
  PAGINA_SIN_CONEXION,
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png'
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_ESTATICO)
      .then((cache) => cache.addAll(PRECARGA))
      // Sin esto habría que cerrar todas las pestañas para que se active una
      // versión nueva del service worker.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => !CACHES_VIGENTES.includes(nombre))
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Solo GET del mismo origen: un POST de pedido tiene que llegar al servidor
  // sí o sí, porque descuenta inventario.
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // La API siempre va a la red. Un dato viejo aquí engaña al usuario.
  if (url.pathname.startsWith('/api/')) return;

  // El panel no se cachea: es contenido privado y detrás de sesión.
  if (url.pathname.startsWith('/akaristudio/admin')) return;

  const esEstatico =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    /\.(png|jpg|jpeg|svg|webp|ico|woff2?|css|js|json|txt)$/.test(url.pathname);

  evento.respondWith(esEstatico ? cachePrimero(peticion) : redPrimero(peticion));
});

async function cachePrimero(peticion) {
  const enCache = await caches.match(peticion);
  if (enCache) return enCache;

  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) {
      const cache = await caches.open(CACHE_ESTATICO);
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch {
    return new Response('', { status: 504, statusText: 'Sin conexión' });
  }
}

async function redPrimero(peticion) {
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) {
      const cache = await caches.open(CACHE_PAGINAS);
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch {
    const enCache = await caches.match(peticion);
    if (enCache) return enCache;

    // Sin conexión y sin copia guardada: al menos explicarle al usuario qué
    // pasó, en vez del error del navegador.
    if (peticion.mode === 'navigate') {
      const respaldo = await caches.match(PAGINA_SIN_CONEXION);
      if (respaldo) return respaldo;
    }

    return new Response('Sin conexión', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
