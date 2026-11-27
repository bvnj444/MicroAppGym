/*
 * MicroApp Gym — cierre-sesion.js
 * Lo que pasa al ARCHIVAR una sesión terminada (Fase 7), en un único sitio que usa
 * views/sesion.js → archivarSesion (también cuando la sesión termina fuera de #sesion o desde
 * "Empezar de nuevo" en Rutina):
 *   1. marcasNuevas, sugerirProgresion y racha antes/después (progress.js, lógica pura);
 *   2. APLICA las sugerencias con cambios a la rutina guardada (aplicarProgresion);
 *   3. guarda `progresion` COMPACTA (storage.compactarProgresion: sin cambios/paso/diaId…, solo
 *      las 3 marcas que se enseñan) en el registro de la sesión y `deshacerProgresion` en meta
 *      (formas en los CONTRATOS de storage.js);
 *   4. aviso de racha (notificaciones.js) y datos del recordatorio para el service worker.
 * Es idempotente: una sesión que ya tiene `progresion` no se vuelve a evaluar ni a aplicar.
 *
 * API
 *   prepararCierre(storage, sesionTerminada, sesionesGuardadas, ahora?)
 *       -> { sesion (con progresion compacta), rutinaNueva | null, rutinaAnterior | null, nuevo: boolean,
 *            + si nuevo: sugerencias (completas, de progress.js), racha { antes, despues, hito },
 *              record, hoy }
 *       No escribe nada. sesionesGuardadas = lo que hay en CLAVES.sesiones (puede incluir la misma).
 *   completarCierre(storage, cierre, ahora?) -> void
 *       Tras guardar la sesión: rutina nueva, meta (deshacerProgresion, rachaRecord), aviso y datos
 *       del SW. Si el cierre no es nuevo no hace nada.
 *   puedeDeshacer(storage, sesion)   -> boolean (hubo cambios, no deshechos, y la rutina guardada
 *                                       sigue siendo la que dejó esa progresión)
 *   deshacerProgresion(storage, sesionId) -> boolean
 *   htmlProgresion(progresion, { deshacer = false, racha = true } = {}) -> HTML (sin envoltorio)
 *   marcasRelevantes(marcas, max = 3) -> las más relevantes (peso > repeticiones > segundos > volumen,
 *                                        una por ejercicio primero)
 *   huella(valor)                    -> texto corto estable (para comparar rutinas)
 *   fechaLocal(ms?)                  -> 'AAAA-MM-DD' local
 */

import * as progress from './progress.js';
import * as planner from './planner.js';
import { nombreEjercicio } from './workout.js';
import { kg } from './data/equipment.js';
import { notificarFinSesion, actualizarDatos } from './notificaciones.js';
import { compactarProgresion, marcasRelevantes } from './storage.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fechaLocal(ms = Date.now()) {
  const f = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
}

export function huella(valor) {
  const texto = JSON.stringify(valor ?? null);
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return 'h' + h.toString(36) + texto.length.toString(36);
}

const terminadas = (lista) => (Array.isArray(lista) ? lista : []).filter((s) => s && s.terminada === true);

/* ---------- Cierre ---------- */

