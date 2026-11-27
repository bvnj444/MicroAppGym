/*
 * Pantalla Historial (PLAN §9.7, Fase 7). Tres vistas en pestañas:
 *  - Sesiones: sesiones terminadas (CLAVES.sesiones), la más reciente arriba, con fecha, día,
 *    duración, volumen y series; al tocar se despliegan los pesos × repeticiones de cada serie y
 *    la progresión guardada (registro.progresion, si existe). De 20 en 20 ("Ver más").
 *  - Progreso: gráfica SVG hecha a mano por ejercicio (progress.datosGrafica) con selector de
 *    ejercicio y de campo; tabla oculta con los datos para lectores de pantalla.
 *  - Marcas: mejores marcas por ejercicio (progress.mejoresMarcas).
 * Volumen = workout.resumen(sesion).volumen (el mismo cálculo que el resumen de la sesión).
 */

import { resumen, nombreEjercicio } from '../workout.js';
import * as planner from '../planner.js';
import * as progress from '../progress.js';
import { kg } from '../data/equipment.js';
import { htmlProgresion } from '../cierre-sesion.js';

const POR_PAGINA = 20;
const MAX_PUNTOS = 20;

const formatoFecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const formatoCorto = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
const formatoNumero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Estado de la pantalla mientras la app está abierta.
const estado = { pestana: 'sesiones', visibles: POR_PAGINA, ejercicio: null, campo: null };
let ctxActual = null;

/* ---------- Utilidades ---------- */

function aFecha(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function textoFecha(fecha) {
  const f = aFecha(fecha);
  return f ? formatoFecha.format(f) : 'Fecha desconocida';
}

function fechaCorta(fecha) {
  const f = aFecha(fecha);
  return f ? formatoCorto.format(f).replace('.', '') : '';
}

function resumenSeguro(sesion) {
  try {
    return resumen(sesion);
  } catch {
    return { volumen: 0, seriesHechas: 0, porEjercicio: [] };
  }
}

function minutos(sesion) {
  const ms = Date.parse(sesion.fin) - Date.parse(sesion.inicio);
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60000)) : null;
}

const kgCorto = (g) => kg(g).replace(/\s*kg$/, '');
const volumenKg = (g) => `${formatoNumero.format(g / 1000)} kg`;

function sesionesTerminadas(storage) {
  const guardadas = storage.get(storage.CLAVES.sesiones, []);
  return (Array.isArray(guardadas) ? guardadas : [])
    .filter((s) => s && s.terminada === true && Array.isArray(s.ejercicios))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.inicio).localeCompare(String(a.inicio)));
}

/* ---------- Sesiones ---------- */

function textoSeries(item) {
  const tipo = planner.tipoMontaje(item);
  const tiempo = Array.isArray(item.segundos);
  const hechas = (item.series || []).filter((s) => s && s.hecha);
  if (!hechas.length) return item.saltado ? 'Saltado' : 'Sin series hechas';
  // "16,75 kg × 11 · 16,75 × 10" (la unidad solo en la primera serie con peso).
  let conUnidad = false;
  const partes = hechas.map((s) => {
    if (tiempo) return `${Number(s.segundos) || 0} s`;
    const reps = Number(s.repeticiones) || 0;
    if (!tipo || !(Number(s.peso) > 0)) return `${reps} reps`;
    const peso = conUnidad ? kgCorto(Number(s.peso)) : kg(Number(s.peso));
    conUnidad = true;
    return `${peso} × ${reps}`;
  });
  const extra = tipo === 'par-mancuernas' && conUnidad ? ' (por mancuerna)' : '';
  return `${partes.join(' · ')}${extra}${item.saltado ? ' · resto saltado' : ''}`;
}

