/*
 * MicroApp Gym — views/rutina.js  (pertenece a sesion-cronometro)
 * Pantalla RUTINA DEL DÍA: selector de la semana, cabecera con el resumen, ejercicios por
 * bloques de montaje con sus avisos, y panel inferior (<dialog class="sheet">) para ajustar
 * series, repeticiones/segundos, descanso y peso, o cambiar el ejercicio por un sustituto.
 *
 * Usa el ctx de app.js: hoy(), obtenerRutina(), guardarRutina(rutina), config(), navegar(ruta),
 * toast(mensaje), kg(gramos). Lee los datos frescos en cada render().
 * Toda la lógica de rutina es de planner.js y la de discos de data/equipment.js.
 *
 * Índices: diaParaFecha devuelve una COPIA del día con el nivel aplicado y en el mismo orden;
 * para editar se usa el día GUARDADO (rutina.dias, por id) y sus valores base.
 */

import * as planner from '../planner.js';
import { EJERCICIOS } from '../data/exercises.js';
import { htmlFigura, pausarFiguras } from '../animations.js';
import { calcularMontaje, cambiosMontaje, textoMontaje, textoCambios } from '../data/equipment.js';
import { desbloquearAudio, iniciarDescanso, iniciarLibre } from '../timer.js';

const POR_ID = new Map(EJERCICIOS.map((e) => [e.id, e]));
const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const ETIQUETA_MONTAJE = { barra: 'Barra', mancuernas: 'Mancuernas', ninguno: 'Peso corporal' };
const CLASE_CHIP = { barra: 'chip--barra', mancuernas: 'chip--mancuernas', ninguno: 'chip--corporal' };

// Día elegido mientras la app esté abierta.
let fechaElegida = null;
// Panel abierto (para cerrarlo si se vuelve a pintar la pantalla).
let panelAbierto = null;
// Pantalla cuyas miniaturas se pausan mientras el panel la tapa.
let fondoPausado = null;

/* ---------- Utilidades ---------- */

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nombreEj = (id) => (POR_ID.get(id) || {}).nombre || id;
const numeroDia = (fecha) => Number(fecha.slice(8, 10));

function hoyLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Acceso al ctx (con respaldo mínimo mientras app.js no tenga todavía el contrato completo).
function datos(ctx) {
  const st = ctx.storage;
  return {
    hoy: () => (ctx.hoy ? ctx.hoy() : hoyLocal()),
    config: () => (ctx.config ? ctx.config() : st.getConfig()),
    rutina: () => {
      if (ctx.obtenerRutina) return ctx.obtenerRutina();
      const cfg = st.getConfig();
      return cfg.configurado ? st.get(st.CLAVES.rutina, null) : null;
    },
    guardar: (r) => (ctx.guardarRutina ? ctx.guardarRutina(r) : st.set(st.CLAVES.rutina, r)),
  };
}

function textoEquipo(ej) {
  if (!ej) return '';
  if (ej.equipo === 'barra') return 'Barra';
  if (ej.equipo === 'mancuernas') return ej.numMancuernas === 1 ? '1 mancuerna' : '2 mancuernas';
  return 'Peso corporal';
}

function rango([a, b]) {
  return a === b ? `${a}` : `${a}-${b}`;
}

function textoSeries(item) {
  const ej = POR_ID.get(item.ejercicioId);
  if (item.casiFallo) return `${item.series} × casi al fallo`;
  if (Array.isArray(item.segundos)) return `${item.series} × ${rango(item.segundos)} s`;
  if (Array.isArray(item.repeticiones)) {
    const lado = ej && ej.unilateral ? (ej.grupo === 'pierna' ? ' por pierna' : ej.grupo === 'core' ? ' por lado' : ' por brazo') : '';
    return `${item.series} × ${rango(item.repeticiones)}${lado}`;
  }
  return `${item.series} series`;
}

function textoMeta(item, ctx) {
  const partes = [textoSeries(item), `${item.descanso} s`];
  if (planner.tipoMontaje(item) && item.pesoSugerido != null) partes.push(ctx.kg(item.pesoSugerido));
  return partes.join(' · ');
}

