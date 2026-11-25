/*
 * MicroApp Gym — views/sesion.js  (pertenece a sesion-cronometro)
 * Pantalla SESIÓN ACTIVA. Lee CLAVES.sesionActiva en cada render(); toda la lógica de la sesión
 * es de workout.js, la de discos de data/equipment.js y el cronómetro de timer.js.
 *
 * Flujo:
 *  - "✓ Serie hecha" (dentro del toque): desbloquearAudio(), detiene el cronómetro si se ve,
 *    marca la serie (reps/segundos del stepper rápido), GUARDA sesionActiva y arranca
 *    iniciarDescanso(descanso, { siguiente }) salvo entre A y B de una superserie y tras la última.
 *  - Ejercicio de tiempo: "▶ Empezar" -> iniciarLibre(seg) y sesion.cronoLibre = la serie.
 *    alTerminar({ modo: 'libre' }) marca la serie con los segundos hechos y arranca el descanso.
 *  - Última serie: la sesión pasa a CLAVES.sesiones (terminada) y sesionActiva a null; resumen
 *    con confeti (sin confeti con prefers-reduced-motion).
 *  - Retomar: la posición va en la sesión guardada; al volver a #sesion se pinta la misma serie.
 *
 *  - Sin ninguna serie hecha, terminar (o saltarlo todo) DESCARTA la sesión (no va al historial).
 *  - Si termina en otra pantalla: aviso breve y el resumen se ve una vez al volver a #sesion
 *    (CLAVES.meta.resumenPendiente = id de la sesión).
 *
 * Exporta además, para rutina.js: archivarSesion(storage, sesion) ("Empezar de nuevo") y
 * leerSesionActiva(storage) (valida la sesión guardada y aparta la corrupta).
 * Clases nuevas: prefijo .session (ver el informe de la Fase 6), sin estilos en línea salvo las
 * variables del confeti, que styles.css pide así.
 */

import * as storage from '../storage.js';
import * as planner from '../planner.js';
import * as w from '../workout.js';
import { htmlFigura, pausarFiguras } from '../animations.js';
import { calcularMontaje, textoMontaje, kg } from '../data/equipment.js';
import {
  desbloquearAudio, iniciarDescanso, iniciarLibre, detener, alTerminar, alCambiar,
  estado as estadoCronometro,
} from '../timer.js';

const ESPERA_TRAS_LIBRE_MS = 1500; // deja sonar el aviso del fin de la plancha antes del descanso
const CHIP_TIPO = {
  barra: ['chip--barra', 'Barra'],
  'par-mancuernas': ['chip--mancuernas', '2 mancuernas'],
  'una-mancuerna': ['chip--mancuernas', '1 mancuerna'],
};

let vista = null;         // { contenedor, ctx } de la pantalla montada
let panelAbierto = null;
let resumenVisible = null; // sesión recién terminada cuyo resumen se está mostrando
let rapido = null;        // { clave: 'id:ejercicio:serie', valor } stepper junto al botón

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nombre = w.nombreEjercicio;
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

/* ---------- Datos ---------- */

/**
 * Sesión a medias guardada, o null. Si no tiene la forma mínima (workout.validarSesion), se
 * aparta una copia en 'mag:corrupto:sesionActiva:<ms>' y sesionActiva pasa a null.
 */
export function leerSesionActiva(st = storage) {
  const s = st.get(st.CLAVES.sesionActiva, null);
  if (s === null || s === undefined) return null;
  if (w.validarSesion(s)) return s;
  console.warn('[sesion] Sesión guardada no válida: se aparta y se empieza de cero.');
  st.set(`mag:corrupto:sesionActiva:${Date.now()}`, s);
  st.set(st.CLAVES.sesionActiva, null);
  return null;
}

const leer = () => leerSesionActiva(storage);

const guardar = (s) => storage.set(storage.CLAVES.sesionActiva, s);
const config = () => (vista && vista.ctx.config ? vista.ctx.config() : storage.getConfig());
const toast = (m) => vista && vista.ctx.toast && vista.ctx.toast(m);