export function prepararCierre(st, sesion, guardadas, ahora = Date.now()) {
  const previa = (Array.isArray(guardadas) ? guardadas : []).find((s) => s && s.id === sesion.id);
  if (sesion.progresion) {
    return { sesion: { ...sesion, progresion: compactarProgresion(sesion.progresion) }, rutinaNueva: null, rutinaAnterior: null, nuevo: false };
  }
  if (previa && previa.progresion) {
    return { sesion: { ...sesion, progresion: compactarProgresion(previa.progresion) }, rutinaNueva: null, rutinaAnterior: null, nuevo: false };
  }

  const otras = terminadas(guardadas).filter((s) => s.id !== sesion.id);
  const config = st.getConfig();
  const rutina = config.configurado === true ? st.get(st.CLAVES.rutina, null) : null;
  const hoy = fechaLocal(ahora);

  let sugerencias = [];
  let marcas = [];
  let antes = 0;
  let despues = 0;
  let record = 0;
  try { marcas = progress.marcasNuevas(sesion, otras); } catch (e) { console.error('[cierre] marcas', e); }
  const rutinaUsable = rutina && Array.isArray(rutina.dias) && !planner.necesitaRegenerar(rutina, config);
  if (rutinaUsable) {
    try { sugerencias = progress.sugerirProgresion(rutina, otras, sesion, config); } catch (e) { console.error('[cierre] sugerencias', e); }
    try {
      // Sesión de un día anterior (p. ej. cerrada tras medianoche): "antes" se mide en el día de
      // la sesión, que entonces estaba pendiente (no roto); "después", con la fecha real.
      const hoyAntes = typeof sesion.fecha === 'string' && sesion.fecha < hoy ? sesion.fecha : hoy;
      antes = progress.calcularRacha(otras, config, rutina, hoyAntes).actual;
      const r = progress.calcularRacha([...otras, sesion], config, rutina, hoy);
      despues = r.actual;
      record = r.record;
    } catch (e) { console.error('[cierre] racha', e); }
  }

  let rutinaNueva = null;
  if (rutinaUsable && sugerencias.some((s) => s.cambios && Object.keys(s.cambios).length)) {
    try {
      const nueva = progress.aplicarProgresion(rutina, sugerencias, config);
      if (huella(nueva) !== huella(rutina)) rutinaNueva = nueva;
    } catch (e) {
      console.error('[cierre] No se pudo aplicar la progresión', e);
    }
  }

  const racha = { antes, despues, hito: progress.hitoAlcanzado(antes, despues) };
  // Se guarda solo lo que se pinta después (resumen e Historial): ver CONTRATOS de storage.js.
  const progresion = compactarProgresion({
    sugerencias,
    marcas: marcasRelevantes(marcas),
    racha,
    aplicada: Boolean(rutinaNueva),
  });
  return {
    sesion: { ...sesion, progresion }, rutinaNueva, rutinaAnterior: rutinaNueva ? rutina : null, nuevo: true,
    sugerencias, racha, record, hoy,
  };
}

export function completarCierre(st, cierre, ahora = Date.now()) {
  if (!cierre || !cierre.nuevo) return;
  const meta = { ...(st.get(st.CLAVES.meta, {}) || {}) };
  if (cierre.rutinaNueva) {
    // Solo un cierre que cambia la rutina sustituye el "deshacer" anterior.
    if (st.set(st.CLAVES.rutina, cierre.rutinaNueva)) {
      meta.deshacerProgresion = { sesionId: cierre.sesion.id, rutina: cierre.rutinaAnterior, huella: huella(cierre.rutinaNueva) };
    } else {
      console.error('[cierre] No se pudo guardar la rutina con la progresión');
    }
  }
  const record = Math.max(Number(meta.rachaRecord) || 0, Number(cierre.record) || 0);
  if (record > 0) meta.rachaRecord = record;
  st.set(st.CLAVES.meta, meta);

  if (typeof window === 'undefined') return;
  const hoy = cierre.hoy || fechaLocal(ahora);
  // Avisos en segundo plano: no bloquean ni rompen el cierre.
  notificarFinSesion(st, cierre.sesion.progresion, hoy).catch(() => {});
  actualizarDatos(st, hoy).catch(() => {});
}

/* ---------- Deshacer ---------- */

export function puedeDeshacer(st, sesion) {
  const p = sesion && sesion.progresion;
  if (!p || !p.aplicada || p.deshecha) return false;
  const meta = st.get(st.CLAVES.meta, {}) || {};
  const d = meta.deshacerProgresion;
  if (!d || d.sesionId !== sesion.id || !d.rutina) return false;
  return huella(st.get(st.CLAVES.rutina, null)) === d.huella;
}

export function deshacerProgresion(st, sesionId) {
  const meta = st.get(st.CLAVES.meta, {}) || {};
  const d = meta.deshacerProgresion;
  if (!d || d.sesionId !== sesionId || !d.rutina) return false;
  if (huella(st.get(st.CLAVES.rutina, null)) !== d.huella) return false;
  if (!st.set(st.CLAVES.rutina, d.rutina)) return false;
  const { deshacerProgresion: _quitado, ...resto } = meta;
  st.set(st.CLAVES.meta, resto);
  const lista = st.get(st.CLAVES.sesiones, []);
  if (Array.isArray(lista)) {
    st.set(st.CLAVES.sesiones, lista.map((s) => (s && s.id === sesionId && s.progresion
      ? { ...s, progresion: compactarProgresion({ ...s.progresion, deshecha: true }) } : s)));
  }
  return true;
}