function textoTecnica(item) {
  const notas = [];
  if (item.tempo) {
    const bajada = Number(String(item.tempo).split('-')[0]);
    notas.push(bajada > 1 ? `Baja en ${bajada} s (tempo ${item.tempo})` : `Tempo ${item.tempo}`);
  }
  if (item.pausa) {
    const ej = POR_ID.get(item.ejercicioId);
    const paso = ej && (ej.variantes || []).find((v) => v && v.tipo === 'pausa' && v.segundos === item.pausa && v.donde);
    notas.push(`Pausa ${item.pausa} s${paso ? ' ' + paso.donde : ''}`);
  }
  return notas.join(' · ');
}

/* ---------- Bloques por montaje y avisos ---------- */

// Unidades: un ejercicio suelto o una superserie (pareja consecutiva enlazada).
function unidades(ejercicios) {
  const lista = [];
  for (let i = 0; i < ejercicios.length; i++) {
    const a = ejercicios[i];
    const b = ejercicios[i + 1];
    if (b && a.superserieCon === b.ejercicioId && b.superserieCon === a.ejercicioId) {
      lista.push([i, i + 1]);
      i++;
    } else lista.push([i]);
  }
  return lista;
}

/** Devuelve [{ montaje, partes: [{ aviso } | { indices }] }] */
function bloques(dia, config, ctx) {
  const ejercicios = dia.ejercicios;
  const resultado = [];
  let montado = null; // { tipo, discos }
  for (const indices of unidades(ejercicios)) {
    const montaje = ejercicios[indices[0]].montaje || 'ninguno';
    let bloque = resultado[resultado.length - 1];
    if (!bloque || bloque.montaje !== montaje) {
      bloque = { montaje, partes: [] };
      resultado.push(bloque);
    }
    for (const i of indices) {
      const item = ejercicios[i];
      const tipo = planner.tipoMontaje(item);
      if (!tipo) continue;
      const calc = calcularMontaje(item.pesoSugerido ?? 0, tipo, config);
      let aviso = null;
      if (!montado || montado.tipo !== tipo) {
        aviso = textoMontaje(calc, tipo);
      } else {
        const cambios = cambiosMontaje(montado.discos, calc.discosPorLado);
        if (cambios.quitar.length || cambios.poner.length) aviso = `${textoCambios(cambios)} → ${ctx.kg(calc.total)}`;
      }
      if (aviso) bloque.partes.push({ aviso });
      montado = { tipo, discos: calc.discosPorLado };
    }
    const ultima = bloque.partes[bloque.partes.length - 1];
    if (ultima && ultima.indices) ultima.indices.push(indices);
    else bloque.partes.push({ indices: [indices] });
  }
  return resultado;
}

function pintarEjercicio(item, i, ctx, superserie) {
  const tecnica = textoTecnica(item);
  const chips = [];
  if (superserie) chips.push(`<span class="chip">Superserie ${superserie}</span>`);
  return `
    <button type="button" class="list__item" data-indice="${i}">
      <span class="list__thumb" aria-hidden="true">${htmlFigura(item.ejercicioId, { tamano: 'mini' })}</span>
      <span class="list__text">
        <span class="list__title">${esc(nombreEj(item.ejercicioId))}</span>
        <span class="list__meta">${esc(textoMeta(item, ctx))}</span>
        ${tecnica ? `<span class="list__meta accent">${esc(tecnica)}</span>` : ''}
        ${chips.length ? `<span class="row">${chips.join('')}</span>` : ''}
      </span>
    </button>`;
}

function pintarLista(dia, config, ctx) {
  return bloques(dia, config, ctx).map((bloque) => {
    const partes = bloque.partes.map((p) => {
      if (p.aviso) return `<p class="mount-alert" role="note">${esc(p.aviso)}</p>`;
      const filas = p.indices.map((ind) => ind.length === 2
        ? ind.map((i, k) => pintarEjercicio(dia.ejercicios[i], i, ctx, `${k + 1}/2`)).join('')
        : pintarEjercicio(dia.ejercicios[ind[0]], ind[0], ctx, null)).join('');
      return `<div class="list">${filas}</div>`;
    }).join('');
    return `
      <section class="stack" aria-label="Bloque: ${ETIQUETA_MONTAJE[bloque.montaje]}">
        <p class="row"><span class="chip ${CLASE_CHIP[bloque.montaje] || ''}">${ETIQUETA_MONTAJE[bloque.montaje] || bloque.montaje}</span></p>
        ${partes}
      </section>`;
  }).join('');
}