function htmlSesion(s, nombres) {
  const r = resumenSeguro(s);
  const min = minutos(s);
  const nombre = s.diaNombre || nombres.get(s.diaId) || s.diaId || 'Sesión';
  const datos = [
    min ? `${min} min` : null,
    r.volumen > 0 ? volumenKg(r.volumen) : null,
    `${r.seriesHechas} ${r.seriesHechas === 1 ? 'serie' : 'series'}`,
  ].filter(Boolean).join(' · ');
  const ejercicios = s.ejercicios.filter(Boolean).map((item) => `
          <li class="hist-session__exercise">
            <strong>${esc(nombreEjercicio(item.ejercicioId))}</strong>
            <span class="muted">${esc(textoSeries(item))}</span>
          </li>`).join('');
  const prog = htmlProgresion(s.progresion, { racha: true });
  return `
      <li>
        <details class="card hist-session">
          <summary class="hist-session__summary">
            <span class="hist-session__date">${esc(textoFecha(s.fecha))}</span>
            <span class="hist-session__name">${esc(nombre)}</span>
            <span class="hist-session__meta">${esc(datos)}</span>
          </summary>
          <div class="hist-session__body stack">
            <ul class="hist-session__exercises">${ejercicios}</ul>
            ${prog ? `<div class="hist-session__prog stack">${prog}</div>` : ''}
          </div>
        </details>
      </li>`;
}

function vistaSesiones(sesiones, nombres) {
  const visibles = sesiones.slice(0, estado.visibles);
  const quedan = sesiones.length - visibles.length;
  return `
    <ol class="hist-sessions" aria-label="Sesiones terminadas">${visibles.map((s) => htmlSesion(s, nombres)).join('')}</ol>
    ${quedan > 0 ? `<button type="button" class="btn btn--secondary btn--block" data-accion="ver-mas">Ver más (${quedan} ${quedan === 1 ? 'sesión' : 'sesiones'})</button>` : ''}`;
}

/* ---------- Gráfica ---------- */

const CAMPOS = {
  pesoMax: 'Peso máximo',
  volumen: 'Volumen',
  mejorSerie: 'Mejor serie',
};

function etiquetaCampo(id, campo) {
  if (campo !== 'mejorSerie') return CAMPOS[campo];
  const u = progress.unidadGrafica(id, campo);
  return u === 's' ? 'Mejor tiempo' : u === 'reps' ? 'Más repeticiones' : 'Mejor serie (1RM estimado)';
}

function camposDe(id) {
  return progress.unidadGrafica(id, 'mejorSerie') === 'g' ? ['pesoMax', 'volumen', 'mejorSerie'] : ['mejorSerie'];
}

/** Valor ya redondeado para mostrar. */
function redondear(v, campo, unidad) {
  if (unidad !== 'g') return Math.round(v);
  if (campo === 'volumen') return Math.round(v / 1000) * 1000;
  if (campo === 'mejorSerie') return Math.round(v / 100) * 100;
  return v;
}

function formatoValor(v, unidad, conUnidad = true) {
  if (unidad === 'g') return conUnidad ? kg(v) : kgCorto(v);
  if (unidad === 's') return `${v}${conUnidad ? ' s' : ''}`;
  return `${v}${conUnidad ? ' reps' : ''}`;
}

function ejerciciosConHistorial(sesiones) {
  const cuenta = new Map();
  for (const s of sesiones) {
    for (const item of s.ejercicios) {
      if (!item || !(item.series || []).some((x) => x && x.hecha)) continue;
      const c = cuenta.get(item.ejercicioId) || { n: 0, ultima: '' };
      c.n += 1;
      if (String(s.fecha) > c.ultima) c.ultima = String(s.fecha);
      cuenta.set(item.ejercicioId, c);
    }
  }
  return [...cuenta.entries()].map(([id, c]) => ({ id, nombre: nombreEjercicio(id), ...c }));
}