/** Mueve la sesión (terminada) a CLAVES.sesiones y deja sesionActiva a null. true si se guardó. */
export function archivarSesion(st, sesion, ahora = Date.now()) {
  const fin = sesion.terminada ? sesion : w.terminar(sesion, ahora);
  const lista = st.get(st.CLAVES.sesiones, []);
  const nuevas = (Array.isArray(lista) ? lista : []).filter((s) => !s || s.id !== fin.id);
  nuevas.push(fin);
  if (!st.set(st.CLAVES.sesiones, nuevas)) return null;
  st.set(st.CLAVES.sesionActiva, null);
  return fin;
}

function textoPaso(p) {
  if (!p) return '';
  return `${nombre(p.item.ejercicioId)} · serie ${p.serie + 1} de ${p.item.series.length}`;
}

const esTiempo = (item) => Array.isArray(item.segundos);

function valorRapido(sesion, paso) {
  const clave = `${sesion.id}:${paso.ejercicio}:${paso.serie}`;
  if (!rapido || rapido.clave !== clave) {
    // Arrastra lo último hecho en este ejercicio; si no hay nada hecho, lo planeado.
    rapido = { clave, valor: w.valorSugerido(paso.item, paso.serie) };
  }
  return rapido.valor;
}

/* ---------- Pantalla ---------- */

export function render(contenedor, ctx) {
  cerrarPanel();
  vista = { contenedor, ctx };
  const sesion = leer();
  if (!sesion) {
    const pendiente = resumenPendiente(); // se consume siempre: solo se ve una vez
    if (!resumenVisible) resumenVisible = pendiente;
    if (resumenVisible) pintarResumen(contenedor, ctx, resumenVisible, false);
    else pintarVacio(contenedor, ctx);
    return;
  }
  resumenVisible = null;
  const paso = w.pasoActual(sesion);
  if (!paso) { finalizar(sesion); return; } // ya no quedaba nada (p. ej. todo saltado)
  pintarSesion(contenedor, sesion, paso);
}

function pintarVacio(contenedor, ctx) {
  contenedor.innerHTML = `
    <header class="screen__header"><div><h1 class="screen__title">Sesión</h1></div></header>
    <div class="empty-state">
      <p>No hay ninguna sesión en marcha.</p>
      <button type="button" class="btn btn--primary" data-accion="rutina">Ir a la rutina</button>
    </div>`;
  contenedor.querySelector('[data-accion="rutina"]').addEventListener('click', () => ctx.navegar('rutina'));
}