/* ---------- Pantalla ---------- */

function elegirPorDefecto(rutina, config, hoy, semana) {
  if (planner.diaParaFecha(rutina, config, hoy).dia) return hoy;
  const prox = planner.proximoEntreno(rutina, config, hoy);
  if (prox && semana.some((d) => d.fecha === prox.fecha)) return prox.fecha;
  return hoy;
}

export function render(contenedor, ctx) {
  cerrarPanel();
  const d = datos(ctx);
  const rutina = d.rutina();
  if (!rutina) {
    contenedor.innerHTML = `
      <header class="screen__header"><div><h1 class="screen__title">Rutina</h1></div></header>
      <div class="empty-state">
        <p>Configura tu semana para generar la rutina</p>
        <button type="button" class="btn btn--primary" data-accion="ajustes">Configurar</button>
      </div>`;
    contenedor.querySelector('[data-accion="ajustes"]').addEventListener('click', () => ctx.navegar('ajustes'));
    return;
  }

  const config = d.config();
  const hoy = d.hoy();
  const semana = planner.semana(rutina, config, hoy);
  if (!fechaElegida || !semana.some((s) => s.fecha === fechaElegida)) {
    fechaElegida = elegirPorDefecto(rutina, config, hoy, semana);
  }
  const elegido = semana.find((s) => s.fecha === fechaElegida);
  const idx = semana.indexOf(elegido);
  const etiquetaFecha = `${fechaElegida === hoy ? 'Hoy, ' : ''}${NOMBRES_DIA[idx]} ${numeroDia(fechaElegida)}`;

  const dias = semana.map((s, i) => {
    const clases = ['week__day'];
    if (s.fecha === hoy) clases.push('is-today');
    if (!s.dia) clases.push('is-rest');
    const sel = s.fecha === fechaElegida;
    if (sel) clases.push('is-selected');
    const titulo = `${NOMBRES_DIA[i]} ${numeroDia(s.fecha)}: ${s.dia ? s.dia.nombre : 'descanso'}`;
    return `<button type="button" class="${clases.join(' ')}" data-fecha="${s.fecha}" aria-pressed="${sel}" aria-label="${esc(titulo)}">
        ${LETRAS[i]}<strong>${numeroDia(s.fecha)}</strong></button>`;
  }).join('');

  let cuerpo;
  if (!elegido.dia) {
    const prox = planner.proximoEntreno(rutina, config, fechaElegida);
    const enSemana = prox && semana.find((s) => s.fecha === prox.fecha);
    const textoProx = prox
      ? `Próximo entrenamiento: ${NOMBRES_DIA[(planner.diaParaFecha(rutina, config, prox.fecha).diaSemana || 1) - 1]} ${numeroDia(prox.fecha)}, ${prox.dia.nombre}`
      : 'No hay entrenamientos en los próximos días.';
    cuerpo = `
      <header class="screen__header">
        <div>
          <p class="screen__subtitle">${esc(etiquetaFecha)}</p>
          <h1 class="screen__title">Día de descanso</h1>
        </div>
      </header>
      <div class="empty-state">
        <p>${esc(textoProx)}</p>
        ${enSemana ? `<button type="button" class="btn btn--secondary" data-fecha="${prox.fecha}">Ver ${esc(prox.dia.nombre)}</button>` : ''}
      </div>`;
  } else {
    const dia = elegido.dia;
    const r = planner.resumenDia(dia);
    cuerpo = `
      <header class="screen__header">
        <div>
          <p class="screen__subtitle">${esc(etiquetaFecha)}</p>
          <h1 class="screen__title">${esc(dia.nombre)}</h1>
          <p class="muted">${r.ejercicios} ejercicios · ${r.series} series · ~${r.minutosEstimados} min</p>
        </div>
      </header>
      <div class="stack">
        ${dia.ajustePrincipiante ? '<p class="note"><span><strong>Semanas de adaptación:</strong> 1 serie menos y +30 s de descanso.</span></p>' : ''}
        ${pintarLista(dia, config, ctx)}
        <button type="button" class="btn btn--primary btn--block" data-accion="empezar">Empezar</button>
      </div>`;
  }

  contenedor.innerHTML = `<div class="stack"><div class="week" role="group" aria-label="Días de esta semana">${dias}</div><div>${cuerpo}</div></div>`;
  const raiz = contenedor.firstElementChild;

  raiz.addEventListener('click', (e) => {
    const boton = e.target.closest('button');
    if (!boton || !raiz.contains(boton)) return;
    if (boton.dataset.fecha) {
      fechaElegida = boton.dataset.fecha;
      render(contenedor, ctx);
    } else if (boton.dataset.accion === 'empezar') {
      ctx.toast('La sesión activa llega en la Fase 6');
    } else if (boton.dataset.indice !== undefined && elegido.dia) {
      abrirPanel(contenedor, ctx, elegido.dia.id, Number(boton.dataset.indice), elegido.dia.ajustePrincipiante);
    }
  });
}

