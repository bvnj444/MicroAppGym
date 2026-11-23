/*
 * Pantalla Ejercicios: catálogo real (js/data/exercises.js) filtrable por grupo
 * muscular y por equipo. Al tocar un ejercicio se abre su detalle en un panel
 * inferior <dialog class="sheet">. El botón atrás de Android lo cierra (evento
 * cancel del dialog); no se usa el historial, así que no afecta a las pestañas.
 * La animación llega en la Fase 4 (de momento, un marcador de posición).
 */

import { EJERCICIOS, GRUPOS, MUSCULOS } from '../data/exercises.js';

const POR_ID = new Map(EJERCICIOS.map((e) => [e.id, e]));
const NOMBRE_GRUPO = Object.fromEntries(GRUPOS.map((g) => [g.id, g.nombre]));
const NOMBRE_MUSCULO = Object.fromEntries(MUSCULOS.map((m) => [m.id, m.nombre]));

// Filas de opciones del filtro de grupo (dos filas para que quepan a 360 px).
const FILAS_GRUPO = [
  [['todos', 'Todos'], ...GRUPOS.slice(0, 3).map((g) => [g.id, g.nombre])],
  GRUPOS.slice(3).map((g) => [g.id, g.nombre]),
];
// "Mancuernas" no cabe en un cuarto de fila a 360 px: también dos filas.
const FILAS_EQUIPO = [
  [['todos', 'Todo'], ['barra', 'Barra']],
  [['mancuernas', 'Mancuernas'], ['peso corporal', 'Corporal']],
];
const CHIP_EQUIPO = {
  barra: ['chip--barra', 'Barra'],
  mancuernas: ['chip--mancuernas', 'Mancuernas'],
  'peso corporal': ['chip--corporal', 'Peso corporal'],
};
const NOMBRE_REQUISITO = { barraDominadas: 'barra de dominadas', banco: 'banco' };

const MINIATURA = `
  <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="24" cy="10" r="4"/>
    <path d="M24 14v14M24 28l-7 12M24 28l7 12M12 20h24"/>
  </svg>`;

const ICONO_CERRAR = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

// El filtro elegido se mantiene mientras la app está abierta.
const filtro = { grupo: 'todos', equipo: 'todos' };

const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function textoRequisito(ej) {
  const req = ej.requiere || [];
  if (!req.length) return '';
  return 'Necesita ' + req.map((r) => NOMBRE_REQUISITO[r] || r).join(' y ');
}

function chipEquipo(equipo) {
  const [clase, texto] = CHIP_EQUIPO[equipo] || ['', equipo];
  return `<span class="chip ${clase}">${esc(texto)}</span>`;
}

function segmentado(opciones, actual, clave) {
  return `
    <div class="segmented">
      ${opciones.map(([valor, texto]) => `
        <button type="button" role="radio" class="segmented__option${valor === actual ? ' is-selected' : ''}"
          aria-checked="${valor === actual}" data-${clave}="${esc(valor)}">${esc(texto)}</button>`).join('')}
    </div>`;
}

function pintarLista(lista) {
  const visibles = EJERCICIOS.filter((e) =>
    (filtro.grupo === 'todos' || e.grupo === filtro.grupo) &&
    (filtro.equipo === 'todos' || e.equipo === filtro.equipo));

  if (!visibles.length) {
    lista.innerHTML = '<li class="empty-state"><p>No hay ejercicios con estos filtros.</p></li>';
    return;
  }
  lista.innerHTML = visibles.map((e) => {
    const requisito = textoRequisito(e);
    return `
    <li>
      <button type="button" class="list__item${requisito ? ' is-disabled' : ''}" data-id="${esc(e.id)}">
        <span class="list__thumb">${MINIATURA}</span>
        <span class="list__text">
          <span class="list__title">${esc(e.nombre)}</span>
          <span class="list__meta">${requisito ? esc(requisito) : (e.aviso ? 'Con aviso de seguridad' : '')}</span>
          <span class="chips">
            <span class="chip">${esc(NOMBRE_GRUPO[e.grupo] || e.grupo)}</span>
            ${chipEquipo(e.equipo)}
          </span>
        </span>
      </button>
    </li>`;
  }).join('');
}

/* ---------- Detalle ---------- */

function chipsMusculos(ids) {
  if (!ids || !ids.length) return '<p class="muted">—</p>';
  return `<p class="chips">${ids.map((id) =>
    `<span class="chip">${esc(NOMBRE_MUSCULO[id] || id)}</span>`).join('')}</p>`;
}

function seccion(titulo, contenido) {
  return `<section class="stack--tight"><h3 class="card__title">${titulo}</h3>${contenido}</section>`;
}

