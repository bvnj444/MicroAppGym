/*
 * MicroApp Gym — service worker.
 * Caché versionada: al cambiar CUALQUIER archivo de la app, sube CACHE
 * (gym-v2, gym-v3...) y añade aquí los archivos nuevos.
 * Rutas relativas a este archivo: funciona en la raíz y en /repo/ de GitHub Pages.
 *
 * Avisos de racha (Fase 7, PLAN §9.8):
 *  - 'notificationclick': cierra la notificación, enfoca una ventana de la app y la lleva a #hoy
 *    (postMessage { tipo: 'mag-navegar', ruta: 'hoy' }, que escucha app.js), o abre './#hoy'.
 *  - 'periodicsync' (tag 'mag-racha'): lee el JSON que escribe js/notificaciones.js en la caché
 *    'mag-datos' (el SW no puede leer localStorage) y, si hoy toca entrenar, no se ha entrenado
 *    ni avisado hoy, muestra "Hoy toca Pierna A. Llevas 7 seguidos, ¡no la pierdas! 🔥".
 *  - 'activate' solo borra las cachés 'gym-*': 'mag-datos' se conserva entre versiones.
 */

const CACHE = 'gym-v9';
const CACHE_DATOS = 'mag-datos';
const RUTA_DATOS = './mag-datos/racha.json';
const TAG_RACHA = 'mag-racha';

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
  './js/planner.js',
  './js/animations.js',
  './js/timer.js',
  './js/workout.js',
  './js/progress.js',
  './js/notificaciones.js',
  './js/cierre-sesion.js',
  './js/data/exercises.js',
  './js/data/routines.js',
  './js/data/equipment.js',
  './js/views/hoy.js',
  './js/views/rutina.js',
  './js/views/sesion.js',
  './js/views/ejercicios.js',
  './js/views/historial.js',
  './js/views/config.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/badge-96.png',
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

/* ---------- Avisos de racha ---------- */

const urlDeAlcance = (ruta) => new URL(ruta, self.registration.scope).href;

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = urlDeAlcance((evento.notification.data && evento.notification.data.url) || './#hoy');
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const alcance = self.registration.scope;
    const deLaApp = ventanas.filter((c) => c.url.startsWith(alcance));
    const ventana = deLaApp.find((c) => c.focused) || deLaApp.find((c) => c.visibilityState === 'visible') || deLaApp[0];
    if (ventana) {
      try {
        await ventana.focus();
      } catch { /* sin permiso para enfocar: se navega igual */ }
      ventana.postMessage({ tipo: 'mag-navegar', ruta: 'hoy' });
      return;
    }
    await self.clients.openWindow(destino);
  })());
});

/** 'AAAA-MM-DD' en la hora local del dispositivo (el SW no tiene el helper de la app). */
function fechaLocal(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

/** Mismo texto que notificaciones.textoRecordatorio (si cambias uno, cambia el otro). */
function textoRecordatorio(diaNombre, racha) {
  const n = Number(racha) || 0;
  return n > 0
    ? `Hoy toca ${diaNombre}. Llevas ${n} ${n === 1 ? 'seguido' : 'seguidos'}, ¡no la pierdas! 🔥`
    : `Hoy toca ${diaNombre}. ¡Empieza tu racha! 🔥`;
}

async function recordatorioRacha() {
  const cache = await caches.open(CACHE_DATOS);
  const clave = urlDeAlcance(RUTA_DATOS);
  const respuesta = await cache.match(clave);
  if (!respuesta) return;
  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    return;
  }
  if (!datos || datos.activado !== true) return;
  if (self.Notification && self.Notification.permission !== 'granted') return;

  const hoy = fechaLocal();
  const proximos = Array.isArray(datos.proximos) ? datos.proximos : [];
  const entrenadas = Array.isArray(datos.entrenadas) ? datos.entrenadas : [];
  const deHoy = proximos.find((p) => p && p.fecha === hoy);
  if (!deHoy || entrenadas.includes(hoy) || datos.ultimaNotificada === hoy) return;

  // La racha se escribió el día `escritoEn`; si desde entonces pasó un día de entrenamiento sin
  // sesión, ya se ha roto.
  const rota = proximos.some((p) => p && p.fecha >= String(datos.escritoEn || '') && p.fecha < hoy && !entrenadas.includes(p.fecha));
  const racha = rota ? 0 : Number(datos.racha) || 0;

  await self.registration.showNotification(racha > 0 ? '🔥 ¡Hoy toca entrenar!' : '💪 ¡Hoy toca entrenar!', {
    body: textoRecordatorio(deHoy.diaNombre, racha),
    tag: TAG_RACHA,
    renotify: true,
    icon: urlDeAlcance('./icons/icon-192.png'),
    badge: urlDeAlcance('./icons/badge-96.png'),
    lang: 'es',
    data: { url: './#hoy' },
  });
  await cache.put(clave, new Response(JSON.stringify({ ...datos, ultimaNotificada: hoy }), {
    headers: { 'Content-Type': 'application/json' },
  }));
}

self.addEventListener('periodicsync', (evento) => {
  if (evento.tag !== TAG_RACHA) return;
  evento.waitUntil(recordatorioRacha().catch(() => {}));
});