function pintarSesion(contenedor, sesion, paso) {
  const cfg = config();
  const item = paso.item;
  const tipo = planner.tipoMontaje(item);
  const aviso = w.avisoMontaje(sesion, paso, cfg);
  const tecnica = w.textoTecnica(item);
  const tiempo = esTiempo(item);
  const n = item.series.length;

  const chips = [];
  if (tipo) chips.push(`<span class="chip ${CHIP_TIPO[tipo][0]}">${CHIP_TIPO[tipo][1]}</span>`);
  else chips.push('<span class="chip chip--corporal">Peso corporal</span>');
  if (paso.superserie) {
    chips.push(`<span class="chip">Superserie ${paso.superserie.orden}/2 · con ${esc(nombre(paso.superserie.con))}</span>`);
  }

  const peso = tipo ? `${kg(paso.set.peso)}${tipo === 'par-mancuernas' ? ' cada una' : ''}` : '';
  const valor = valorRapido(sesion, paso);
  const series = item.series.map((s, i) => {
    const actual = i === paso.serie;
    const clase = s.hecha ? ' is-done' : actual ? ' is-current' : '';
    const cantidad = actual ? valor : tiempo ? s.segundos : s.repeticiones;
    const texto = textoPastilla(tipo, s.peso, cantidad, tiempo);
    const estadoTxt = s.hecha ? 'hecha' : actual ? 'actual' : 'pendiente';
    const etiqueta = `Serie ${i + 1} de ${n}, ${estadoTxt}: ${tipo ? kg(s.peso) + ', ' : ''}${cantidad} ${tiempo ? 'segundos' : 'repeticiones'}. Editar`;
    return `
      <li><button type="button" class="session__set${clase}" data-serie="${i}" aria-label="${esc(etiqueta)}"${actual ? ' aria-current="step"' : ''}>
        <span class="set-pill${clase}" aria-hidden="true">${i + 1}</span>
        <span class="session__set-text" aria-hidden="true">${esc(texto)}</span>
      </button></li>`;
  }).join('');

  const libre = estadoCronometro();
  const libreEnMarcha = tiempo && libre.activo && libre.modo === 'libre';

  contenedor.innerHTML = `
    <div class="session">
      <header class="screen__header session__header">
        <div>
          <p class="screen__subtitle">${esc(sesion.diaNombre || sesion.diaId)} · Ejercicio ${paso.numeroEjercicio} de ${paso.totalEjercicios}</p>
          <h1 class="screen__title">${esc(nombre(item.ejercicioId))}</h1>
        </div>
        <button type="button" class="screen__action btn btn--icon btn--ghost" data-accion="menu" aria-haspopup="dialog" aria-label="Opciones de la sesión">⋯</button>
      </header>
      <p class="row session__chips">${chips.join('')}</p>
      ${aviso ? `<p class="mount-alert session__mount" role="status">${esc(aviso.texto)}</p>` : ''}
      <div class="figure-card session__figure">${htmlFigura(item.ejercicioId, { tamano: 'grande' })}</div>
      <p class="session__target">
        <span class="session__target-set">Serie ${paso.serie + 1} de ${n}</span>
        <strong class="session__target-goal">${esc(w.textoObjetivo(item))}</strong>${peso ? `
        <span class="session__target-weight">${esc(peso)}</span>` : ''}
      </p>
      ${tecnica ? `<p class="session__technique accent">${esc(tecnica)}</p>` : ''}
      <ol class="set-pills session__sets" aria-label="Series de ${esc(nombre(item.ejercicioId))}">${series}</ol>
      <div class="session__actions">
        ${tiempo ? `<button type="button" class="btn btn--secondary btn--block session__start" data-accion="libre"${libreEnMarcha ? ' disabled' : ''}>${libreEnMarcha ? 'Cronómetro en marcha…' : `▶ Empezar ${valor} s`}</button>` : ''}
        <div class="session__quick">
          <span class="session__quick-label" id="ses-rapido">${tiempo ? 'Segundos' : 'Repeticiones'}</span>
          <div class="stepper" role="group" aria-labelledby="ses-rapido">
            <button type="button" data-rapido="-1" aria-label="${tiempo ? '5 segundos menos' : 'Una repetición menos'}">−</button>
            <output data-valor="rapido" aria-live="polite">${valor}</output>
            <button type="button" data-rapido="1" aria-label="${tiempo ? '5 segundos más' : 'Una repetición más'}">+</button>
          </div>
        </div>
        <button type="button" class="btn btn--primary btn--block session__done" data-accion="hecha">✓ Serie hecha</button>
      </div>
      <p class="sr-only" aria-live="polite" data-vivo></p>
    </div>`;

  const raiz = contenedor.firstElementChild;
  raiz.addEventListener('click', (e) => {
    const boton = e.target.closest('button');
    if (!boton || !raiz.contains(boton) || boton.disabled) return;
    const { accion, serie } = boton.dataset;
    if (accion === 'hecha') serieHecha();
    else if (accion === 'libre') empezarLibre();
    else if (accion === 'menu') abrirMenu();
    else if (boton.dataset.rapido) cambiarRapido(Number(boton.dataset.rapido), item);
    else if (serie !== undefined) abrirEdicion(paso.ejercicio, Number(serie));
  });
}

function textoPastilla(tipo, peso, cantidad, tiempo) {
  const medida = tiempo ? `${cantidad ?? '–'} s` : `${cantidad ?? '–'}`;
  return tipo ? `${kg(peso).replace(' kg', '')} × ${medida}` : medida;
}

function cambiarRapido(dir, item) {
  if (!rapido) return;
  rapido.valor = esTiempo(item)
    ? limitar((rapido.valor || 0) + dir * 5, 5, 600)
    : limitar((rapido.valor || 0) + dir, 1, 100);
  if (!vista) return;
  const out = vista.contenedor.querySelector('[data-valor="rapido"]');
  if (out) out.textContent = rapido.valor;
  const sesion = leer();
  const paso = sesion && w.pasoActual(sesion);
  const pastilla = vista.contenedor.querySelector('.session__set.is-current .session__set-text');
  if (pastilla && paso) pastilla.textContent = textoPastilla(planner.tipoMontaje(item), paso.set.peso, rapido.valor, esTiempo(item));
  const inicio = vista.contenedor.querySelector('[data-accion="libre"]:not([disabled])');
  if (inicio) inicio.textContent = `▶ Empezar ${rapido.valor} s`;
}

