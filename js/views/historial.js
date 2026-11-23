/*
 * Pantalla Historial (Fase 1: sesiones de ejemplo).
 * En la Fase 7 leerá storage.get(CLAVES.sesiones) y calculará volumen,
 * gráfica por ejercicio y mejores marcas. Los ejemplos usan ya el formato
 * del registro de sesión (pesos en gramos).
 */

const EJEMPLOS = [
  {
    fecha: '2026-11-20', nombre: 'Pierna B', duracion: 52,
    ejercicios: [
      { nombre: 'Hip thrust con barra', series: [[13750, 15], [13750, 14], [13750, 13], [13750, 12]] },
      { nombre: 'Sentadilla búlgara', series: [[5750, 12], [5750, 11], [5750, 10], [5750, 10]] },
      { nombre: 'Peso muerto a una pierna', series: [[7750, 12], [7750, 12], [7750, 11]] },
    ],
  },
  {
    fecha: '2026-11-19', nombre: 'Torso B', duracion: 58,
    ejercicios: [
      { nombre: 'Press de suelo con mancuernas', series: [[10750, 13], [10750, 12], [10750, 11], [10750, 10]] },
      { nombre: 'Remo con mancuerna a una mano', series: [[12750, 12], [12750, 12], [12750, 11], [12750, 10]] },
      { nombre: 'Elevaciones laterales', series: [[3250, 18], [3250, 16], [3250, 15], [3250, 14]] },
    ],
  },
  {
    fecha: '2026-11-17', nombre: 'Torso A', duracion: 55,
    ejercicios: [
      { nombre: 'Press de suelo con barra', series: [[10750, 12], [10750, 12], [10750, 12], [10750, 12]], marca: true },
      { nombre: 'Remo con barra', series: [[10750, 12], [10750, 11], [10750, 10], [10750, 10]] },
      { nombre: 'Curl con barra', series: [[5750, 12], [5750, 11], [5750, 10]] },
    ],
  },
];

const formatoFecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const formatoNumero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

function volumenGramos(sesion) {
  return sesion.ejercicios.reduce((total, e) => total + e.series.reduce((s, [peso, reps]) => s + peso * reps, 0), 0);
}

export function render(contenedor, ctx) {
  const volumenTotal = EJEMPLOS.reduce((t, s) => t + volumenGramos(s), 0);

  const tarjetas = EJEMPLOS.map((sesion) => {
    const [a, m, d] = sesion.fecha.split('-').map(Number);
    return `
      <article class="card">
        <p class="card__meta">${formatoFecha.format(new Date(a, m - 1, d))} · ${sesion.duracion} min</p>
        <h2 class="card__title">${sesion.nombre}</h2>
        <div class="card__body stack">
          <p><span class="accent">${formatoNumero.format(volumenGramos(sesion) / 1000)} kg</span> <span class="muted">de volumen</span></p>
          <ul class="list">
            ${sesion.ejercicios.map((e) => `
              <li class="list__item">
                <div class="list__text">
                  <p class="list__title">${e.nombre}${e.marca ? ' <span class="accent-2">· Mejor marca</span>' : ''}</p>
                  <p class="list__meta">${ctx.kg(e.series[0][0])} · ${e.series.map(([, r]) => r).join(' / ')} reps</p>
                </div>
              </li>`).join('')}
          </ul>
        </div>
      </article>`;
  }).join('');

  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">Últimas sesiones</p>
        <h1 class="screen__title">Historial</h1>
      </div>
    </header>

    <div class="stack">
      <div class="row">
        <div class="stat">
          <span class="stat__value">${EJEMPLOS.length}</span>
          <span class="stat__label">sesiones</span>
        </div>
        <div class="stat">
          <span class="stat__value">${formatoNumero.format(volumenTotal / 1000)}</span>
          <span class="stat__label">kg de volumen</span>
        </div>
      </div>
      ${tarjetas}
      <p class="muted">Sesiones de ejemplo de la Fase 1.</p>
    </div>
  `;
}
