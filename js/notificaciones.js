/*
 * MicroApp Gym — notificaciones.js
 * Avisos de racha (PLAN §3 y §9.8): permiso, notificación al terminar la sesión, datos para el
 * recordatorio de los días de entrenamiento (Periodic Background Sync en sw.js) y aviso de
 * respaldo al abrir la app. La racha la calcula progress.js; aquí solo se muestra.
 *
 * Nada de esto lanza: sin soporte (navegador sin Notification, sin service worker, sin
 * periodicSync) cada función devuelve un estado y la app sigue igual.
 *
 * API
 *   hayNotificaciones()             -> boolean (Notification + service worker + origen seguro)
 *   permiso()                       -> 'granted' | 'denied' | 'default' | 'no-disponible'
 *   pedirPermiso()                  -> Promise<'granted' | 'denied' | 'default' | 'no-disponible'>
 *   mostrar(titulo, { body, tag? }) -> Promise<boolean> (registration.showNotification)
 *   notificarFinSesion(storage, progresion, hoy)  -> Promise<boolean>
 *       "🔥 ¡Racha de 7!" / "🏆 ¡10 entrenamientos seguidos!" + próximo entrenamiento.
 *       Solo si config.notificaciones.racha y el permiso está concedido.
 *   textoRecordatorio(diaNombre, racha) -> 'Hoy toca Pierna A. Llevas 7 seguidos, ¡no la pierdas! 🔥'
 *       (el mismo texto lo construye sw.js; si cambias uno, cambia el otro)
 *   actualizarDatos(storage, hoy)   -> Promise<datos | null>  escribe 'mag-datos' (ver storage.js)
 *   estadoPeriodico()               -> Promise<'registrado' | 'sin-registrar' | 'sin-permiso' | 'no-disponible'>
 *   registrarPeriodico()            -> Promise<igual que estadoPeriodico()>
 *   desregistrarPeriodico()         -> Promise<void>
 *   avisoAlAbrir(storage, hoy)      -> Promise<texto | null>  respaldo del recordatorio: el texto
 *       del aviso si hoy toca, no se ha entrenado ni avisado hoy y los avisos están activados
 *       (marca la fecha como avisada); la app lo enseña como aviso breve.
 */

import * as planner from './planner.js';
import { calcularRacha } from './progress.js';

export const TAG = 'mag-racha';
export const CACHE_DATOS = 'mag-datos';
const RUTA_DATOS = './mag-datos/racha.json';
const DOCE_HORAS = 12 * 60 * 60 * 1000;
const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/* ---------- Soporte y permiso ---------- */

export function hayNotificaciones() {
  return typeof window !== 'undefined' && 'Notification' in window
    && 'serviceWorker' in navigator && window.isSecureContext === true;
}

export function permiso() {
  if (!hayNotificaciones()) return 'no-disponible';
  try {
    return Notification.permission;
  } catch {
    return 'no-disponible';
  }
}

export async function pedirPermiso() {
  if (!hayNotificaciones()) return 'no-disponible';
  try {
    if (Notification.permission !== 'default') return Notification.permission;
    return await Notification.requestPermission();
  } catch (e) {
    console.warn('[notificaciones] No se pudo pedir el permiso', e);
    return permiso();
  }
}

/** Registro del service worker o null (sin esperar para siempre si no hay ninguno). */
async function registro(ms = 4000) {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const listo = navigator.serviceWorker.ready;
    const tiempo = new Promise((r) => setTimeout(() => r(null), ms));
    return await Promise.race([listo, tiempo]);
  } catch {
    return null;
  }
}

const urlIcono = (reg, archivo) => new URL(`icons/${archivo}`, reg ? reg.scope : document.baseURI).href;

export async function mostrar(titulo, { body = '', tag = TAG } = {}) {
  if (permiso() !== 'granted') return false;
  const reg = await registro();
  if (!reg || typeof reg.showNotification !== 'function') return false;
  try {
    await reg.showNotification(titulo, {
      body,
      tag,
      renotify: true,
      icon: urlIcono(reg, 'icon-192.png'),
      badge: urlIcono(reg, 'badge-96.png'),
      lang: 'es',
      data: { url: './#hoy' },
    });
    return true;
  } catch (e) {
    console.warn('[notificaciones] No se pudo mostrar la notificación', e);
    return false;
  }
}

/* ---------- Textos ---------- */

function aFechaLocal(texto) {
  const [a, m, d] = String(texto).split('-').map(Number);
  return new Date(a, m - 1, d);
}

function textoProximo(storage, hoy) {
  try {
    const rutina = storage.get(storage.CLAVES.rutina, null);
    const prox = rutina ? planner.proximoEntreno(rutina, storage.getConfig(), hoy) : null;
    if (!prox) return '';
    return `Próximo entrenamiento: ${NOMBRES_DIA[aFechaLocal(prox.fecha).getDay()]}, ${prox.dia.nombre}`;
  } catch {
    return '';
  }
}

export function textoRecordatorio(diaNombre, racha) {
  const n = Number(racha) || 0;
  return n > 0
    ? `Hoy toca ${diaNombre}. Llevas ${n} ${n === 1 ? 'seguido' : 'seguidos'}, ¡no la pierdas! 🔥`
    : `Hoy toca ${diaNombre}. ¡Empieza tu racha! 🔥`;
}

export async function notificarFinSesion(storage, progresion, hoy) {
  try {
    if (!progresion || !progresion.racha) return false;
    if (storage.getConfig().notificaciones.racha !== true || permiso() !== 'granted') return false;
    const { despues, hito } = progresion.racha;
    const proximo = textoProximo(storage, hoy);
    if (hito) {
      return await mostrar(`🏆 ¡${hito} entrenamientos seguidos!`, {
        body: `Nuevo hito de racha. ¡Sigue así!${proximo ? ` ${proximo}.` : ''}`,
      });
    }
    return await mostrar(`🔥 ¡Racha de ${despues}!`, { body: proximo || '¡Buen trabajo!' });
  } catch (e) {
    console.warn('[notificaciones] Aviso de fin de sesión fallido', e);
    return false;
  }
}

