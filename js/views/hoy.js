/*
 * Pantalla Hoy (Fase 1: contenido de ejemplo).
 * Muestra el entrenamiento del día, la semana, la racha y el acceso a Ajustes.
 * También registra la fecha de apertura para comprobar que el guardado persiste.
 */

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const ICONO_AJUSTES = `
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
  </svg>`;

// Solo se registra una apertura por carga de la página.
let aperturaRegistrada = false;
let aperturaAnterior = null;
let numeroAperturas = 0;

function registrarApertura(storage) {
  if (aperturaRegistrada) return;
  aperturaRegistrada = true;
  const meta = storage.get(storage.CLAVES.meta, {}) || {};
  aperturaAnterior = meta.ultimaApertura || null;
  numeroAperturas = (Number(meta.aperturas) || 0) + 1;
  storage.set(storage.CLAVES.meta, {
    ...meta,
    ultimaApertura: new Date().toISOString(),
    aperturas: numeroAperturas,
  });
}

const formatoFechaHora = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});
const formatoFecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/** Día ISO (1 = lunes … 7 = domingo). */
function diaIso(fecha) {
  return ((fecha.getDay() + 6) % 7) + 1;
}

function pintarSemana(diasEntreno) {
  const hoy = new Date();
  const hoyIso = diaIso(hoy);
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - (hoyIso - 1));

  return LETRAS.map((letra, i) => {
    const iso = i + 1;
    const fecha = new Date(lunes);
    fecha.setDate(lunes.getDate() + i);
    const clases = ['week__day'];
    let estado = 'pendiente';
    if (!diasEntreno.includes(iso)) { clases.push('is-rest'); estado = 'descanso'; }
    else if (iso < hoyIso) { clases.push('is-done'); estado = 'hecho'; }
    if (iso === hoyIso) clases.push('is-today');
    return `
      <li class="${clases.join(' ')}" aria-label="${NOMBRES_DIA[i]} ${fecha.getDate()}: ${estado}${iso === hoyIso ? ' (hoy)' : ''}">
        <span aria-hidden="true">${letra}</span>
        <span aria-hidden="true">${fecha.getDate()}</span>
      </li>`;
  }).join('');
}

export function render(contenedor, ctx) {
  const { storage } = ctx;
  registrarApertura(storage);
  const config = storage.getConfig();
  const sesionActiva = storage.get(storage.CLAVES.sesionActiva, null);

  const textoApertura = aperturaAnterior
    ? `Última apertura: ${formatoFechaHora.format(new Date(aperturaAnterior))}`
    : 'Es la primera vez que abres la app en este dispositivo.';

  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">${formatoFecha.format(new Date())}</p>
        <h1 class="screen__title">Hoy</h1>
      </div>
      <button type="button" class="screen__action btn btn--icon btn--ghost" data-accion="ajustes" aria-label="Ajustes">
        ${ICONO_AJUSTES}
      </button>
    </header>

    <div class="stack">
      ${sesionActiva ? `
      <div class="card">
        <h2 class="card__title">Tienes una sesión a medias</h2>
        <p class="card__meta">Retómala en la misma serie donde la dejaste.</p>
        <button type="button" class="btn btn--secondary btn--block" data-accion="retomar">Retomar sesión</button>
      </div>` : ''}

      <article class="card card--highlight">
        <p class="card__meta">Entrenamiento de hoy</p>
        <h2 class="card__title">Torso A</h2>
        <div class="card__body stack">
          <p class="muted">7 ejercicios · 23 series · unos 55 min</p>
          <p class="row">
            <span class="chip chip--barra">Barra</span>
            <span class="chip chip--mancuernas">Mancuernas</span>
          </p>
          <button type="button" class="btn btn--primary btn--block" data-accion="empezar">Ver rutina y empezar</button>
        </div>
      </article>

      <section class="card" aria-labelledby="hoy-semana">
        <h2 class="card__title" id="hoy-semana">Esta semana</h2>
        <ol class="week">${pintarSemana(config.diasSemana)}</ol>
        <p class="streak"><strong class="accent">6</strong> entrenamientos seguidos sin fallar</p>
      </section>

      <div class="row">
        <div class="stat">
          <span class="stat__value">2/4</span>
          <span class="stat__label">sesiones esta semana</span>
        </div>
        <div class="stat">
          <span class="stat__value">8.420</span>
          <span class="stat__label">kg de volumen</span>
        </div>
      </div>

      <section class="card" aria-labelledby="hoy-guardado">
        <h2 class="card__title" id="hoy-guardado">Guardado en el móvil</h2>
        <p class="card__meta">${textoApertura}</p>
        <p class="card__meta muted">Aperturas registradas: ${numeroAperturas}${storage.estaDisponible() ? '' : ' (sin guardado permanente)'}</p>
      </section>

      <p class="muted">Contenido de ejemplo de la Fase 1.</p>
    </div>
  `;

  contenedor.querySelector('[data-accion="ajustes"]').addEventListener('click', () => ctx.navegar('ajustes'));
  contenedor.querySelector('[data-accion="empezar"]').addEventListener('click', () => ctx.navegar('rutina'));
  contenedor.querySelector('[data-accion="retomar"]')?.addEventListener('click', () => ctx.navegar('rutina'));
}
