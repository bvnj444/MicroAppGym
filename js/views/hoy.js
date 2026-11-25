/*
 * Pantalla Hoy (inicio).
 * Entrenamiento de hoy (o descanso y próximo entrenamiento), la semana real,
 * las sesiones terminadas (la racha real llega en la Fase 7), retomar una sesión
 * a medias y el acceso a Ajustes. Usa ctx.obtenerRutina() y planner.js.
 * (Las aperturas de la app se registran en CLAVES.meta desde app.js.)
 */

import * as planner from '../planner.js';

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MONTAJE = {
  barra: ['chip--barra', 'Barra'],
  mancuernas: ['chip--mancuernas', 'Mancuernas'],
  ninguno: ['chip--corporal', 'Peso corporal'],
};

const ICONO_AJUSTES = `
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
  </svg>`;

const formatoFecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/** 'AAAA-MM-DD' -> Date local (sin desfase por zona horaria). */
function aFecha(texto) {
  const [a, m, d] = texto.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function aTexto(fecha) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

function sumarUnDia(texto) {
  const f = aFecha(texto);
  f.setDate(f.getDate() + 1);
  return aTexto(f);
}

function sesionesTerminadas(storage) {
  const lista = storage.get(storage.CLAVES.sesiones, []);
  return Array.isArray(lista) ? lista.filter((s) => s && s.terminada === true) : [];
}

function chipsMontaje(montajes) {
  return montajes.filter((m) => MONTAJE[m])
    .map((m) => `<span class="chip ${MONTAJE[m][0]}">${MONTAJE[m][1]}</span>`).join('');
}

function tarjetaEntreno(dia, hecha = false) {
  const r = planner.resumenDia(dia);
  const boton = hecha
    ? '<button type="button" class="btn btn--secondary btn--block" data-accion="empezar">Hecho hoy ✓ · Ver la rutina</button>'
    : '<button type="button" class="btn btn--primary btn--block" data-accion="empezar">Ver rutina y empezar</button>';
  return `
      <article class="card card--highlight">
        <p class="card__meta">${hecha ? 'Entrenamiento de hoy · completado' : 'Entrenamiento de hoy'}</p>
        <h2 class="card__title">${dia.nombre}</h2>
        <div class="card__body stack">
          <p class="muted">${r.ejercicios} ejercicios · ${r.series} series · unos ${r.minutosEstimados} min</p>
          <p class="row">${chipsMontaje(r.montajes)}</p>
          ${dia.ajustePrincipiante ? '<p class="card__meta">Nivel principiante: 1 serie menos y 30 s más de descanso.</p>' : ''}
          ${boton}
        </div>
      </article>`;
}

function tarjetaDescanso(proximo, hoyTexto) {
  let texto = 'No hay entrenamientos en los próximos días.';
  if (proximo) {
    const cuando = proximo.fecha === sumarUnDia(hoyTexto) ? 'mañana, ' : 'el ';
    texto = `Próximo entrenamiento: <strong>${proximo.dia.nombre}</strong>, ${cuando}${formatoFecha.format(aFecha(proximo.fecha))}.`;
  }
  return `
      <article class="card">
        <p class="card__meta">Día de descanso</p>
        <h2 class="card__title">Hoy descansas</h2>
        <div class="card__body stack">
          <p>${texto}</p>
          ${proximo ? '<button type="button" class="btn btn--secondary btn--block" data-accion="empezar">Ver la rutina</button>' : ''}
        </div>
      </article>`;
}

function pintarSemana(dias, hoyTexto, fechasHechas) {
  return dias.map((d, i) => {
    const clases = ['week__day'];
    let estado;
    if (fechasHechas.has(d.fecha)) {
      clases.push('is-done');
      estado = d.dia ? `${d.dia.nombre}, hecho` : 'entrenado';
    } else if (d.descanso) {
      clases.push('is-rest');
      estado = 'descanso';
    } else {
      estado = `${d.dia.nombre}, ${d.fecha < hoyTexto ? 'sin hacer' : 'pendiente'}`;
    }
    const esHoy = d.fecha === hoyTexto;
    if (esHoy) clases.push('is-today');
    const numero = aFecha(d.fecha).getDate();
    return `
      <li class="${clases.join(' ')}" aria-label="${NOMBRES_DIA[i]} ${numero}: ${estado}${esHoy ? ' (hoy)' : ''}">
        <span aria-hidden="true">${LETRAS[i]}</span>
        <strong aria-hidden="true">${numero}</strong>
      </li>`;
  }).join('');
}

export function render(contenedor, ctx) {
  const { storage } = ctx;
  const config = ctx.config();
  const hoyTexto = ctx.hoy();
  const sesionActiva = storage.get(storage.CLAVES.sesionActiva, null);
  const rutina = ctx.obtenerRutina();
  const terminadas = sesionesTerminadas(storage);
  const fechasHechas = new Set(terminadas.map((s) => s.fecha));

  let principal;
  let semanaHtml = '';
  if (!rutina) {
    principal = `
      <article class="card card--highlight">
        <h2 class="card__title">Configura tu rutina</h2>
        <div class="card__body stack">
          <p class="card__meta">Elige tus días y tu nivel para crear la rutina.</p>
          <button type="button" class="btn btn--primary btn--block" data-accion="ajustes">Ir a la configuración</button>
        </div>
      </article>`;
  } else {
    const { dia } = planner.diaParaFecha(rutina, config, hoyTexto);
    principal = dia
      ? tarjetaEntreno(dia, fechasHechas.has(hoyTexto))
      : tarjetaDescanso(planner.proximoEntreno(rutina, config, hoyTexto), hoyTexto);

    const dias = planner.semana(rutina, config, hoyTexto);
    const previstos = dias.filter((d) => !d.descanso).length;
    const hechos = dias.filter((d) => fechasHechas.has(d.fecha)).length;
    const n = terminadas.length;
    semanaHtml = `
      <section class="card stack" aria-labelledby="hoy-semana">
        <h2 class="card__title" id="hoy-semana">Esta semana</h2>
        <ol class="week">${pintarSemana(dias, hoyTexto, fechasHechas)}</ol>
        <p class="muted">${hechos} de ${previstos} entrenamientos hechos esta semana</p>
        <p class="streak">${n === 0
          ? 'Empieza tu racha hoy'
          : `<strong>${n}</strong> ${n === 1 ? 'sesión terminada' : 'sesiones terminadas'}`}</p>
      </section>`;
  }

  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">${formatoFecha.format(aFecha(hoyTexto))}</p>
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
      ${principal}
      ${semanaHtml}
    </div>
  `;

  for (const boton of contenedor.querySelectorAll('[data-accion="ajustes"]')) {
    boton.addEventListener('click', () => ctx.navegar('ajustes'));
  }
  contenedor.querySelector('[data-accion="empezar"]')?.addEventListener('click', () => ctx.navegar('rutina'));
  contenedor.querySelector('[data-accion="retomar"]')?.addEventListener('click', () => ctx.navegar('sesion'));
}