function svgGrafica(puntos, unidad, campo) {
  const W = 320;
  const H = 190;
  const izq = 52;
  const der = 14;
  const arriba = 30;
  const abajo = 26;
  const valores = puntos.map((p) => p.valor);
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (min === max) {
    const margen = Math.max(Math.abs(max) * 0.1, unidad === 'g' ? 1000 : 1);
    min -= margen;
    max += margen;
  } else {
    const margen = (max - min) * 0.12;
    min -= margen;
    max += margen;
  }
  if (Math.min(...valores) >= 0 && min < 0) min = 0;
  const ancho = W - izq - der;
  const alto = H - arriba - abajo;
  const x = (i) => (puntos.length === 1 ? izq + ancho / 2 : izq + (ancho * i) / (puntos.length - 1));
  const y = (v) => arriba + alto - ((v - min) / (max - min)) * alto;
  const r1 = (n) => Math.round(n * 10) / 10;

  const vMax = Math.max(...valores);
  const vMin = Math.min(...valores);
  const lineas = [vMax, vMin].filter((v, i, a) => a.indexOf(v) === i).map((v) => `
      <line class="chart__grid" x1="${izq}" x2="${W - der}" y1="${r1(y(v))}" y2="${r1(y(v))}"/>
      <text class="chart__axis" x="${izq - 6}" y="${r1(y(v) + 4)}" text-anchor="end">${esc(formatoValor(redondear(v, campo, unidad), unidad, false))}</text>`).join('');

  const indicesX = puntos.length === 1 ? [0]
    : puntos.length === 2 ? [0, 1]
      : [0, Math.floor((puntos.length - 1) / 2), puntos.length - 1];
  const fechas = indicesX.map((i) => {
    const ancla = puntos.length === 1 ? 'middle' : i === 0 ? 'start' : i === puntos.length - 1 ? 'end' : 'middle';
    return `<text class="chart__axis" x="${r1(x(i))}" y="${H - 6}" text-anchor="${ancla}">${esc(fechaCorta(puntos[i].fecha))}</text>`;
  }).join('');

  const coords = puntos.map((p, i) => `${r1(x(i))},${r1(y(p.valor))}`).join(' ');
  const ultimo = puntos.length - 1;
  const lx = x(ultimo);
  const ly = y(puntos[ultimo].valor);
  const anclaUltimo = puntos.length === 1 ? 'middle' : 'end';
  const etiqueta = formatoValor(redondear(puntos[ultimo].valor, campo, unidad), unidad);
  const unidadEje = unidad === 'g' ? 'kg' : unidad;

  return `
    <svg class="chart__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <text class="chart__axis" x="${izq - 6}" y="12" text-anchor="end">${unidadEje}</text>
      ${lineas}
      <line class="chart__base" x1="${izq}" x2="${W - der}" y1="${arriba + alto}" y2="${arriba + alto}"/>
      ${puntos.length > 1 ? `<polyline class="chart__line" points="${coords}"/>` : ''}
      ${puntos.map((p, i) => `<circle class="chart__dot${i === ultimo ? ' chart__dot--last' : ''}" cx="${r1(x(i))}" cy="${r1(y(p.valor))}" r="${i === ultimo ? 5.5 : 3.5}"/>`).join('')}
      <text class="chart__label" x="${r1(lx + (anclaUltimo === 'end' ? 4 : 0))}" y="${r1(Math.max(14, ly - 12))}" text-anchor="${anclaUltimo}">${esc(etiqueta)}</text>
      ${fechas}
    </svg>`;
}