/* ---------- Datos para el service worker (Cache Storage 'mag-datos') ---------- */

function sumarDias(texto, n) {
  const f = aFechaLocal(texto);
  f.setDate(f.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
}

async function leerDatos() {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(CACHE_DATOS);
    const r = await cache.match(new URL(RUTA_DATOS, document.baseURI).href);
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

async function escribirDatos(datos) {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(CACHE_DATOS);
    await cache.put(new URL(RUTA_DATOS, document.baseURI).href, new Response(JSON.stringify(datos), {
      headers: { 'Content-Type': 'application/json' },
    }));
    return true;
  } catch (e) {
    console.warn('[notificaciones] No se pudieron guardar los datos del recordatorio', e);
    return false;
  }
}

/** Calcula el JSON del recordatorio a partir de lo guardado (sin escribirlo). */
export function calcularDatos(storage, hoy, ultimaNotificada = null) {
  const config = storage.getConfig();
  const rutina = config.configurado ? storage.get(storage.CLAVES.rutina, null) : null;
  const lista = storage.get(storage.CLAVES.sesiones, []);
  const sesiones = Array.isArray(lista) ? lista.filter((s) => s && s.terminada === true) : [];
  const desde = sumarDias(hoy, -21);
  const proximos = [];
  if (rutina) {
    for (let i = 0; i < 14; i++) {
      const fecha = sumarDias(hoy, i);
      try {
        const { dia } = planner.diaParaFecha(rutina, config, fecha);
        if (dia) proximos.push({ fecha, diaNombre: dia.nombre });
      } catch { /* día sin datos: se omite */ }
    }
  }
  let racha = 0;
  try {
    racha = rutina ? calcularRacha(sesiones, config, rutina, hoy).actual : 0;
  } catch { racha = 0; }
  return {
    version: 1,
    activado: config.notificaciones.racha === true && Boolean(rutina),
    escritoEn: hoy,
    racha,
    proximos,
    entrenadas: [...new Set(sesiones.map((s) => s.fecha).filter((f) => typeof f === 'string' && f >= desde))].sort(),
    ultimaNotificada,
  };
}

export async function actualizarDatos(storage, hoy) {
  try {
    const previos = await leerDatos();
    const datos = calcularDatos(storage, hoy, previos && previos.ultimaNotificada ? previos.ultimaNotificada : null);
    return (await escribirDatos(datos)) ? datos : null;
  } catch (e) {
    console.warn('[notificaciones] Error al preparar los datos del recordatorio', e);
    return null;
  }
}

/* ---------- Periodic Background Sync ---------- */

async function permisoPeriodico() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return 'no-disponible';
    const r = await navigator.permissions.query({ name: 'periodic-background-sync' });
    return r.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'no-disponible';
  }
}

export async function estadoPeriodico() {
  const reg = await registro(2500);
  if (!reg || !('periodicSync' in reg)) return 'no-disponible';
  const estado = await permisoPeriodico();
  if (estado === 'no-disponible') return 'no-disponible';
  if (estado !== 'granted') return 'sin-permiso';
  try {
    const tags = await reg.periodicSync.getTags();
    return tags.includes(TAG) ? 'registrado' : 'sin-registrar';
  } catch {
    return 'sin-registrar';
  }
}

export async function registrarPeriodico() {
  const reg = await registro(2500);
  if (!reg || !('periodicSync' in reg)) return 'no-disponible';
  const estado = await permisoPeriodico();
  if (estado === 'no-disponible') return 'no-disponible';
  if (estado !== 'granted') return 'sin-permiso';
  try {
    await reg.periodicSync.register(TAG, { minInterval: DOCE_HORAS });
    return 'registrado';
  } catch (e) {
    console.info('[notificaciones] Periodic Background Sync no se ha podido registrar', e);
    return 'sin-permiso';
  }
}

export async function desregistrarPeriodico() {
  const reg = await registro(2500);
  if (!reg || !('periodicSync' in reg)) return;
  try {
    await reg.periodicSync.unregister(TAG);
  } catch { /* nada que quitar */ }
}

/* ---------- Respaldo: aviso al abrir la app ---------- */

export async function avisoAlAbrir(storage, hoy) {
  try {
    const config = storage.getConfig();
    // Sin permiso (revocado o copia importada en otro móvil) no se avisa: el interruptor sale apagado.
    if (config.notificaciones.racha !== true || permiso() !== 'granted') return null;
    const previos = await leerDatos();
    if (previos && previos.ultimaNotificada === hoy) return null;
    const datos = calcularDatos(storage, hoy, previos ? previos.ultimaNotificada : null);
    const deHoy = datos.proximos.find((p) => p.fecha === hoy);
    if (!datos.activado || !deHoy || datos.entrenadas.includes(hoy)) return null;
    // Avisado hoy: el recordatorio en segundo plano ya no se repite.
    await escribirDatos({ ...datos, ultimaNotificada: hoy });
    return textoRecordatorio(deHoy.diaNombre, datos.racha);
  } catch {
    return null;
  }
}

/** Ajusta el registro periódico a la configuración (al arrancar). */
export async function sincronizarPeriodico(storage) {
  try {
    if (storage.getConfig().notificaciones.racha === true && permiso() === 'granted') return await registrarPeriodico();
    await desregistrarPeriodico();
    return 'sin-registrar';
  } catch {
    return 'no-disponible';
  }
}