/* ---------- Presentación ---------- */

// La elección vive en storage.js: es también lo que se guarda en progresion.marcas.
export { marcasRelevantes };

export function textoMarca(m) {
  const v = m.tipo === 'peso' ? kg(m.valor)
    : m.tipo === 'repeticiones' ? `${m.valor} ${m.valor === 1 ? 'repetición' : 'repeticiones'}`
      : m.tipo === 'segundos' ? `${m.valor} s`
        : `${kg(m.valor)} de volumen`;
  const a = m.anterior === null || m.anterior === undefined ? ''
    : m.tipo === 'peso' || m.tipo === 'volumen' ? kg(m.anterior)
      : m.tipo === 'segundos' ? `${m.anterior} s` : String(m.anterior);
  return a ? `${v} (antes ${a})` : v;
}

const ACCION = {
  'subir-peso': { clase: 'prog__item--subir', icono: '▲', sr: 'Subir peso' },
  'bajar-peso': { clase: 'prog__item--bajar', icono: '▼', sr: 'Bajar peso' },
  variante: { clase: 'prog__item--variante', icono: '★', sr: 'Siguiente variante' },
  'subir-tiempo': { clase: 'prog__item--subir', icono: '▲', sr: 'Más tiempo' },
};

function itemSugerencia(s) {
  const a = ACCION[s.accion];
  return `
      <li class="prog__item ${a ? a.clase : 'prog__item--mantener'}">
        <span class="prog__icon" aria-hidden="true">${a ? a.icono : '='}</span>
        <span class="prog__text">
          <strong class="prog__name">${a ? `<span class="sr-only">${a.sr}: </span>` : ''}${esc(nombreEjercicio(s.ejercicioId))}</strong>
          <span class="prog__desc">${esc(s.texto)}</span>
        </span>
      </li>`;
}

export function htmlProgresion(p, { deshacer = false, racha = true } = {}) {
  if (!p || typeof p !== 'object') return '';
  const sugerencias = Array.isArray(p.sugerencias) ? p.sugerencias : [];
  const cambios = sugerencias.filter((s) => s && s.accion !== 'mantener');
  const mantener = sugerencias.filter((s) => s && s.accion === 'mantener');
  const marcas = marcasRelevantes(p.marcas);
  const partes = [];

  if (racha && p.racha && Number(p.racha.despues) > 0) {
    const n = Number(p.racha.despues);
    partes.push(`<p class="streak prog__streak">Racha de <strong>${n}</strong></p>`);
    if (p.racha.hito) {
      partes.push(`<p class="prog__hito" role="status">🏆 ¡Hito alcanzado: ${Number(p.racha.hito) || 0} entrenamientos seguidos!</p>`);
    }
  }

  if (marcas.length) {
    partes.push(`
      <ul class="prog__records" aria-label="Nuevas marcas">
        ${marcas.map((m) => `
        <li class="prog__record">
          <span class="prog__badge">¡Nueva marca!</span>
          <span><strong>${esc(nombreEjercicio(m.ejercicioId))}</strong> · ${esc(textoMarca(m))}</span>
        </li>`).join('')}
      </ul>`);
  }

  if (cambios.length) {
    partes.push(`
      <h3 class="prog__heading">${p.aplicada && !p.deshecha ? 'Cambios aplicados a tu rutina' : 'Sugerencias para la próxima vez'}</h3>
      <ul class="prog__list">${cambios.map(itemSugerencia).join('')}</ul>`);
  }
  if (mantener.length) {
    partes.push(`
      <details class="prog__keep">
        <summary>Sin cambios (${mantener.length})</summary>
        <ul class="prog__list">${mantener.map(itemSugerencia).join('')}</ul>
      </details>`);
  }

  if (p.deshecha) {
    partes.push('<p class="muted">Cambios deshechos: la rutina sigue como estaba.</p>');
  } else if (deshacer) {
    partes.push('<button type="button" class="btn btn--secondary btn--block" data-accion="deshacer-progresion">Deshacer cambios de progresión</button>');
  }
  return partes.join('');
}
