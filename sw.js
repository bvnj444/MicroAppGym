/*
 * MicroApp Gym — service worker.
 * Caché versionada: al cambiar CUALQUIER archivo de la app, sube CACHE
 * (gym-v2, gym-v3...) y añade aquí los archivos nuevos.
 * Rutas relativas a este archivo: funciona en la raíz y en /repo/ de GitHub Pages.
 */

const CACHE = 'gym-v2';

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './fonts/inter-400.woff2',
  './fonts/inter-500.woff2',
  './fonts/inter-600.woff2',
  './fonts/inter-700.woff2',
  './fonts/barlow-condensed-600.woff2',
  './fonts/barlow-condensed-700.woff2',
  './js/app.js',
  './js/storage.js',
  './js/views/hoy.js',
  './js/views/rutina.js',
  './js/views/ejercicios.js',
  './js/views/historial.js',
  './js/views/config.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' evita copiar versiones viejas desde la caché HTTP del navegador.
    await cache.addAll(ARCHIVOS.map((ruta) => new Request(ruta, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres
      .filter((nombre) => nombre.startsWith('gym-') && nombre !== CACHE)
      .map((nombre) => caches.delete(nombre)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return; // solo recursos propios

  evento.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // Navegación a la app (raíz del alcance o index.html, con cualquier #hash o ?query).
    const raiz = new URL('./', self.location).pathname;
    const esApp = url.pathname === raiz || url.pathname === raiz + 'index.html';
    if (peticion.mode === 'navigate' && esApp) {
      const indice = await cache.match('./index.html') || await cache.match('./');
      if (indice) return indice;
    }

    const guardada = await cache.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;

    try {
      const respuesta = await fetch(peticion);
      // Guarda lo que falte (por ejemplo, un archivo nuevo no listado) para la próxima vez.
      if (respuesta.ok && respuesta.type === 'basic') {
        cache.put(peticion, respuesta.clone()).catch(() => {});
      }
      return respuesta;
    } catch (error) {
      if (peticion.mode === 'navigate') {
        const indice = await cache.match('./index.html');
        if (indice) return indice;
      }
      return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión', headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
