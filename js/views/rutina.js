/*
 * Pantalla Rutina del día — VERSIÓN DE EJEMPLO DE LA FASE 1.
 * Pertenece después al agente sesion-cronometro, que la sustituirá.
 * Pinta Torso A agrupado por montaje, con avisos de montaje y pastillas de serie.
 * Pesos en gramos (contrato de storage.js); se muestran con ctx.kg().
 */

const MINIATURA = `
  <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="24" cy="10" r="4"/>
    <path d="M24 14v14M24 28l-7 12M24 28l7 12M12 20h24"/>
  </svg>`;

// Torso A (PLAN.md, sección 7). Pesos de ejemplo montables con el inventario por defecto.
const BLOQUES = [
  {
    montaje: 'barra',
    aviso: 'Monta la barra: 10,75 kg → por lado: 2,5 + 2',
    ejercicios: [
      { nombre: 'Press de suelo con barra', series: 4, reps: '8-12', descanso: 120, peso: 10750, hechas: 2 },
      { nombre: 'Remo con barra', series: 4, reps: '8-12', descanso: 120, peso: 10750 },
      { nombre: 'Press militar de pie con barra', series: 3, reps: '8-12', descanso: 90, peso: 6750, cambio: 'Quita 2 por lado → 6,75 kg' },
      { nombre: 'Press francés en suelo', series: 3, reps: '10-12', descanso: 75, peso: 5750, cambio: 'Cambia 2,5 por 2 en cada lado → 5,75 kg' },
      { nombre: 'Curl con barra', series: 3, reps: '10-12', descanso: 75, peso: 5750 },
    ],
  },
  {
    montaje: 'mancuernas',
    aviso: 'Desmonta la barra. 1 mancuerna: 8,25 kg → por lado: 2,5 + 1,25',
    ejercicios: [
      { nombre: 'Pullover en suelo', series: 3, reps: '12-15', descanso: 75, peso: 8250, detalle: '1 mancuerna' },
      { nombre: 'Aperturas en suelo', series: 3, reps: '12-15', descanso: 75, peso: 5750, detalle: '2 mancuernas', cambio: '2 mancuernas: 5,75 kg cada una → por lado: 2,5' },
    ],
  },
];

const ETIQUETA_MONTAJE = { barra: 'Barra', mancuernas: 'Mancuernas', ninguno: 'Peso corporal' };
const CLASE_CHIP = { barra: 'chip--barra', mancuernas: 'chip--mancuernas', ninguno: 'chip--corporal' };

function pastillas(total, hechas) {
  let html = '';
  for (let i = 0; i < total; i++) {
    const clase = i < hechas ? 'set-pill is-done' : i === hechas ? 'set-pill is-current' : 'set-pill';
    const estado = i < hechas ? 'hecha' : i === hechas ? 'actual' : 'pendiente';
    html += `<li class="${clase}"><span class="visually-hidden">Serie ${i + 1}: ${estado}</span></li>`;
  }
  return `<ol class="set-pills" aria-label="Series">${html}</ol>`;
}

export function render(contenedor, ctx) {
  const totalEjercicios = BLOQUES.reduce((n, b) => n + b.ejercicios.length, 0);

  const bloques = BLOQUES.map((bloque) => `
    <section class="stack" aria-label="Bloque de ${ETIQUETA_MONTAJE[bloque.montaje].toLowerCase()}">
      <p class="mount-alert" role="note">${bloque.aviso}</p>
      <ul class="list">
        ${bloque.ejercicios.map((ej) => `
          ${ej.cambio ? `<li class="mount-alert" role="note">${ej.cambio}</li>` : ''}
          <li class="list__item">
            <div class="list__thumb">${MINIATURA}</div>
            <div class="list__text">
              <p class="list__title">${ej.nombre}</p>
              <p class="list__meta">${ej.series} × ${ej.reps} · ${ej.descanso} s · ${ctx.kg(ej.peso)}${ej.detalle ? ` · ${ej.detalle}` : ''}</p>
              <p class="row"><span class="chip ${CLASE_CHIP[bloque.montaje]}">${ETIQUETA_MONTAJE[bloque.montaje]}</span></p>
              ${pastillas(ej.series, ej.hechas || 0)}
            </div>
          </li>`).join('')}
      </ul>
    </section>`).join('');

  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">Lunes · ${totalEjercicios} ejercicios · barra → mancuernas</p>
        <h1 class="screen__title">Torso A</h1>
      </div>
    </header>

    <div class="stack">
      ${bloques}
      <button type="button" class="btn btn--primary btn--block" data-accion="empezar">Empezar</button>
      <p class="muted">Contenido de ejemplo de la Fase 1.</p>
    </div>
  `;

  contenedor.querySelector('[data-accion="empezar"]').addEventListener('click', () => {
    ctx.toast('La sesión activa llegará en la Fase 6.');
  });
}