function anunciar(texto) {
  if (!vista) return;
  const vivo = vista.contenedor.querySelector('[data-vivo]');
  if (!vivo) return;
  vivo.textContent = '';
  setTimeout(() => { vivo.textContent = texto; }, 60);
}

function enfocarBoton() {
  const b = vista && vista.contenedor.querySelector('[data-accion="hecha"]');
  if (b) b.focus();
}

const vistaActiva = () => vista && vista.contenedor.isConnected && vista.contenedor.classList.contains('is-active');

/* ---------- Acciones ---------- */

function serieHecha() {
  desbloquearAudio(); // dentro del toque: el pitido del descanso podrá sonar
  const sesion = leer();
  const paso = sesion && w.pasoActual(sesion);
  if (!paso) { render(vista.contenedor, vista.ctx); return; }
  const datos = esTiempo(paso.item) ? { segundos: valorRapido(sesion, paso) } : { repeticiones: valorRapido(sesion, paso) };
  const est = estadoCronometro();
  if (est.visible) {
    if (est.modo === 'libre' && esTiempo(paso.item)) {
      if (est.fase === 'prep') {
        // Aún en el "Prepárate": no hay nada que registrar.
        detener();
        guardar(w.ponerCronoLibre(sesion, null));
        toast('Aún no habías empezado');
        render(vista.contenedor, vista.ctx);
        enfocarBoton();
        return;
      }
      // Plancha marcada a mano: cuenta lo hecho hasta ahora (o el total si ya terminó).
      datos.segundos = est.fase === 'cuenta'
        ? Math.max(1, Math.round((est.totalMs - est.restanteMs) / 1000))
        : Math.round(est.totalMs / 1000);
    }
    detener();
  }
  completarSerie(sesion, { ...datos, ejercicio: paso.ejercicio, serie: paso.serie }, { foco: true });
}

/** Marca, guarda, arranca el descanso y repinta. */
function completarSerie(sesion, datos, { foco = false, conDescanso = true } = {}) {
  let r;
  try {
    r = w.marcarSerie(sesion, datos, { config: config(), ahora: Date.now() });
  } catch (e) {
    console.error('[sesion] No se pudo marcar la serie', e);
    toast('No se ha podido marcar la serie');
    return;
  }
  const n = r.sesion.ejercicios[datos.ejercicio].series.length;
  if (r.completa) { finalizar(r.sesion); return; }
  if (!guardar(r.sesion)) toast('No se ha podido guardar la serie');
  rapido = null;

  let texto = `Serie ${datos.serie + 1} de ${n} hecha.`;
  if (r.descanso > 0 && conDescanso) {
    // El cronómetro ya anuncia el descanso.
    iniciarDescanso(r.descanso, { etiqueta: 'Descanso', siguiente: textoPaso(r.siguiente) });
  } else if (r.siguiente) {
    texto += ` Ahora: ${nombre(r.siguiente.item.ejercicioId)}.`;
  }
  if (r.cambioMontaje) texto += ` ${r.cambioMontaje.texto}.`;

  if (vistaActiva()) {
    render(vista.contenedor, vista.ctx);
    anunciar(texto);
    if (foco) enfocarBoton();
  }
}

function empezarLibre() {
  desbloquearAudio();
  const sesion = leer();
  const paso = sesion && w.pasoActual(sesion);
  if (!paso || !esTiempo(paso.item)) return;
  const seg = valorRapido(sesion, paso);
  if (!guardar(w.ponerCronoLibre(sesion, paso))) { toast('No se ha podido guardar la sesión'); return; }
  iniciarLibre(seg, { etiqueta: nombre(paso.item.ejercicioId) });
  render(vista.contenedor, vista.ctx);
  enfocarBoton();
}