/* ---------- Panel de ajuste ---------- */

function cerrarPanel() {
  if (panelAbierto) {
    const p = panelAbierto;
    panelAbierto = null;
    if (p.open) p.close();
    p.remove();
  }
  if (fondoPausado) {
    pausarFiguras(fondoPausado, false);
    fondoPausado = null;
  }
}

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

function stepper(campo, etiqueta, valor) {
  return `
    <div class="field">
      <span class="field__label" id="et-${campo}">${etiqueta}</span>
      <div class="stepper" role="group" aria-labelledby="et-${campo}">
        <button type="button" data-paso="${campo}" data-dir="-1" aria-label="Menos">−</button>
        <output data-valor="${campo}" aria-live="polite">${valor}</output>
        <button type="button" data-paso="${campo}" data-dir="1" aria-label="Más">+</button>
      </div>
    </div>`;
}

function abrirPanel(contenedor, ctx, diaId, indice, ajustePrincipiante) {
  cerrarPanel();
  const d = datos(ctx);
  const rutina = d.rutina();
  const config = d.config();
  const base = rutina && rutina.dias.find((x) => x.id === diaId);
  const item = base && base.ejercicios[indice];
  if (!item) return;

  const ej = POR_ID.get(item.ejercicioId);
  const esTiempo = ej ? ej.tipo === 'tiempo' : Array.isArray(item.segundos);
  const tipo = planner.tipoMontaje(item);
  const pesos = planner.pesosPosibles(item, config);
  let iPeso = 0;
  if (pesos.length) {
    const actual = item.pesoSugerido ?? 0;
    pesos.forEach((p, k) => { if (p <= actual) iPeso = k; });
  }

  const b = {
    series: item.series,
    min: esTiempo ? (item.segundos || [30, 45])[0] : (item.repeticiones || [8, 12])[0],
    max: esTiempo ? (item.segundos || [30, 45])[1] : (item.repeticiones || [8, 12])[1],
    descanso: item.descanso,
  };
  const rangoVisible = esTiempo || !item.casiFallo;
  const LIM = {
    series: [1, 8, 1],
    min: esTiempo ? [5, 300, 5] : [1, 50, 1],
    max: esTiempo ? [5, 300, 5] : [1, 50, 1],
    descanso: [15, 600, 15],
  };
  const unidad = esTiempo ? ' s' : '';

  const panel = document.createElement('dialog');
  panel.className = 'sheet';
  panel.setAttribute('aria-labelledby', 'sheet-titulo');
  panelAbierto = panel;
  fondoPausado = contenedor;
  pausarFiguras(contenedor, true);

  const pintarAjuste = () => {
    const pesoHtml = pesos.length ? `
      <div class="field">
        <span class="field__label" id="et-peso">Peso${tipo === 'par-mancuernas' ? ' (cada mancuerna)' : ''}</span>
        <div class="stepper" role="group" aria-labelledby="et-peso">
          <button type="button" data-peso="-1" aria-label="Menos peso"${iPeso === 0 ? ' disabled' : ''}>−</button>
          <output aria-live="polite">${ctx.kg(pesos[iPeso])}</output>
          <button type="button" data-peso="1" aria-label="Más peso"${iPeso === pesos.length - 1 ? ' disabled' : ''}>+</button>
        </div>
        <p class="muted">${esc(textoMontaje(calcularMontaje(pesos[iPeso], tipo, config), tipo))}</p>
      </div>` : '';
    panel.innerHTML = `
      <div class="sheet__handle" aria-hidden="true"></div>
      <header class="sheet__header">
        <h2 class="sheet__title" id="sheet-titulo">${esc(nombreEj(item.ejercicioId))}</h2>
        <button type="button" class="btn btn--ghost btn--icon" data-accion="cerrar" aria-label="Cerrar">✕</button>
      </header>
      <div class="sheet__body">
        ${ajustePrincipiante ? '<p class="muted">Valores base: en las semanas de adaptación se hace 1 serie menos y +30 s de descanso.</p>' : ''}
        ${item.superserieCon ? `<p class="muted">Superserie con ${esc(nombreEj(item.superserieCon))}: comparten series y descanso.</p>` : ''}
        ${pesoHtml}
        ${stepper('series', 'Series', b.series)}
        ${rangoVisible ? stepper('min', esTiempo ? 'Segundos mínimos' : 'Repeticiones mínimas', b.min + unidad) : ''}
        ${rangoVisible ? stepper('max', esTiempo ? 'Segundos máximos' : 'Repeticiones máximas', b.max + unidad) : ''}
        ${item.casiFallo && !esTiempo ? '<p class="muted">Cada serie casi al fallo.</p>' : ''}
        ${stepper('descanso', 'Descanso', b.descanso + ' s')}
      </div>
      <footer class="sheet__footer">
        <button type="button" class="btn btn--primary btn--block" data-accion="guardar">Guardar</button>
        <button type="button" class="btn btn--secondary btn--block" data-accion="cambiar">Cambiar ejercicio</button>
        <button type="button" class="btn btn--ghost btn--block" data-accion="tecnica">Ver técnica</button>
        <button type="button" class="btn btn--secondary btn--block" data-accion="probar">${textoProbar()}</button>
      </footer>`;
  };

  // Prueba del cronómetro (Fase 5) con los valores que se ven en el panel.
  const segundosLibre = () => (rangoVisible ? b.max : (item.segundos || [30, 45])[1]);
  const textoProbar = () => (esTiempo ? `▶ Cronómetro (${segundosLibre()} s)` : `▶ Probar descanso (${b.descanso} s)`);
  const probar = () => {
    desbloquearAudio(); // dentro del toque: desbloquea el sonido
    const nombre = nombreEj(item.ejercicioId);
    if (esTiempo) iniciarLibre(segundosLibre(), { etiqueta: nombre });
    else iniciarDescanso(b.descanso, { etiqueta: 'Descanso', siguiente: nombre });
    // Igual que "Guardar": guarda los cambios pendientes (si los hay) y cierra el panel.
    guardar();
  };

  const pintarCambio = () => {
    const subs = planner.sustitutosPosibles(item.ejercicioId, config);
    const lista = subs.length
      ? `<div class="list">${subs.map((s) => `
          <button type="button" class="list__item" data-sustituto="${esc(s.id)}">
            <span class="list__thumb" aria-hidden="true">${htmlFigura(s.id, { tamano: 'mini', animada: false })}</span>
            <span class="list__text">
              <span class="list__title">${esc(s.nombre)}</span>
              <span class="list__meta">${esc(textoEquipo(s))}${s.apoyo ? ' · ' + esc(s.apoyo) : ''}</span>
            </span>
          </button>`).join('')}</div>`
      : '<p class="muted">No hay sustitutos posibles con tu equipo. Para progresar, usa la escalera de variantes del ejercicio.</p>';
    panel.innerHTML = `
      <div class="sheet__handle" aria-hidden="true"></div>
      <header class="sheet__header">
        <h2 class="sheet__title" id="sheet-titulo">Cambiar ${esc(nombreEj(item.ejercicioId))}</h2>
        <button type="button" class="btn btn--ghost btn--icon" data-accion="cerrar" aria-label="Cerrar">✕</button>
      </header>
      <div class="sheet__body">${lista}</div>
      <footer class="sheet__footer">
        <button type="button" class="btn btn--secondary btn--block" data-accion="volver">Volver al ajuste</button>
      </footer>`;
  };

  const guardarYPintar = (nueva, aviso) => {
    if (!d.guardar(nueva)) {
      ctx.toast('No se ha podido guardar la rutina');
      return;
    }
    cerrarPanel();
    render(contenedor, ctx);
    if (aviso) ctx.toast(aviso);
  };

  const guardar = () => {
    const cambios = {};
    if (b.series !== item.series) cambios.series = b.series;
    if (b.descanso !== item.descanso) cambios.descanso = b.descanso;
    if (rangoVisible) {
      const previo = esTiempo ? item.segundos : item.repeticiones;
      if (!previo || previo[0] !== b.min || previo[1] !== b.max) cambios[esTiempo ? 'segundos' : 'repeticiones'] = [b.min, b.max];
    }
    if (pesos.length && pesos[iPeso] !== item.pesoSugerido) cambios.pesoSugerido = pesos[iPeso];
    if (!Object.keys(cambios).length) { cerrarPanel(); return; }
    try {
      const fresca = d.rutina();
      guardarYPintar(planner.ajustarEjercicio(fresca, diaId, indice, cambios, d.config()), 'Ejercicio ajustado');
    } catch (err) {
      ctx.toast(err && err.message ? err.message : 'No se ha podido ajustar');
    }
  };

  panel.addEventListener('click', (e) => {
    if (e.target === panel) { cerrarPanel(); return; } // toque en el fondo
    const boton = e.target.closest('button');
    if (!boton) return;
    const { accion, paso, sustituto } = boton.dataset;
    if (paso) {
      const [mn, mx, st] = LIM[paso];
      b[paso] = limitar(b[paso] + Number(boton.dataset.dir) * st, mn, mx);
      if (paso === 'min' && b.min > b.max) b.max = b.min;
      if (paso === 'max' && b.max < b.min) b.min = b.max;
      for (const campo of ['series', 'min', 'max', 'descanso']) {
        const out = panel.querySelector(`[data-valor="${campo}"]`);
        if (out) out.textContent = b[campo] + (campo === 'descanso' ? ' s' : campo === 'series' ? '' : unidad);
      }
      const botonProbar = panel.querySelector('[data-accion="probar"]');
      if (botonProbar) botonProbar.textContent = textoProbar();
    } else if (boton.dataset.peso) {
      iPeso = limitar(iPeso + Number(boton.dataset.peso), 0, pesos.length - 1);
      pintarAjuste();
      panel.querySelector(`[data-peso="${boton.dataset.peso}"]`)?.focus();
    } else if (accion === 'guardar') guardar();
    else if (accion === 'cerrar') cerrarPanel();
    else if (accion === 'probar') probar();
    else if (accion === 'cambiar') pintarCambio();
    else if (accion === 'volver') pintarAjuste();
    else if (accion === 'tecnica') { cerrarPanel(); ctx.abrirEjercicio(item.ejercicioId); }
    else if (sustituto) {
      try {
        const nueva = planner.cambiarEjercicio(d.rutina(), diaId, indice, sustituto, d.config());
        const aviso = item.superserieCon
          ? `Cambiado por ${nombreEj(sustituto)}. Ya no va en superserie con ${nombreEj(item.superserieCon)}.`
          : `Cambiado por ${nombreEj(sustituto)}`;
        guardarYPintar(nueva, aviso);
      } catch (err) {
        ctx.toast(err && err.message ? err.message : 'No se ha podido cambiar');
      }
    }
  });
  // Botón atrás de Android o tecla Escape.
  panel.addEventListener('cancel', (e) => { e.preventDefault(); cerrarPanel(); });

  pintarAjuste();
  contenedor.appendChild(panel);
  if (typeof panel.showModal === 'function') panel.showModal();
  else panel.setAttribute('open', '');
}