function vistaProgreso(sesiones) {
  const lista = ejerciciosConHistorial(sesiones);
  if (!lista.length) return '<div class="empty-state"><p>Aún no hay series hechas para dibujar una gráfica.</p></div>';
  if (!lista.some((e) => e.id === estado.ejercicio)) {
    // Por defecto, el ejercicio con más sesiones (y, a igualdad, el más reciente).
    const mejor = [...lista].sort((a, b) => b.n - a.n || b.ultima.localeCompare(a.ultima))[0];
    estado.ejercicio = mejor.id;
    estado.campo = null;
  }
  const id = estado.ejercicio;
  const campos = camposDe(id);
  if (!campos.includes(estado.campo)) {
    const pd = progress.campoGraficaPorDefecto(id);
    estado.campo = campos.includes(pd) ? pd : campos[0];
  }
  const campo = estado.campo;
  const unidad = progress.unidadGrafica(id, campo);
  const todos = progress.datosGrafica(sesiones, id, campo);
  const puntos = todos.slice(-MAX_PUNTOS);
  const nombre = nombreEjercicio(id);
  const etiqueta = etiquetaCampo(id, campo);

  const opciones = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((e) =>
    `<option value="${esc(e.id)}"${e.id === id ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('');
  const opcionesCampo = campos.map((c) =>
    `<option value="${c}"${c === campo ? ' selected' : ''}>${esc(etiquetaCampo(id, c))}</option>`).join('');

  let grafica = '<p class="muted">No hay datos para este ejercicio.</p>';
  if (puntos.length) {
    const fmt = (p) => formatoValor(redondear(p.valor, campo, unidad), unidad);
    const primero = puntos[0];
    const ultimo = puntos[puntos.length - 1];
    const maximo = puntos.reduce((m, p) => (p.valor > m.valor ? p : m), primero);
    const resumenTxt = puntos.length === 1
      ? `${nombre}, ${etiqueta.toLowerCase()}: una sesión, ${fmt(ultimo)} el ${textoFecha(ultimo.fecha)}.`
      : `${nombre}, ${etiqueta.toLowerCase()} en ${puntos.length} sesiones: de ${fmt(primero)} el ${fechaCorta(primero.fecha)} a ${fmt(ultimo)} el ${fechaCorta(ultimo.fecha)}. Máximo: ${fmt(maximo)}.`;
    grafica = `
      <figure class="chart" role="img" aria-label="${esc(resumenTxt)}">
        ${svgGrafica(puntos, unidad, campo)}
      </figure>
      ${puntos.length === 1 ? '<p class="muted chart__hint">Haz más sesiones para ver la tendencia.</p>' : ''}
      ${todos.length > puntos.length ? `<p class="muted chart__hint">Últimas ${puntos.length} sesiones.</p>` : ''}
      <table class="sr-only">
        <caption>${esc(`${nombre}: ${etiqueta}`)}</caption>
        <thead><tr><th scope="col">Fecha</th><th scope="col">${esc(etiqueta)}</th></tr></thead>
        <tbody>${puntos.map((p) => `<tr><td>${esc(textoFecha(p.fecha))}</td><td>${esc(fmt(p))}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  return `
    <section class="card stack" aria-labelledby="hist-graf-titulo">
      <h2 class="card__title" id="hist-graf-titulo">Progreso por ejercicio</h2>
      <div class="field">
        <label class="field__label" for="hist-ejercicio">Ejercicio</label>
        <select class="field__input hist-select" id="hist-ejercicio" data-control="ejercicio">${opciones}</select>
      </div>
      <div class="field">
        <label class="field__label" for="hist-campo">Qué ver</label>
        <select class="field__input hist-select" id="hist-campo" data-control="campo"${campos.length === 1 ? ' disabled' : ''}>${opcionesCampo}</select>
      </div>
      ${grafica}
    </section>`;
}

/* ---------- Mejores marcas ---------- */

function vistaMarcas(sesiones) {
  const marcas = progress.mejoresMarcas(sesiones);
  const ids = Object.keys(marcas).sort((a, b) => nombreEjercicio(a).localeCompare(nombreEjercicio(b), 'es'));
  if (!ids.length) return '<div class="empty-state"><p>Aún no hay marcas. Aparecerán al terminar tus sesiones.</p></div>';
  const filas = ids.map((id) => {
    const m = marcas[id];
    const lineas = [];
    if (m.pesoMax) lineas.push(`Peso máximo: <strong>${esc(kg(m.pesoMax.peso))}</strong> × ${esc(m.pesoMax.repeticiones)} · ${esc(fechaCorta(m.pesoMax.fecha))}`);
    if (m.repsMax && !m.segundosMax) {
      const con = m.repsMax.peso > 0 ? ` con ${esc(kg(m.repsMax.peso))}` : '';
      lineas.push(`Más repeticiones: <strong>${esc(m.repsMax.repeticiones)}</strong>${con} · ${esc(fechaCorta(m.repsMax.fecha))}`);
    }
    if (m.segundosMax) lineas.push(`Más tiempo: <strong>${esc(m.segundosMax.segundos)} s</strong> · ${esc(fechaCorta(m.segundosMax.fecha))}`);
    if (!lineas.length) return '';
    return `
        <li class="list__item hist-record">
          <div class="list__text">
            <span class="list__title">${esc(nombreEjercicio(id))}</span>
            ${lineas.map((l) => `<span class="hist-record__line">${l}</span>`).join('')}
          </div>
        </li>`;
  }).join('');
  return `<ul class="list hist-records" aria-label="Mejores marcas por ejercicio">${filas}</ul>`;
}

/* ---------- Pantalla ---------- */

const PESTANAS = [
  ['sesiones', 'Sesiones'],
  ['progreso', 'Progreso'],
  ['marcas', 'Marcas'],
];

function pintar(contenedor, ctx) {
  const { storage } = ctx;
  const sesiones = sesionesTerminadas(storage);
  const rutina = storage.get(storage.CLAVES.rutina, null);
  const nombres = new Map(((rutina && rutina.dias) || []).map((d) => [d.id, d.nombre]));

  let cuerpo;
  if (!sesiones.length) {
    cuerpo = `
      <div class="empty-state">
        <p><strong>Aún no hay sesiones</strong></p>
        <p>Cuando termines tu primer entrenamiento verás aquí tus pesos, tu progreso y tus mejores marcas.</p>
        <button type="button" class="btn btn--primary" data-accion="rutina">Ver la rutina</button>
      </div>`;
  } else {
    const volumenTotal = sesiones.reduce((t, s) => t + (resumenSeguro(s).volumen || 0), 0);
    const panel = estado.pestana === 'progreso' ? vistaProgreso(sesiones)
      : estado.pestana === 'marcas' ? vistaMarcas(sesiones)
        : vistaSesiones(sesiones, nombres);
    cuerpo = `
      <div class="row hist-stats">
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
      <div class="segmented hist-tabs" role="tablist" aria-label="Vista del historial">
        ${PESTANAS.map(([id, texto]) => `
        <button type="button" role="tab" class="segmented__option${estado.pestana === id ? ' is-selected' : ''}" id="hist-tab-${id}"
          aria-selected="${estado.pestana === id}" aria-controls="hist-panel" tabindex="${estado.pestana === id ? 0 : -1}" data-pestana="${id}">${texto}</button>`).join('')}
      </div>
      <div class="stack" role="tabpanel" id="hist-panel" aria-labelledby="hist-tab-${estado.pestana}">${panel}</div>`;
  }

  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">Sesiones, progreso y marcas</p>
        <h1 class="screen__title">Historial</h1>
      </div>
    </header>

    <div class="stack">${cuerpo}</div>
  `;
}

export function render(contenedor, ctx) {
  ctxActual = ctx;
  estado.visibles = POR_PAGINA;
  pintar(contenedor, ctx);
  if (contenedor.dataset.conectado) return;
  contenedor.dataset.conectado = '1';

  // Oyentes delegados: el contenedor es fijo y se repinta por dentro.
  contenedor.addEventListener('click', (e) => {
    const vista = ctxActual;
    const boton = e.target.closest('button');
    if (!boton || !vista) return;
    if (boton.dataset.pestana) {
      cambiarPestana(contenedor, vista, boton.dataset.pestana);
    } else if (boton.dataset.accion === 'ver-mas') {
      const primeraNueva = estado.visibles;
      estado.visibles += POR_PAGINA;
      pintar(contenedor, vista);
      contenedor.querySelectorAll('.hist-session__summary')[primeraNueva]?.focus();
    } else if (boton.dataset.accion === 'rutina') {
      vista.navegar('rutina');
    }
  });
  contenedor.addEventListener('keydown', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const ids = PESTANAS.map(([id]) => id);
    let i = ids.indexOf(tab.dataset.pestana);
    if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    else i = e.key === 'Home' ? 0 : ids.length - 1;
    cambiarPestana(contenedor, ctxActual, ids[i]);
  });
  contenedor.addEventListener('change', (e) => {
    const control = e.target.closest('[data-control]');
    if (!control || !ctxActual) return;
    if (control.dataset.control === 'ejercicio') {
      estado.ejercicio = control.value;
      estado.campo = null;
    } else {
      estado.campo = control.value;
    }
    pintar(contenedor, ctxActual);
    contenedor.querySelector(`[data-control="${control.dataset.control}"]`)?.focus();
  });
}

function cambiarPestana(contenedor, ctx, id) {
  estado.pestana = id;
  pintar(contenedor, ctx);
  contenedor.querySelector(`[data-pestana="${id}"]`)?.focus();
}