// Fin del cronómetro libre: registra la serie de tiempo aunque la pantalla no esté a la vista.
alTerminar((d) => {
  if (!d || d.modo !== 'libre') return;
  const sesion = leer();
  if (!sesion || !sesion.cronoLibre) return;
  const { ejercicio, serie } = sesion.cronoLibre;
  const segundos = Math.round((Number(d.transcurridoMs) || 0) / 1000);
  if (d.motivo !== 'tiempo' && segundos < 1) {
    guardar(w.ponerCronoLibre(sesion, null)); // saltado durante el "Prepárate"
    if (vistaActiva()) render(vista.contenedor, vista.ctx);
    return;
  }
  const espera = d.motivo === 'tiempo' ? ESPERA_TRAS_LIBRE_MS : 0;
  setTimeout(() => {
    const fresca = leer();
    // Si mientras tanto se marcó a mano (o cambió la sesión), no se hace nada.
    if (!fresca || !fresca.cronoLibre || fresca.cronoLibre.ejercicio !== ejercicio || fresca.cronoLibre.serie !== serie) return;
    const item = fresca.ejercicios[ejercicio];
    // Si terminó hace más que el propio descanso (app en segundo plano), no se arranca.
    const conDescanso = (Number(d.terminadoHaceMs) || 0) < (item ? item.descanso * 1000 : 0);
    completarSerie(fresca, { ejercicio, serie, segundos: Math.max(1, segundos) }, { foco: true, conDescanso });
  }, espera);
});

// Botón "▶ Empezar" de la plancha: se desactiva mientras corre el cronómetro libre.
alCambiar((est) => {
  if (!vistaActiva()) return;
  const b = vista.contenedor.querySelector('[data-accion="libre"]');
  if (!b) return;
  const enMarcha = est.activo && est.modo === 'libre';
  b.disabled = enMarcha;
  b.textContent = enMarcha ? 'Cronómetro en marcha…' : `▶ Empezar ${rapido ? rapido.valor : ''} s`;
});

const sinSaltos = (r) => r.saltadas === 0 && r.seriesHechas >= r.seriesTotales;

/** Termina la sesión: al historial con resumen o, si no hay ninguna serie hecha, se descarta. */
function finalizar(sesion, { navegar = false } = {}) {
  const est = estadoCronometro();
  if (est.visible && est.modo === 'libre') detener();
  const r = w.resumen(sesion);
  if (r.seriesHechas === 0) {
    descartar('Sesión descartada: no había series hechas', { navegar });
    return;
  }
  const fin = archivarSesion(storage, sesion);
  if (!fin) {
    guardar(sesion);
    toast('No se ha podido guardar la sesión en el historial');
    return;
  }
  resumenVisible = fin;
  rapido = null;
  if (vistaActiva()) {
    pintarResumen(vista.contenedor, vista.ctx, fin, true);
  } else {
    // Terminó en otra pantalla (p. ej. la última plancha): el resumen se verá al volver.
    marcarResumenPendiente(fin.id);
    toast(sinSaltos(r) ? 'Sesión completada 🎉' : 'Sesión terminada');
  }
}

function descartar(mensaje, { navegar = false } = {}) {
  storage.set(storage.CLAVES.sesionActiva, null);
  rapido = null;
  resumenVisible = null;
  toast(mensaje);
  if (!vista) return;
  // Desde un toque se va a Rutina; desde render() (no se navega dentro de un render) se pinta vacío.
  if (navegar) vista.ctx.navegar('rutina');
  else if (vistaActiva()) pintarVacio(vista.contenedor, vista.ctx);
}

// Resumen de una sesión terminada fuera de la pantalla: se muestra una vez al volver a #sesion.
function marcarResumenPendiente(id) {
  const meta = storage.get(storage.CLAVES.meta, {}) || {};
  storage.set(storage.CLAVES.meta, { ...meta, resumenPendiente: id });
}

function resumenPendiente() {
  const meta = storage.get(storage.CLAVES.meta, {}) || {};
  if (!meta.resumenPendiente) return null;
  const { resumenPendiente: id, ...resto } = meta;
  storage.set(storage.CLAVES.meta, resto);
  const lista = storage.get(storage.CLAVES.sesiones, []);
  return (Array.isArray(lista) ? lista : []).find((x) => x && x.id === id) || null;
}

/* ---------- Resumen ---------- */

