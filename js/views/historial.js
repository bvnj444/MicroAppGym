/*
 * Pantalla Historial: sesiones terminadas reales (CLAVES.sesiones), de la más
 * reciente a la más antigua, con fecha, nombre del día, duración y volumen.
 * La lista completa con gráficas y mejores marcas llega en la Fase 7.
 */

import { resumen } from '../workout.js';

const formatoFecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const formatoNumero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Volumen en gramos: peso × repeticiones de las series hechas. */
// Mismo cálculo que el resumen de la sesión (par de mancuernas ×2).
function volumenGramos(sesion) {
  try {
    return resumen(sesion).volumen || 0;
  } catch {
    return 0;
  }
}

function textoFecha(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha));
  return m ? formatoFecha.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : 'Fecha desconocida';
}

function minutos(sesion) {
  const ms = Date.parse(sesion.fin) - Date.parse(sesion.inicio);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : null;
}

export function render(contenedor, ctx) {
  const { storage } = ctx;
  const guardadas = storage.get(storage.CLAVES.sesiones, []);
  const sesiones = (Array.isArray(guardadas) ? guardadas : [])
    .filter((s) => s && s.terminada === true)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.inicio).localeCompare(String(a.inicio)));

  // Nombre del día a partir de la rutina guardada (sin generar nada).
  const rutina = storage.get(storage.CLAVES.rutina, null);
  const nombres = new Map(((rutina && rutina.dias) || []).map((d) => [d.id, d.nombre]));

  let cuerpo;
  if (!sesiones.length) {
    cuerpo = `
      <div class="empty-state">
        <p>Aún no hay sesiones. Tu primera sesión aparecerá aquí.</p>
      </div>`;
  } else {
    const volumenTotal = sesiones.reduce((t, s) => t + volumenGramos(s), 0);
    cuerpo = `
      <div class="row">
        <div class="stat">
          <span class="stat__value">${sesiones.length}</span>
          <span class="stat__label">${sesiones.length === 1 ? 'sesión' : 'sesiones'}</span>
        </div>
        ${volumenTotal > 0 ? `
        <div class="stat">
          <span class="stat__value">${formatoNumero.format(volumenTotal / 1000)}</span>
          <span class="stat__label">kg de volumen</span>
        </div>` : ''}
      </div>
      ${sesiones.map((s) => {
        const vol = volumenGramos(s);
        const min = minutos(s);
        return `
      <article class="card">
        <p class="card__meta">${textoFecha(s.fecha)}${min ? ` · ${min} min` : ''}</p>
        <h2 class="card__title">${esc(nombres.get(s.diaId) || s.diaId || 'Sesión')}</h2>
        ${vol > 0 ? `<p><span class="accent">${formatoNumero.format(vol / 1000)} kg</span> <span class="muted">de volumen</span></p>` : ''}
      </article>`;
      }).join('')}`;
  }

  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">Sesiones terminadas</p>
        <h1 class="screen__title">Historial</h1>
      </div>
    </header>

    <div class="stack">${cuerpo}</div>
  `;
}