function htmlDetalle(ej) {
  const requisito = textoRequisito(ej);
  const sustitutos = (ej.sustitutos || []).map((id) => POR_ID.get(id)).filter(Boolean);
  return `
    <div class="sheet__handle" aria-hidden="true"></div>
    <header class="sheet__header">
      <h2 class="sheet__title" id="detalle-titulo">${esc(ej.nombre)}</h2>
      <button type="button" class="btn btn--icon btn--ghost" data-accion="cerrar" aria-label="Cerrar">${ICONO_CERRAR}</button>
    </header>
    <div class="sheet__body">
      <p class="chips">
        <span class="chip">${esc(NOMBRE_GRUPO[ej.grupo] || ej.grupo)}</span>
        ${chipEquipo(ej.equipo)}
        ${ej.unilateral ? '<span class="chip">Por lado</span>' : ''}
      </p>

      <div class="card empty-state" role="img" aria-label="Animación pendiente">
        <span class="list__thumb" aria-hidden="true">${MINIATURA}</span>
        <p>Animación en la Fase 4</p>
      </div>

      ${requisito ? `<p class="mount-alert">${esc(requisito)}: ahora no está disponible con tu equipo.</p>` : ''}
      ${ej.aviso ? `<div class="mount-alert" role="note"><span><strong>Aviso</strong><br>${esc(ej.aviso)}</span></div>` : ''}

      ${seccion('Músculos principales', chipsMusculos(ej.musculosPrincipales))}
      ${ej.musculosSecundarios && ej.musculosSecundarios.length ? seccion('Músculos secundarios', chipsMusculos(ej.musculosSecundarios)) : ''}
      ${seccion('Para qué sirve', `<p>${esc(ej.paraQueSirve)}</p>`)}
      ${ej.apoyo ? seccion('Apoyo', `<p>${esc(ej.apoyo.charAt(0).toUpperCase() + ej.apoyo.slice(1))}</p>`) : ''}
      ${seccion('Técnica', `<ol class="steps">${(ej.pasos || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ol>`)}
      ${(ej.erroresComunes || []).length ? seccion('Errores comunes', `<ul class="steps steps--bullets">${ej.erroresComunes.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`) : ''}
      ${(ej.variantes || []).length ? seccion('Escalera de variantes', `
        <p class="card__meta">De más fácil a más difícil: cuando domines un escalón, pasa al siguiente.</p>
        <ol class="steps">${ej.variantes.map((v) => `<li>${esc(v.texto || v.id || '')}</li>`).join('')}</ol>`) : ''}
      ${sustitutos.length ? seccion('Sustitutos', `
        <ul class="list">${sustitutos.map((s) => `
          <li><button type="button" class="list__item" data-id="${esc(s.id)}">
            <span class="list__text">
              <span class="list__title">${esc(s.nombre)}</span>
              <span class="list__meta">${esc(textoRequisito(s) || (CHIP_EQUIPO[s.equipo] || [, s.equipo])[1])}</span>
            </span>
          </button></li>`).join('')}
        </ul>`) : ''}
    </div>
    <footer class="sheet__footer">
      <button type="button" class="btn btn--secondary btn--block" data-accion="cerrar">Cerrar</button>
    </footer>`;
}

function abrirDetalle(dialogo, id) {
  const ej = POR_ID.get(id);
  if (!ej) return;
  dialogo.innerHTML = htmlDetalle(ej);
  if (!dialogo.open) dialogo.showModal();
  dialogo.querySelector('.sheet__body').scrollTop = 0;
  dialogo.querySelector('.sheet__footer [data-accion="cerrar"]').focus({ preventScroll: true });
}

export function render(contenedor, ctx = {}) {
  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">${EJERCICIOS.length} ejercicios</p>
        <h1 class="screen__title">Ejercicios</h1>
      </div>
    </header>

    <div class="stack">
      <div class="field">
        <span class="field__label" id="filtro-grupo-etiqueta">Grupo muscular</span>
        <div class="stack--tight" role="radiogroup" aria-labelledby="filtro-grupo-etiqueta" data-filtro="grupo">
          ${FILAS_GRUPO.map((fila) => segmentado(fila, filtro.grupo, 'grupo')).join('')}
        </div>
      </div>

      <div class="field">
        <span class="field__label" id="filtro-equipo-etiqueta">Equipo</span>
        <div class="stack--tight" role="radiogroup" aria-labelledby="filtro-equipo-etiqueta" data-filtro="equipo">
          ${FILAS_EQUIPO.map((fila) => segmentado(fila, filtro.equipo, 'equipo')).join('')}
        </div>
      </div>

      <ul class="list" aria-live="polite"></ul>
    </div>

    <dialog class="sheet" aria-labelledby="detalle-titulo"></dialog>
  `;

  const lista = contenedor.querySelector('.list');
  const dialogo = contenedor.querySelector('dialog.sheet');
  pintarLista(lista);

  // Filtros
  for (const grupo of contenedor.querySelectorAll('[data-filtro]')) {
    grupo.addEventListener('click', (evento) => {
      const clave = grupo.dataset.filtro;
      const opcion = evento.target.closest(`[data-${clave}]`);
      if (!opcion) return;
      filtro[clave] = opcion.dataset[clave];
      for (const b of grupo.querySelectorAll(`[data-${clave}]`)) {
        const elegida = b === opcion;
        b.classList.toggle('is-selected', elegida);
        b.setAttribute('aria-checked', String(elegida));
      }
      pintarLista(lista);
    });
  }

  lista.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-id]');
    if (boton) abrirDetalle(dialogo, boton.dataset.id);
  });

  // Detalle: cerrar con los botones, tocando fuera o con atrás (cancel).
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) { dialogo.close(); return; }
    if (evento.target.closest('[data-accion="cerrar"]')) { dialogo.close(); return; }
    const sustituto = evento.target.closest('[data-id]');
    if (sustituto) abrirDetalle(dialogo, sustituto.dataset.id);
  });
  dialogo.addEventListener('cancel', () => dialogo.close());

  // Llegada desde otra pantalla ("Ver técnica" en Rutina): abre ese detalle.
  if (ctx.ejercicioPendiente) {
    const id = ctx.ejercicioPendiente;
    ctx.ejercicioPendiente = null;
    abrirDetalle(dialogo, id);
  }
}