function pintarResumen(contenedor, ctx, sesion, celebrar) {
  const r = w.resumen(sesion);
  const minutos = Math.max(1, Math.round(r.duracionMs / 60000));
  const filas = r.porEjercicio.filter((e) => e.seriesHechas > 0).map((e) => `
      <li class="session__summary-item">
        <span class="session__summary-name">${esc(nombre(e.ejercicioId))}</span>
        <span class="muted">${e.seriesHechas} ${e.seriesHechas === 1 ? 'serie' : 'series'}${e.pesoMaximo > 0 ? ` · ${kg(e.pesoMaximo)}` : ''}</span>
      </li>`).join('');
  const completa = sinSaltos(r);
  contenedor.innerHTML = `
    <div class="session session--summary">
      <header class="screen__header">
        <div>
          <p class="screen__subtitle">${esc(sesion.diaNombre || sesion.diaId)}</p>
          <h1 class="screen__title">${completa ? '¡Sesión completada!' : 'Sesión terminada'}</h1>
        </div>
      </header>
      <section class="card session__summary" aria-label="Resumen de la sesión">
        <div class="row session__stats">
          <div class="stat"><span class="stat__value">${r.seriesHechas}</span><span class="stat__label">${r.seriesHechas === 1 ? 'serie' : 'series'}</span></div>
          <div class="stat"><span class="stat__value">${esc(kg(r.volumen).replace(' kg', ''))}</span><span class="stat__label">kg de volumen</span></div>
          <div class="stat"><span class="stat__value">${minutos}</span><span class="stat__label">min</span></div>
        </div>
        ${filas ? `<ul class="session__summary-list">${filas}</ul>` : ''}
      </section>
      <div class="session__progression" data-progresion hidden></div>
      <button type="button" class="btn btn--primary btn--block session__home" data-accion="hoy">Volver a Hoy</button>
    </div>`;
  contenedor.querySelector('[data-accion="hoy"]').addEventListener('click', () => {
    resumenVisible = null;
    ctx.navegar('hoy');
  });
  if (celebrar) {
    lanzarConfeti();
    const titulo = contenedor.querySelector('.screen__title');
    if (titulo) { titulo.setAttribute('tabindex', '-1'); titulo.focus(); }
  }
}

function lanzarConfeti() {
  if (typeof window === 'undefined' || !document.body) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colores = ['#C6F432', '#FF6B4A', '#FFFFFF', '#9BA3B1'];
  const capa = document.createElement('div');
  capa.className = 'confetti';
  capa.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('span');
    p.className = 'confetti__piece';
    // Variables por pieza: es el formato que pide styles.css (sección 14).
    p.style.setProperty('--x', `${Math.round(Math.random() * 100)}%`);
    p.style.setProperty('--delay', `${Math.round(Math.random() * 500)}ms`);
    p.style.setProperty('--dur', `${2200 + Math.round(Math.random() * 1200)}ms`);
    p.style.setProperty('--color', colores[i % colores.length]);
    p.style.setProperty('--drift', `${Math.round(Math.random() * 120 - 60)}px`);
    p.style.setProperty('--rot', `${360 + Math.round(Math.random() * 360)}deg`);
    capa.appendChild(p);
  }
  document.body.appendChild(capa);
  setTimeout(() => capa.remove(), 4200);
}

/* ---------- Paneles (<dialog class="sheet">) ---------- */

function cerrarPanel() {
  if (panelAbierto) {
    const p = panelAbierto;
    panelAbierto = null;
    if (p.open) p.close();
    p.remove();
    if (vista) pausarFiguras(vista.contenedor, false);
  }
}

function abrirPanel(pintar, alClic) {
  cerrarPanel();
  const panel = document.createElement('dialog');
  panel.className = 'sheet';
  panel.setAttribute('aria-labelledby', 'ses-sheet-titulo');
  panelAbierto = panel;
  pausarFiguras(vista.contenedor, true);
  panel.addEventListener('click', (e) => {
    if (e.target === panel) { cerrarPanel(); return; }
    const boton = e.target.closest('button');
    if (!boton || boton.disabled) return;
    if (boton.dataset.accion === 'cerrar') { cerrarPanel(); return; }
    alClic(boton, panel);
  });
  panel.addEventListener('cancel', (e) => { e.preventDefault(); cerrarPanel(); });
  pintar(panel);
  vista.contenedor.appendChild(panel);
  if (typeof panel.showModal === 'function') panel.showModal();
  else panel.setAttribute('open', '');
  return panel;
}

