/*
 * Pantalla Ejercicios (Fase 1: catálogo de ejemplo).
 * Filtros por grupo muscular y por equipo. En la Fase 2 el catálogo vendrá de
 * js/data/exercises.js y en la Fase 4 se abrirá el detalle con la animación.
 */

const CATALOGO = [
  // Pecho
  ['Press de suelo con mancuernas', 'pecho', 'mancuernas'],
  ['Aperturas en suelo', 'pecho', 'mancuernas'],
  ['Press squeeze', 'pecho', 'mancuernas'],
  ['Press de suelo con barra', 'pecho', 'barra'],
  ['Lagartijas', 'pecho', 'corporal'],
  ['Lagartijas declinadas (pies en silla)', 'pecho', 'corporal'],
  // Espalda
  ['Remo con mancuerna a una mano', 'espalda', 'mancuernas'],
  ['Remo inclinado con dos mancuernas', 'espalda', 'mancuernas'],
  ['Pullover en suelo', 'espalda', 'mancuernas'],
  ['Remo con barra', 'espalda', 'barra'],
  ['Remo invertido bajo mesa', 'espalda', 'corporal', 'Opcional, con aviso de seguridad'],
  // Hombro
  ['Press militar con mancuernas', 'hombro', 'mancuernas'],
  ['Elevaciones laterales', 'hombro', 'mancuernas'],
  ['Pájaros (deltoide posterior)', 'hombro', 'mancuernas'],
  ['Press militar de pie con barra', 'hombro', 'barra'],
  ['Lagartijas pike', 'hombro', 'corporal'],
  // Pierna
  ['Sentadilla goblet', 'pierna', 'mancuernas'],
  ['Zancadas hacia atrás', 'pierna', 'mancuernas'],
  ['Sentadilla búlgara', 'pierna', 'mancuernas'],
  ['Peso muerto a una pierna', 'pierna', 'mancuernas'],
  ['Peso muerto rumano con barra', 'pierna', 'barra'],
  ['Hip thrust con barra (hombros en el sofá)', 'pierna', 'barra'],
  ['Elevación de talones a una pierna', 'pierna', 'corporal'],
  ['Puente de glúteo a una pierna', 'pierna', 'corporal'],
  // Brazos
  ['Curl martillo', 'brazos', 'mancuernas'],
  ['Curl concentrado', 'brazos', 'mancuernas'],
  ['Extensión de tríceps sobre la cabeza', 'brazos', 'mancuernas'],
  ['Curl con barra', 'brazos', 'barra'],
  ['Press francés en suelo', 'brazos', 'barra'],
  ['Fondos en silla', 'brazos', 'corporal'],
  // Core
  ['Plancha', 'core', 'corporal'],
  ['Elevación de piernas', 'core', 'corporal'],
  ['Crunch', 'core', 'corporal'],
].map(([nombre, grupo, equipo, aviso]) => ({ nombre, grupo, equipo, aviso }));

const GRUPOS = [
  ['todos', 'Todos los grupos'], ['pecho', 'Pecho'], ['espalda', 'Espalda'], ['hombro', 'Hombro'],
  ['pierna', 'Pierna'], ['brazos', 'Brazos'], ['core', 'Core'],
];
const EQUIPOS = [['todos', 'Todo'], ['barra', 'Barra'], ['mancuernas', 'Mancuernas'], ['corporal', 'Corporal']];
const ETIQUETA_EQUIPO = { barra: 'Barra', mancuernas: 'Mancuernas', corporal: 'Peso corporal' };
const NOMBRE_GRUPO = Object.fromEntries(GRUPOS);

const MINIATURA = `
  <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="24" cy="10" r="4"/>
    <path d="M24 14v14M24 28l-7 12M24 28l7 12M12 20h24"/>
  </svg>`;

// El filtro elegido se mantiene mientras la app está abierta.
const filtro = { grupo: 'todos', equipo: 'todos' };

function pintarLista(lista, ctx) {
  const visibles = CATALOGO.filter((e) =>
    (filtro.grupo === 'todos' || e.grupo === filtro.grupo) &&
    (filtro.equipo === 'todos' || e.equipo === filtro.equipo));

  if (!visibles.length) {
    lista.innerHTML = '<li class="empty-state"><p>No hay ejercicios con estos filtros.</p></li>';
    return;
  }
  lista.innerHTML = visibles.map((e) => `
    <li>
      <button type="button" class="list__item" data-indice="${CATALOGO.indexOf(e)}">
        <span class="list__thumb">${MINIATURA}</span>
        <span class="list__text">
          <span class="list__title">${e.nombre}</span>
          <span class="list__meta">${NOMBRE_GRUPO[e.grupo]}${e.aviso ? ` · ${e.aviso}` : ''}</span>
        </span>
        <span class="chip chip--${e.equipo}">${ETIQUETA_EQUIPO[e.equipo]}</span>
      </button>
    </li>`).join('');
}

export function render(contenedor, ctx) {
  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">${CATALOGO.length} ejercicios</p>
        <h1 class="screen__title">Ejercicios</h1>
      </div>
    </header>

    <div class="stack">
      <div class="field">
        <label class="field__label" for="filtro-grupo">Grupo muscular</label>
        <select class="field__input" id="filtro-grupo">
          ${GRUPOS.map(([valor, texto]) => `<option value="${valor}"${valor === filtro.grupo ? ' selected' : ''}>${texto}</option>`).join('')}
        </select>
      </div>

      <div class="field">
        <span class="field__label" id="filtro-equipo-etiqueta">Equipo</span>
        <div class="segmented" role="radiogroup" aria-labelledby="filtro-equipo-etiqueta">
          ${EQUIPOS.map(([valor, texto]) => `
            <button type="button" role="radio" class="segmented__option${valor === filtro.equipo ? ' is-selected' : ''}"
              aria-checked="${valor === filtro.equipo}" data-equipo="${valor}">${texto}</button>`).join('')}
        </div>
      </div>

      <ul class="list" aria-live="polite"></ul>
      <p class="muted">Catálogo de ejemplo de la Fase 1.</p>
    </div>
  `;

  const lista = contenedor.querySelector('.list');
  pintarLista(lista, ctx);

  contenedor.querySelector('#filtro-grupo').addEventListener('change', (evento) => {
    filtro.grupo = evento.target.value;
    pintarLista(lista, ctx);
  });

  contenedor.querySelector('.segmented').addEventListener('click', (evento) => {
    const opcion = evento.target.closest('[data-equipo]');
    if (!opcion) return;
    filtro.equipo = opcion.dataset.equipo;
    for (const b of contenedor.querySelectorAll('[data-equipo]')) {
      const elegida = b === opcion;
      b.classList.toggle('is-selected', elegida);
      b.setAttribute('aria-checked', String(elegida));
    }
    pintarLista(lista, ctx);
  });

  lista.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-indice]');
    if (!boton) return;
    const ejercicio = CATALOGO[Number(boton.dataset.indice)];
    ctx.toast(`${ejercicio.nombre}: el detalle con animación llegará en las Fases 2 y 4.`);
  });
}