const cabecera = (titulo) => `
  <div class="sheet__handle" aria-hidden="true"></div>
  <header class="sheet__header">
    <h2 class="sheet__title" id="ses-sheet-titulo">${esc(titulo)}</h2>
    <button type="button" class="btn btn--ghost btn--icon" data-accion="cerrar" aria-label="Cerrar">✕</button>
  </header>`;

function stepper(campo, etiqueta, valor, extra = '') {
  return `
    <div class="field">
      <span class="field__label" id="ses-et-${campo}">${etiqueta}</span>
      <div class="stepper" role="group" aria-labelledby="ses-et-${campo}">
        <button type="button" data-paso="${campo}" data-dir="-1" aria-label="Menos">−</button>
        <output aria-live="polite">${esc(valor)}</output>
        <button type="button" data-paso="${campo}" data-dir="1" aria-label="Más">+</button>
      </div>
      ${extra}
    </div>`;
}

/** Editar peso y repeticiones/segundos de una serie (tocando su pastilla). */
function abrirEdicion(ejercicio, serie) {
  const sesion = leer();
  const item = sesion && sesion.ejercicios[ejercicio];
  const s = item && item.series[serie];
  if (!s) return;
  const cfg = config();
  const tipo = planner.tipoMontaje(item);
  const pesos = planner.pesosPosibles(item, cfg);
  const tiempo = esTiempo(item);
  let iPeso = 0;
  pesos.forEach((p, k) => { if (p <= s.peso) iPeso = k; });
  const actual = w.pasoActual(sesion);
  const esActual = actual && actual.ejercicio === ejercicio && actual.serie === serie;
  let medida = tiempo ? (s.segundos ?? 30) : (s.repeticiones ?? 10);
  if (esActual && rapido) medida = rapido.valor;

  const pintar = (panel) => {
    const pesoHtml = pesos.length ? stepper('peso', `Peso${tipo === 'par-mancuernas' ? ' (cada mancuerna)' : ''}`, kg(pesos[iPeso]),
      `<p class="muted">${esc(textoMontaje(calcularMontaje(pesos[iPeso], tipo, cfg), tipo))}</p>`) : '';
    panel.innerHTML = `
      ${cabecera(`Serie ${serie + 1} · ${nombre(item.ejercicioId)}`)}
      <div class="sheet__body">
        <p class="muted">Objetivo: ${esc(w.textoObjetivo(item))}${s.hecha ? ' · Hecha' : ''}</p>
        ${pesoHtml}
        ${stepper('medida', tiempo ? 'Segundos' : 'Repeticiones', tiempo ? `${medida} s` : medida)}
        ${!s.hecha && pesos.length ? '<p class="muted">El peso nuevo se aplica también a las series pendientes de este ejercicio.</p>' : ''}
      </div>
      <footer class="sheet__footer">
        <button type="button" class="btn btn--primary btn--block" data-accion="guardar">Guardar</button>
        ${s.hecha ? '<button type="button" class="btn btn--secondary btn--block" data-accion="desmarcar">Marcar como no hecha</button>' : ''}
      </footer>`;
  };

  abrirPanel(pintar, (boton, panel) => {
    const { accion, paso, dir } = boton.dataset;
    if (paso === 'peso') {
      iPeso = limitar(iPeso + Number(dir), 0, pesos.length - 1);
      pintar(panel);
      panel.querySelector(`[data-paso="peso"][data-dir="${dir}"]`)?.focus();
    } else if (paso === 'medida') {
      medida = tiempo ? limitar(medida + Number(dir) * 5, 5, 600) : limitar(medida + Number(dir), 1, 100);
      pintar(panel);
      panel.querySelector(`[data-paso="medida"][data-dir="${dir}"]`)?.focus();
    } else if (accion === 'guardar' || accion === 'desmarcar') {
      const fresca = leer();
      if (!fresca) { cerrarPanel(); return; }
      const cambios = tiempo ? { segundos: medida } : { repeticiones: medida };
      if (pesos.length) cambios.peso = pesos[iPeso];
      if (accion === 'desmarcar') {
        cambios.hecha = false;
        // Desmarcar la última serie hecha con su descanso en marcha: se para el descanso.
        const ult = w.ultimaHecha(fresca);
        const est = estadoCronometro();
        if (ult && ult.ejercicio === ejercicio && ult.serie === serie && est.visible && est.modo === 'descanso') detener();
      }
      const nueva = w.editarSerie(fresca, ejercicio, serie, cambios);
      if (!guardar(nueva)) toast('No se ha podido guardar');
      if (esActual || accion === 'desmarcar') rapido = null;
      cerrarPanel();
      render(vista.contenedor, vista.ctx);
      anunciar(`Serie ${serie + 1} ${accion === 'desmarcar' ? 'marcada como no hecha' : 'actualizada'}`);
      enfocarBoton();
    }
  });
}

/** Menú de la sesión: saltar ejercicio, ver técnica, terminar (con confirmación). */
function abrirMenu() {
  const sesion = leer();
  const paso = sesion && w.pasoActual(sesion);
  if (!paso) return;
  const r = w.resumen(sesion);
  let confirmando = false;

  const pintar = (panel) => {
    panel.innerHTML = confirmando ? `
      ${cabecera('¿Terminar la sesión?')}
      <div class="sheet__body">
        <p>Llevas ${r.seriesHechas} de ${r.seriesTotales} series.</p>
        <p class="muted">${r.seriesHechas > 0 ? 'Se guardará en el historial con las series hechas.' : 'No hay ninguna serie hecha: la sesión se descartará.'}</p>
      </div>
      <footer class="sheet__footer">
        <button type="button" class="btn btn--danger btn--block" data-accion="terminar-si">Terminar sesión</button>
        <button type="button" class="btn btn--secondary btn--block" data-accion="seguir">Seguir entrenando</button>
      </footer>` : `
      ${cabecera('Opciones de la sesión')}
      <div class="sheet__body">
        <p class="muted">${esc(nombre(paso.item.ejercicioId))} · ${r.seriesHechas} de ${r.seriesTotales} series hechas</p>
      </div>
      <footer class="sheet__footer">
        <button type="button" class="btn btn--secondary btn--block" data-accion="saltar">Saltar ejercicio</button>
        <button type="button" class="btn btn--ghost btn--block" data-accion="tecnica">Ver técnica</button>
        <button type="button" class="btn btn--danger btn--block" data-accion="terminar">Terminar sesión</button>
      </footer>`;
  };

  abrirPanel(pintar, (boton, panel) => {
    const { accion } = boton.dataset;
    if (accion === 'terminar') { confirmando = true; pintar(panel); panel.querySelector('[data-accion="seguir"]')?.focus(); }
    else if (accion === 'seguir') { cerrarPanel(); enfocarBoton(); }
    else if (accion === 'tecnica') {
      cerrarPanel();
      if (vista.ctx.abrirEjercicio) vista.ctx.abrirEjercicio(paso.item.ejercicioId);
    } else if (accion === 'saltar') saltar();
    else if (accion === 'terminar-si') terminarAhora();
  });
}

function saltar() {
  const sesion = leer();
  if (!sesion) { cerrarPanel(); return; }
  const actual = w.pasoActual(sesion);
  const est = estadoCronometro();
  if (est.visible && est.modo === 'libre') detener();
  const r = w.saltar(sesion);
  const nueva = r.sesion;
  cerrarPanel();
  if (w.completa(nueva)) { finalizar(nueva, { navegar: true }); return; }
  if (!guardar(nueva)) toast('No se ha podido guardar');
  rapido = null;
  // Saltar B justo después de A: el descanso de la pareja.
  if (r.descanso > 0) iniciarDescanso(r.descanso, { etiqueta: 'Descanso', siguiente: textoPaso(r.siguiente) });
  render(vista.contenedor, vista.ctx);
  anunciar(`${actual ? nombre(actual.item.ejercicioId) : 'Ejercicio'} saltado. Ahora: ${textoPaso(w.pasoActual(nueva))}`);
  enfocarBoton();
}

function terminarAhora() {
  const sesion = leer();
  cerrarPanel();
  if (!sesion) return;
  const est = estadoCronometro();
  if (est.visible) detener();
  finalizar(sesion, { navegar: true }); // sin series hechas, se descarta
}
