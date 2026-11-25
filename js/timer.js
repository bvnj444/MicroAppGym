/*
 * MicroApp Gym — timer.js  (pertenece a sesion-cronometro)
 * Cronómetro de descanso y cronómetro libre (ejercicios de tiempo, p. ej. plancha).
 *
 * El tiempo se calcula SIEMPRE con marcas de hora absolutas (Date.now()): se guarda
 * el instante de fin (finEn) y lo que queda es finEn - ahora. Nunca se suman intervalos,
 * así que no se desfasa si Chrome frena la página o el móvil se bloquea.
 *
 * API (independiente de la sesión):
 *   desbloquearAudio()                          -> Promise<boolean>. Llamar DENTRO de un toque
 *                                                  del usuario ("✓ Serie hecha", botón de prueba).
 *   iniciarDescanso(segundos, { etiqueta = 'Descanso', siguiente = '' })
 *   iniciarLibre(segundos, { etiqueta = 'Ejercicio' })   3 s de "Prepárate" y luego la cuenta.
 *   ajustar(deltaSegundos)                      -> estado(). Nunca deja el restante por debajo de 0;
 *                                                  en el libre, el ejercicio dura al menos 5 s.
 *   saltar()                                    -> termina ya (motivo 'saltado'); si ya había
 *                                                  terminado, cierra la franja.
 *   detener()                                   -> cierra sin avisar ni emitir 'fin'.
 *   estado() -> { activo, terminado, visible, modo, fase, restanteMs, totalMs, terminadoHaceMs,
 *                 etiqueta, siguiente, finEn }
 *       activo: hay una cuenta atrás en marcha (fase 'prep' o 'cuenta').
 *       fase: 'prep' (3-2-1 del libre; restanteMs/totalMs son los de la preparación)
 *             | 'cuenta' | 'fin' | null.
 *   alTerminar(fn) -> función para quitar el oyente. fn({ modo, motivo: 'tiempo' | 'saltado',
 *                     etiqueta, siguiente, terminadoHaceMs, transcurridoMs })
 *                     transcurridoMs: en el libre, ms del ejercicio hechos (sin la preparación).
 *   alCambiar(fn)  -> función para quitar el oyente. fn(estado()) al iniciar, ajustar, cambiar
 *                     de fase, terminar y cerrar (no en cada segundo).
 *   probarAviso()  -> hace el aviso de fin (según Ajustes) sin cronómetro. Llamar dentro de un toque.
 *   canalesAviso(avisos) -> { sonido, vibracion, pitarBloqueado } (función pura, para pruebas).
 *   crearCronometro({ ahora, guardar, borrar, alEvento }) -> núcleo sin DOM (para pruebas).
 *
 * Modo de aviso: storage.getConfig().avisos = { modo: 'ambos' | 'sonido' | 'vibracion',
 * pitarBloqueado }. Se lee en el momento de avisar o de programar los pitidos (no se guarda
 * al iniciar) y se reprograma al recibir el evento window 'mag:config'. El destello sale siempre.
 *   'sonido'    -> sin vibración (fin, aviso de 3 s, "¡Ya!").
 *   'vibracion' -> sin pitidos (ni los programados en el reloj de audio).
 * pitarBloqueado (y modo distinto de 'vibracion'): mientras hay una cuenta activa suena en bucle
 * un <audio> casi silencioso (WAV generado al vuelo) para que Chrome Android trate la página como
 * reproducción multimedia y no suspenda Web Audio con la pantalla bloqueada. Se muestra en la
 * notificación multimedia ("Descanso · 1:30"); sus botones Pausa/Detener equivalen a "Saltar".
 * Se para 3 s después del fin (para no cortar los pitidos) o al saltar, detener o cerrar.
 *
 * Guardado: clave 'mag:cronometro' (storage.set/get, envuelta en { v, d } como las demás):
 *   { version: 1, modo: 'descanso' | 'libre', etiqueta, siguiente,
 *     inicioEn, prepFinEn, finEn,            // marcas de hora absolutas (ms, Date.now())
 *     totalMs,                               // duración de la cuenta (sin la preparación)
 *     terminado: boolean, avisado: boolean } // avisado: ya sonó/vibró el fin
 *   Se borra al cerrar el cronómetro. Al reabrir la app sigue la cuenta o muestra
 *   "Descanso terminado hace X s" (si terminó hace más de 15 min se descarta).
 *
 * Doble toque: durante 600 ms tras mostrarse la franja o cambiar de forma (descanso/libre,
 * preparación, terminado) se ignoran los toques en −15 s, +15 s y Saltar.
 *
 * Marcado (estilos de disenador-ui): <section class="timer"> con estados is-expanded,
 * is-warning (≤ 10 s), is-done, is-free, is-prep; <div class="flash"> con is-on ~1,2 s;
 * body.has-timer mientras la franja se ve.
 */

import * as storage from './storage.js';

export const CLAVE_CRONOMETRO = 'mag:cronometro';

const PREP_MS = 3000;
const MIN_LIBRE_MS = 5000;         // el ejercicio de tiempo nunca dura menos de 5 s
const AVISO_MS = 10000;            // is-warning y anuncio "Quedan 10 segundos"
const PITIDO_PREVIO_MS = 3000;     // pitido corto a los 3 s restantes
const AVISO_AL_VOLVER_MS = 60000;  // al volver, solo vibra/pita si terminó hace menos de esto
const CADUCIDAD_MS = 15 * 60000;   // un cronómetro terminado hace más de esto se descarta
const DESTELLO_MS = 1200;
const VIBRACION_FIN = [400, 150, 400, 150, 800];
const VIBRACION_PREVIA = [80];
const VIBRACION_YA = [200];

/* =====================================================================
 * Núcleo: lógica de tiempo sin DOM (reloj inyectable para las pruebas)
 * ===================================================================== */

export function crearCronometro({
  ahora = () => Date.now(),
  guardar = () => {},
  borrar = () => {},
  alEvento = () => {},
} = {}) {
  let s = null;
  let fasePrevia = null;

  const emitir = (tipo, detalle) => {
    try { alEvento(tipo, detalle); } catch (e) { console.error('[timer] Error en un oyente', e); }
  };
  const persistir = () => (s ? guardar({ version: 1, ...s }) : borrar());

  function faseEn(t) {
    if (!s) return null;
    if (s.terminado || t >= s.finEn) return 'fin';
    if (t < s.prepFinEn) return 'prep';
    return 'cuenta';
  }

  function estado() {
    const t = ahora();
    if (!s) {
      return { activo: false, terminado: false, visible: false, modo: null, fase: null, restanteMs: 0,
        totalMs: 0, terminadoHaceMs: null, etiqueta: '', siguiente: '', finEn: null };
    }
    const fase = faseEn(t);
    return {
      activo: fase !== 'fin',
      terminado: fase === 'fin',
      visible: true,
      modo: s.modo,
      fase,
      restanteMs: fase === 'prep' ? s.prepFinEn - t : fase === 'cuenta' ? s.finEn - t : 0,
      totalMs: fase === 'prep' ? PREP_MS : s.totalMs,
      terminadoHaceMs: fase === 'fin' ? Math.max(0, t - s.finEn) : null,
      etiqueta: s.etiqueta,
      siguiente: s.siguiente,
      finEn: s.finEn,
    };
  }

  function iniciar(modo, segundos, etiqueta, siguiente) {
    const seg = Math.max(modo === 'libre' ? MIN_LIBRE_MS / 1000 : 1, Math.round(Number(segundos) || 0));
    const t = ahora();
    const prep = modo === 'libre' ? PREP_MS : 0;
    s = {
      modo,
      etiqueta: String(etiqueta || (modo === 'libre' ? 'Ejercicio' : 'Descanso')),
      siguiente: String(siguiente || ''),
      inicioEn: t,
      prepFinEn: t + prep,
      finEn: t + prep + seg * 1000,
      totalMs: seg * 1000,
      terminado: false,
      avisado: false,
    };
    fasePrevia = faseEn(t);
    persistir();
    emitir('cambio', estado());
    return estado();
  }

  /** Revisa el reloj: emite 'fin' si ya pasó finEn y 'cambio' si cambió de fase. */
  function comprobar() {
    if (!s) return null;
    const t = ahora();
    const fase = faseEn(t);
    if (fase === 'fin' && !s.terminado) {
      s.terminado = true;
      fasePrevia = 'fin';
      persistir();
      emitir('fin', {
        modo: s.modo, motivo: 'tiempo', etiqueta: s.etiqueta, siguiente: s.siguiente,
        terminadoHaceMs: Math.max(0, t - s.finEn), transcurridoMs: s.totalMs,
      });
      emitir('cambio', estado());
      return 'fin';
    }
    if (fase !== fasePrevia) {
      fasePrevia = fase;
      emitir('cambio', estado());
      return 'fase';
    }
    return null;
  }

  function ajustar(deltaSegundos) {
    if (!s || s.terminado) return estado();
    const t = ahora();
    if (faseEn(t) === 'fin') { comprobar(); return estado(); }
    const delta = Math.round(Number(deltaSegundos) || 0) * 1000;
    if (!delta) return estado();
    const base = Math.max(t, s.prepFinEn);         // desde cuándo cuenta el restante
    const minimo = s.modo === 'libre' ? Math.max(base, s.prepFinEn + MIN_LIBRE_MS) : base;
    s.finEn = Math.max(minimo, s.finEn + delta);   // nunca por debajo de 0 (ni de 5 s en el libre)
    const restante = s.finEn - base;
    s.totalMs = Math.max(restante, s.totalMs + delta, 1000);
    persistir();
    if (comprobar() !== 'fin') emitir('cambio', estado());
    return estado();
  }

  function saltar() {
    if (!s) return estado();
    const t = ahora();
    if (s.terminado || faseEn(t) === 'fin') {
      if (!s.terminado) comprobar();
      detener();
      return estado();
    }
    const detalle = {
      modo: s.modo, motivo: 'saltado', etiqueta: s.etiqueta, siguiente: s.siguiente,
      terminadoHaceMs: 0,
      transcurridoMs: Math.max(0, Math.min(s.totalMs, t - s.prepFinEn)),
    };
    s = null;
    fasePrevia = null;
    persistir();
    emitir('fin', detalle);
    emitir('cambio', estado());
    return estado();
  }

  function detener() {
    if (!s) return estado();
    s = null;
    fasePrevia = null;
    persistir();
    emitir('cambio', estado());
    return estado();
  }

  function marcarAvisado() {
    if (s && !s.avisado) { s.avisado = true; persistir(); }
  }

  /** Recupera un estado guardado. Devuelve true si hay cronómetro que mostrar. */
  function restaurar(guardado) {
    const g = guardado;
    const num = (n) => typeof n === 'number' && Number.isFinite(n);
    if (!g || typeof g !== 'object' || !['descanso', 'libre'].includes(g.modo)
      || !num(g.inicioEn) || !num(g.prepFinEn) || !num(g.finEn) || !num(g.totalMs)
      || g.prepFinEn < g.inicioEn || g.finEn < g.prepFinEn) {
      if (g) borrar();
      return false;
    }
    const t = ahora();
    // Terminado hace mucho, o reloj del móvil cambiado: se descarta.
    if (t - g.finEn > CADUCIDAD_MS || g.finEn - t > 6 * 3600000) { borrar(); return false; }
    s = {
      modo: g.modo, etiqueta: String(g.etiqueta || ''), siguiente: String(g.siguiente || ''),
      inicioEn: g.inicioEn, prepFinEn: g.prepFinEn, finEn: g.finEn, totalMs: g.totalMs,
      terminado: g.terminado === true, avisado: g.avisado === true,
    };
    fasePrevia = faseEn(t);
    return true;
  }

  return {
    iniciarDescanso: (seg, { etiqueta = 'Descanso', siguiente = '' } = {}) => iniciar('descanso', seg, etiqueta, siguiente),
    iniciarLibre: (seg, { etiqueta = 'Ejercicio' } = {}) => iniciar('libre', seg, etiqueta, ''),
    ajustar, saltar, detener, estado, comprobar, marcarAvisado, restaurar,
    /** Datos crudos (solo lectura) para programar sonidos y temporizadores. */
    datos: () => (s ? { ...s } : null),
  };
}

/* =====================================================================
 * Modo de aviso (función pura)
 * ===================================================================== */

const MODOS_AVISO = ['ambos', 'sonido', 'vibracion'];

/** Decide por qué canales se avisa según config.avisos (con valores por defecto si falta). */
export function canalesAviso(avisos) {
  const a = avisos && typeof avisos === 'object' ? avisos : {};
  const modo = MODOS_AVISO.includes(a.modo) ? a.modo : 'ambos';
  const sonido = modo !== 'vibracion';
  return { sonido, vibracion: modo !== 'sonido', pitarBloqueado: sonido && a.pitarBloqueado === true };
}

/** Lee la configuración actual (puede cambiar con un descanso en marcha). */
function canales() {
  try { return canalesAviso(storage.getConfig().avisos); } catch (e) { return canalesAviso(null); }
}

/* =====================================================================
 * Oyentes públicos
 * ===================================================================== */

const oyentesFin = new Set();
const oyentesCambio = new Set();

export function alTerminar(fn) {
  if (typeof fn === 'function') oyentesFin.add(fn);
  return () => oyentesFin.delete(fn);
}

export function alCambiar(fn) {
  if (typeof fn === 'function') oyentesCambio.add(fn);
  return () => oyentesCambio.delete(fn);
}

function avisarOyentes(lista, dato) {
  for (const fn of [...lista]) {
    try { fn(dato); } catch (e) { console.error('[timer] Error en un oyente', e); }
  }
}

/* =====================================================================
 * Instancia de la app (navegador)
 * ===================================================================== */

const hayDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

const nucleo = crearCronometro({
  ahora: () => Date.now(),
  guardar: (v) => storage.set(CLAVE_CRONOMETRO, v),
  borrar: () => storage.remove(CLAVE_CRONOMETRO),
  alEvento: (tipo, detalle) => {
    if (tipo === 'fin') alFinNucleo(detalle);
    if (tipo === 'cambio') alCambioNucleo(detalle);
  },
});

export function estado() { return nucleo.estado(); }

export function iniciarDescanso(segundos, opciones = {}) {
  prepararVista();
  const r = nucleo.iniciarDescanso(segundos, opciones);
  anunciar(`${r.etiqueta}: ${textoDuracion(r.totalMs)}`);
  iniciarAudioFondo(); // llega de un toque: se puede reproducir
  return r;
}

export function iniciarLibre(segundos, opciones = {}) {
  prepararVista();
  const r = nucleo.iniciarLibre(segundos, opciones);
  anunciar(`Prepárate: ${r.etiqueta}, ${textoDuracion(nucleo.datos().totalMs)}`);
  iniciarAudioFondo();
  return r;
}

export function ajustar(deltaSegundos) { return nucleo.ajustar(deltaSegundos); }
export function saltar() { return nucleo.saltar(); }
export function detener() { return nucleo.detener(); }

// Estado de la vista (no se guarda).
let ui = null;               // referencias a los nodos
let rafId = 0;
let timeoutId = 0;
let tickDoneId = 0;
let lejos = false;           // terminó con la app oculta o cerrada: "terminado hace X s"
let finOculto = false;       // terminó estando oculta: avisar al volver
let anuncio10 = false;
let pitidoPrevioHecho = false;
let ultimoTexto = '';
let faseVista = null;        // última fase mostrada (para detectar el paso de prep a cuenta)

function prepararVista() {
  lejos = false;
  finOculto = false;
  anuncio10 = false;
  pitidoPrevioHecho = false;
  faseVista = null;
}

function alCambioNucleo(est) {
  if (hayDOM) {
    if (est.visible) {
      asegurarUI();
      mostrar(true);
      pedirWakeLock();
      programarTimeout();
      programarAudio();
      if (faseVista === 'prep' && est.fase === 'cuenta' && !document.hidden) {
        // Acaba de pasar de "Prepárate" a la cuenta.
        vibrar(VIBRACION_YA);
        anunciar('¡Ya!');
      }
      faseVista = est.fase;
      arrancarBucle();
    } else {
      faseVista = null;
      mostrar(false);
      pararBucle();
      clearTimeout(timeoutId);
      cancelarAudio();
      soltarWakeLock();
      pararAudioFondo();
    }
  }
  avisarOyentes(oyentesCambio, est);
}

function alFinNucleo(detalle) {
  if (hayDOM && detalle.motivo === 'tiempo') {
    const tarde = detalle.terminadoHaceMs > 1500;
    if (document.visibilityState === 'hidden') {
      // Se intenta sonar y vibrar (el pitido ya puede estar programado en el reloj de audio);
      // al volver se avisa de nuevo si hace menos de 60 s.
      if (!sonandoFinProgramado()) pitidosFin();
      vibrar(VIBRACION_FIN);
      finOculto = true;
      lejos = true;
    } else if (tarde) {
      lejos = true;
      avisoAlVolver();
    } else {
      avisoCompleto(false);
      anunciar(detalle.modo === 'libre' ? 'Tiempo cumplido' : 'Descanso terminado');
    }
    nucleo.marcarAvisado();
    actualizarTituloFondo();
    pararAudioFondoEn(PARAR_FONDO_TRAS_FIN_MS);
  }
  avisarOyentes(oyentesFin, detalle);
}

/* ---------- Avisos ---------- */

function avisoCompleto(forzarPitido) {
  destello();
  vibrar(VIBRACION_FIN);
  if (forzarPitido || !sonandoFinProgramado()) {
    cancelarAudio();
    pitidosFin();
  }
}

function avisoAlVolver() {
  const est = nucleo.estado();
  const hace = est.terminadoHaceMs ?? 0;
  const yaAvisado = (nucleo.datos() || {}).avisado;
  if (hace < AVISO_AL_VOLVER_MS && (!yaAvisado || finOculto)) avisoCompleto(true);
  else destello();
  finOculto = false;
  anunciar(`${est.modo === 'libre' ? 'Tiempo cumplido' : 'Descanso terminado'} hace ${Math.round(hace / 1000)} s`);
}

function vibrar(patron) {
  if (!canales().vibracion) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(patron);
  } catch (e) { /* sin vibración: queda el aviso visual */ }
}

const hayPopover = hayDOM && typeof HTMLElement !== 'undefined'
  && typeof HTMLElement.prototype.showPopover === 'function';

function destello() {
  if (!ui) return;
  const f = ui.flash;
  // Como popover va en la capa superior: se ve también encima de un <dialog> modal abierto.
  if (hayPopover) {
    try {
      if (f.matches(':popover-open')) f.hidePopover();
      f.showPopover();
    } catch (e) { /* sin capa superior: z-index normal */ }
  }
  f.classList.remove('is-on');
  void f.offsetWidth; // reinicia la animación si ya estaba
  f.classList.add('is-on');
  clearTimeout(destello.t);
  destello.t = setTimeout(() => {
    f.classList.remove('is-on');
    if (hayPopover) { try { if (f.matches(':popover-open')) f.hidePopover(); } catch (e) { /* nada */ } }
  }, DESTELLO_MS);
}

function anunciar(texto) {
  if (!ui) asegurarUIsiHayDOM();
  if (!ui) return;
  ui.vivo.textContent = '';
  // En otro fotograma para que el lector de pantalla lo lea aunque se repita.
  setTimeout(() => { if (ui) ui.vivo.textContent = texto; }, 50);
}

/* ---------- Audio (Web Audio) ---------- */

let audio = null;
let programados = [];       // { o, inicio }: pitidos programados en el reloj de audio
let finAudio = null;        // instante (reloj de audio) del pitido final programado

function claseAudio() {
  if (!hayDOM) return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export async function desbloquearAudio() {
  const Clase = claseAudio();
  if (!Clase) return false;
  try {
    if (!audio) {
      audio = new Clase();
      audio.addEventListener?.('statechange', () => programarAudio());
    }
    if (audio.state !== 'running') await audio.resume();
    // Un sonido inaudible dentro del toque termina de desbloquearlo en algunos móviles.
    const o = audio.createOscillator();
    const g = audio.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.02);
    programarAudio();
    return audio.state === 'running';
  } catch (e) {
    console.warn('[timer] No se pudo activar el sonido', e);
    return false;
  }
}

const audioListo = () => audio && audio.state === 'running';

/** Pitido con rampas de volumen (sin clics). Devuelve el oscilador. */
function pitido(inicio, { frecuencia = 880, duracion = 0.15, volumen = 0.6, forma = 'triangle' } = {}) {
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = forma;
  o.frequency.setValueAtTime(frecuencia, inicio);
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(volumen, inicio + 0.012);
  g.gain.setValueAtTime(volumen, inicio + Math.max(0.013, duracion - 0.04));
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
  o.connect(g).connect(audio.destination);
  o.start(inicio);
  o.stop(inicio + duracion + 0.02);
  o.onended = () => { try { g.disconnect(); } catch (e) { /* nada */ } };
  return o;
}

function tresPitidos(inicio) {
  return [0, 0.28, 0.56].map((d) => ({
    o: pitido(inicio + d, { frecuencia: 1046, duracion: 0.18, volumen: 0.7 }), inicio: inicio + d,
  }));
}

function pitidosFin() {
  if (!audioListo() || !canales().sonido) return;
  try { tresPitidos(audio.currentTime + 0.03); } catch (e) { console.warn('[timer] Pitido', e); }
}

function cancelarAudio() {
  // Solo se cancelan los que aún no han empezado: un pitido que ya suena no se corta.
  const t = audio ? audio.currentTime : 0;
  for (const { o, inicio } of programados) {
    if (inicio <= t + 0.01) continue;
    try { o.stop(0); } catch (e) { /* ya había sonado */ }
  }
  programados = [];
  finAudio = null;
}

/** ¿Está sonando (o acaba de sonar) el pitido final programado en el reloj de audio? */
function sonandoFinProgramado() {
  if (!audioListo() || finAudio === null) return false;
  const t = audio.currentTime;
  return t >= finAudio - 0.15 && t <= finAudio + 3;
}

/**
 * Programa los pitidos en el reloj de audio, que sigue corriendo aunque Chrome frene
 * los temporizadores de la página: así suenan a su hora aunque no haya fotogramas.
 */
function programarAudio() {
  const d = nucleo.datos();
  if (d && d.terminado) return; // el pitido final ya está sonando o se avisa aparte
  cancelarAudio();
  if (!d || !audioListo() || !canales().sonido) return;
  const ahora = Date.now();
  const base = audio.currentTime;
  const enAudio = (ms) => base + (ms - ahora) / 1000;
  const futuro = (ms) => ms - ahora > 30;
  const poner = (ms, opciones) => programados.push({ o: pitido(enAudio(ms), opciones), inicio: enAudio(ms) });
  try {
    if (d.modo === 'libre') {
      for (const ms of [d.prepFinEn - 2000, d.prepFinEn - 1000]) {
        if (futuro(ms)) poner(ms, { frecuencia: 660, duracion: 0.1, volumen: 0.5 });
      }
      if (futuro(d.prepFinEn)) poner(d.prepFinEn, { frecuencia: 1320, duracion: 0.35, volumen: 0.7 });
    }
    const previo = d.finEn - PITIDO_PREVIO_MS;
    if (previo > d.prepFinEn + 500 && futuro(previo)) {
      poner(previo, { frecuencia: 660, duracion: 0.1, volumen: 0.5 });
    }
    if (futuro(d.finEn)) {
      finAudio = enAudio(d.finEn);
      programados.push(...tresPitidos(finAudio));
    }
  } catch (e) {
    console.warn('[timer] No se pudieron programar los pitidos', e);
  }
}

/** Aviso de fin de prueba (botón "Probar aviso" de Ajustes). Llamar dentro de un toque. */
export function probarAviso() {
  const c = canales();
  asegurarUIsiHayDOM();
  destello();
  vibrar(VIBRACION_FIN);
  if (c.sonido) {
    return desbloquearAudio().then(() => { pitidosFin(); return c; }).catch(() => c);
  }
  return Promise.resolve(c);
}

/* ---------- Audio de fondo: pitar con el móvil bloqueado ---------- */

const PARAR_FONDO_TRAS_FIN_MS = 3000;  // deja sonar los 3 pitidos antes de soltar la sesión
const TITULO_CADA_MS = 15000;

let fondo = null;          // <audio> en bucle
let fondoUrl = '';
let fondoTituloId = 0;
let fondoParadaId = 0;

/** WAV mono PCM 16 bit con ruido de amplitud ínfima (±2/32767): inaudible pero no "silencio". */
export function wavCasiSilencio(segundos = 8, muestreo = 8000) {
  const n = segundos * muestreo;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const txt = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE');
  txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, muestreo, true); v.setUint32(28, muestreo * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.random() * 4) - 2, true);
  return buf;
}

const hayMediaSession = () => hayDOM && 'mediaSession' in navigator;

function tituloFondo() {
  const e = nucleo.estado();
  if (e.fase === 'prep') return `Prepárate · ${e.etiqueta}`;
  if (e.terminado) return e.modo === 'libre' ? 'Tiempo cumplido' : 'Descanso terminado';
  return `${e.etiqueta} · ${formato(Math.ceil(e.restanteMs / 1000))}`;
}

function actualizarTituloFondo() {
  if (!fondo || !hayMediaSession() || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: tituloFondo(),
      artist: 'MicroApp Gym',
      artwork: [{ src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  } catch (e) { /* sin metadatos */ }
}

/** Empieza el bucle (solo dentro de un toque, con cuenta activa y la opción activada). */
function iniciarAudioFondo() {
  if (!hayDOM || typeof Audio === 'undefined') return;
  if (!canales().pitarBloqueado || !nucleo.estado().activo) { pararAudioFondo(); return; }
  clearTimeout(fondoParadaId);
  try {
    if (!fondo) {
      fondoUrl = URL.createObjectURL(new Blob([wavCasiSilencio()], { type: 'audio/wav' }));
      fondo = new Audio();
      fondo.loop = true;
      fondo.playsInline = true;
      fondo.setAttribute('playsinline', '');
      fondo.preload = 'auto';
      fondo.volume = 1; // el ruido ya es inaudible
      fondo.src = fondoUrl;
    }
    const promesa = fondo.play();
    if (promesa && promesa.catch) promesa.catch((e) => console.warn('[timer] No se pudo iniciar el audio de fondo', e));
  } catch (e) {
    console.warn('[timer] Audio de fondo no disponible', e);
    return;
  }
  if (hayMediaSession()) {
    const ms = navigator.mediaSession;
    // Pausa/Detener en la notificación = "Saltar" (termina el descanso y avisa a la sesión).
    for (const [accion, fn] of [['pause', () => nucleo.saltar()], ['stop', () => nucleo.saltar()], ['play', () => {}]]) {
      try { ms.setActionHandler(accion, fn); } catch (e) { /* acción no admitida */ }
    }
    try { ms.playbackState = 'playing'; } catch (e) { /* nada */ }
  }
  actualizarTituloFondo();
  clearInterval(fondoTituloId);
  fondoTituloId = setInterval(actualizarTituloFondo, TITULO_CADA_MS);
}

function pararAudioFondoEn(ms) {
  if (!fondo) return;
  clearTimeout(fondoParadaId);
  fondoParadaId = setTimeout(pararAudioFondo, ms);
}

function pararAudioFondo() {
  clearTimeout(fondoParadaId);
  clearInterval(fondoTituloId);
  if (!fondo) return;
  const a = fondo;
  fondo = null;
  try { a.pause(); a.removeAttribute('src'); a.src = ''; a.load(); } catch (e) { /* nada */ }
  if (fondoUrl) { try { URL.revokeObjectURL(fondoUrl); } catch (e) { /* nada */ } fondoUrl = ''; }
  if (hayMediaSession()) {
    const ms = navigator.mediaSession;
    try { ms.metadata = null; ms.playbackState = 'none'; } catch (e) { /* nada */ }
    for (const accion of ['pause', 'stop', 'play']) {
      try { ms.setActionHandler(accion, null); } catch (e) { /* nada */ }
    }
  }
}

/** Para pruebas y depuración en el móvil. */
export function diagnostico() {
  return {
    canales: canales(),
    audioContext: audio ? audio.state : null,
    pitidosProgramados: programados.length,
    audioFondo: fondo ? { reproduciendo: !fondo.paused, src: fondo.src, bucle: fondo.loop } : null,
    wakeLock: !!(centinela && !centinela.released),
  };
}

/* ---------- Wake Lock (pantalla encendida) ---------- */

let centinela = null;
let pidiendo = false;

const WAKE_LOCK_TRAS_FIN_MS = 60000; // tras el fin, la pantalla sigue encendida 60 s como mucho

/** ¿Hace falta la pantalla encendida? Mientras cuenta y hasta 60 s después del fin. */
function necesitaPantalla() {
  const e = nucleo.estado();
  return e.visible && (!e.terminado || e.terminadoHaceMs < WAKE_LOCK_TRAS_FIN_MS);
}

async function pedirWakeLock() {
  if (!hayDOM || (centinela && !centinela.released) || pidiendo) return;
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || !necesitaPantalla()) return;
  pidiendo = true;
  try {
    const c = await navigator.wakeLock.request('screen');
    if (c.released) return; // liberado por el sistema mientras se pedía (p. ej. app oculta)
    if (!necesitaPantalla()) { await c.release(); return; } // se cerró mientras tanto
    centinela = c;
    c.addEventListener('release', () => { if (centinela === c) centinela = null; });
  } catch (e) {
    console.warn('[timer] No se pudo mantener la pantalla encendida', e);
  } finally {
    pidiendo = false;
  }
}

async function soltarWakeLock() {
  const c = centinela;
  centinela = null;
  if (c) {
    try { await c.release(); } catch (e) { /* ya estaba liberado */ }
  }
}

/* ---------- Temporizadores: fin exacto aunque no haya fotogramas ---------- */

function programarTimeout() {
  clearTimeout(timeoutId);
  const d = nucleo.datos();
  if (!d || d.terminado) return;
  const ahora = Date.now();
  const objetivo = ahora < d.prepFinEn ? d.prepFinEn : d.finEn;
  timeoutId = setTimeout(() => {
    nucleo.comprobar();
    programarTimeout();
    pintar();
  }, Math.max(0, objetivo - ahora + 5));
}

let ultimoFrame = 0;

function arrancarBucle() {
  if (!hayDOM || document.hidden) return;
  if (rafId) {
    // Un rAF que lleva más de 1 s sin ejecutarse está colgado (página congelada): se relanza.
    if (performance.now() - ultimoFrame < 1000) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  const est = nucleo.estado();
  if (est.terminado) { tickTerminado(); return; }
  const paso = () => {
    rafId = 0;
    ultimoFrame = performance.now();
    nucleo.comprobar();
    pintar();
    const e = nucleo.estado();
    if (!e.visible || document.hidden) return;
    if (e.terminado) tickTerminado();
    else rafId = requestAnimationFrame(paso);
  };
  ultimoFrame = performance.now();
  rafId = requestAnimationFrame(paso);
}

// Terminado: basta con repintar cada segundo ("+0:12").
function tickTerminado() {
  clearTimeout(tickDoneId);
  pintar();
  const e = nucleo.estado();
  if (!e.visible || document.hidden) return;
  if (e.terminadoHaceMs > CADUCIDAD_MS) { nucleo.detener(); return; }
  if (centinela && !necesitaPantalla()) soltarWakeLock();
  tickDoneId = setTimeout(tickTerminado, 1000 - (e.terminadoHaceMs % 1000) + 10);
}

function pararBucle() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  clearTimeout(tickDoneId);
}

/* ---------- Vista ---------- */

function asegurarUIsiHayDOM() { if (hayDOM && document.body) asegurarUI(); }

function asegurarUI() {
  if (ui) return ui;
  const seccion = document.createElement('section');
  seccion.className = 'timer';
  seccion.setAttribute('role', 'region');
  seccion.setAttribute('aria-label', 'Cronómetro');
  seccion.hidden = true;
  seccion.innerHTML = `
    <button class="timer__ring" type="button" aria-label="Ampliar cronómetro" aria-expanded="false">
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle class="timer__track" cx="60" cy="60" r="54"/>
        <circle class="timer__progress" cx="60" cy="60" r="54" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/>
      </svg>
      <span class="timer__time">0:00</span>
    </button>
    <div class="timer__info"><span class="timer__label">Descanso</span><span class="timer__next" hidden></span></div>
    <div class="timer__actions">
      <button class="btn btn--ghost timer__btn" type="button" data-timer="menos" aria-label="Quitar 15 segundos">−15 s</button>
      <button class="btn btn--ghost timer__btn" type="button" data-timer="mas" aria-label="Añadir 15 segundos">+15 s</button>
      <button class="btn btn--primary timer__btn" type="button" data-timer="saltar">Saltar</button>
    </div>
    <p class="sr-only" aria-live="polite"></p>`;
  const flash = document.createElement('div');
  flash.className = 'flash';
  flash.setAttribute('aria-hidden', 'true');
  if (hayPopover) flash.setAttribute('popover', 'manual');
  document.body.append(seccion, flash);

  ui = {
    seccion,
    flash,
    anillo: seccion.querySelector('.timer__ring'),
    progreso: seccion.querySelector('.timer__progress'),
    tiempo: seccion.querySelector('.timer__time'),
    etiqueta: seccion.querySelector('.timer__label'),
    siguiente: seccion.querySelector('.timer__next'),
    menos: seccion.querySelector('[data-timer="menos"]'),
    mas: seccion.querySelector('[data-timer="mas"]'),
    saltar: seccion.querySelector('[data-timer="saltar"]'),
    vivo: seccion.querySelector('[aria-live]'),
  };

  seccion.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b === ui.anillo) { ampliar(!estaAmpliado()); return; }
    const accion = b.dataset.timer;
    // Recién mostrada la franja (o recién cambiados sus botones): se ignora el toque, que
    // suele ser el segundo de un doble toque en "✓ Serie hecha" que acaba de quedar debajo.
    if (accion && ahoraMono() < bloqueoHasta) return;
    if (accion === 'menos') nucleo.ajustar(-15);
    else if (accion === 'mas') nucleo.ajustar(15);
    else if (accion === 'saltar') nucleo.saltar();
    pintar();
  });
  seccion.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && estaAmpliado()) ampliar(false);
  });
  // Atrás de Android con el cronómetro ampliado: se reduce. La entrada de historial propia
  // no cambia la URL (ni el hash), así que app.js no cambia de pestaña.
  window.addEventListener('popstate', () => {
    if (estaAmpliado() && !esEntradaPropia()) ampliar(false, { desdeHistorial: true });
  });
  return ui;
}

const MARCA_HISTORIAL = 'cronometroAmpliado';
const esEntradaPropia = () => !!(history.state && history.state[MARCA_HISTORIAL]);
const estaAmpliado = () => !!ui && ui.seccion.classList.contains('is-expanded');

function ampliar(si, { desdeHistorial = false } = {}) {
  if (!ui || si === estaAmpliado()) return;
  ui.seccion.classList.toggle('is-expanded', si);
  ui.anillo.setAttribute('aria-expanded', String(si));
  ui.anillo.setAttribute('aria-label', si ? 'Reducir cronómetro' : 'Ampliar cronómetro');
  // A pantalla completa, el resto de la app no se puede tocar ni enfocar.
  document.querySelector('.app')?.toggleAttribute('inert', si);
  try {
    if (si) history.pushState({ ...(history.state || {}), [MARCA_HISTORIAL]: true }, '');
    else if (!desdeHistorial && esEntradaPropia()) history.back();
  } catch (e) { /* sin historial: se reduce igual con el anillo o Escape */ }
}

// Toques ignorados en −15/+15/Saltar durante BLOQUEO_TOQUE_MS tras mostrarse la franja o
// cambiar su forma (descanso/libre, preparación, terminado).
const BLOQUEO_TOQUE_MS = 600;
let bloqueoHasta = 0;
let formaVista = '';
const ahoraMono = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const bloquearToques = () => { bloqueoHasta = ahoraMono() + BLOQUEO_TOQUE_MS; };

function mostrar(si) {
  if (!ui) return;
  if (si && ui.seccion.hidden) bloquearToques();
  if (!si) formaVista = '';
  ui.seccion.hidden = !si;
  document.body.classList.toggle('has-timer', si);
  if (!si) {
    ampliar(false);
    ultimoTexto = '';
    ui.seccion.classList.remove('is-warning', 'is-done', 'is-free', 'is-prep');
  }
}

const dos = (n) => String(n).padStart(2, '0');
function formato(seg) {
  const m = Math.floor(seg / 60);
  return `${m}:${dos(seg % 60)}`;
}
function formatoHace(seg) {
  return seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min ${dos(seg % 60)} s`;
}
function textoDuracion(ms) {
  const seg = Math.round(ms / 1000);
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  if (!m) return `${s} segundos`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

function ponerTexto(el, texto) {
  if (el.textContent !== texto) el.textContent = texto;
}

function pintar() {
  if (!ui) return;
  const e = nucleo.estado();
  if (!e.visible) return;
  const c = ui.seccion.classList;
  const libre = e.modo === 'libre';
  const forma = `${e.modo}|${e.fase === 'prep'}|${e.terminado}`;
  if (forma !== formaVista) {
    if (formaVista) bloquearToques();
    formaVista = forma;
  }
  c.toggle('is-free', libre);
  c.toggle('is-prep', e.fase === 'prep');
  c.toggle('is-done', e.terminado);
  c.toggle('is-warning', e.fase === 'cuenta' && e.restanteMs <= AVISO_MS);

  let tiempo;
  let etiqueta;
  let siguiente = e.siguiente ? `Siguiente: ${e.siguiente}` : '';
  if (e.fase === 'prep') {
    tiempo = String(Math.max(1, Math.ceil(e.restanteMs / 1000)));
    etiqueta = 'Prepárate';
    siguiente = `${e.etiqueta} · ${Math.round((nucleo.datos() || {}).totalMs / 1000)} s`;
  } else if (e.fase === 'cuenta') {
    tiempo = formato(Math.ceil(e.restanteMs / 1000));
    etiqueta = e.etiqueta;
    if (libre) siguiente = 'Aguanta';
  } else {
    const hace = Math.floor((e.terminadoHaceMs || 0) / 1000);
    tiempo = `+${formato(hace)}`;
    const base = libre ? 'Tiempo cumplido' : 'Descanso terminado';
    // Corto para que quepa en 360 px; el anuncio accesible dice la frase completa.
    etiqueta = lejos ? `Terminado hace ${formatoHace(hace)}` : base;
  }
  ponerTexto(ui.tiempo, tiempo);
  ponerTexto(ui.etiqueta, etiqueta);
  ponerTexto(ui.siguiente, siguiente);
  ui.siguiente.hidden = !siguiente;

  const fraccion = e.terminado ? 1 : (e.totalMs ? Math.min(1, Math.max(0, e.restanteMs / e.totalMs)) : 0);
  const offset = (100 * (1 - fraccion)).toFixed(2);
  if (ui.progreso.getAttribute('stroke-dashoffset') !== offset) ui.progreso.setAttribute('stroke-dashoffset', offset);
  // Con el arco vacío, el extremo redondeado dejaría un punto: se oculta el círculo.
  const visibilidad = !e.terminado && Number(offset) >= 99.5 ? 'hidden' : 'visible';
  if (ui.progreso.getAttribute('visibility') !== visibilidad) ui.progreso.setAttribute('visibility', visibilidad);

  ui.menos.disabled = e.terminado;
  ui.mas.disabled = e.terminado;
  const textoSaltar = e.terminado ? 'Cerrar' : libre ? 'Parar' : 'Saltar';
  if (textoSaltar !== ultimoTexto) {
    ultimoTexto = textoSaltar;
    ui.saltar.textContent = textoSaltar;
    ui.saltar.setAttribute('aria-label', e.terminado ? 'Cerrar cronómetro' : libre ? 'Parar el cronómetro' : 'Saltar el descanso');
  }

  // Avisos durante la cuenta (solo con la app a la vista).
  if (e.fase === 'cuenta') {
    if (!anuncio10 && e.restanteMs <= AVISO_MS && e.totalMs > AVISO_MS + 2000) {
      anuncio10 = true;
      anunciar('Quedan 10 segundos');
    }
    if (!pitidoPrevioHecho && e.restanteMs <= PITIDO_PREVIO_MS && e.totalMs > PITIDO_PREVIO_MS + 500) {
      pitidoPrevioHecho = true;
      vibrar(VIBRACION_PREVIA);
    }
  }
}

/* ---------- Visibilidad y arranque ---------- */

function alVolverVisible() {
  const e = nucleo.estado();
  if (!e.visible) return;
  pedirWakeLock();
  if (audio && audio.state !== 'running') audio.resume().then(programarAudio).catch(() => {});
  programarAudio();
  const r = nucleo.comprobar();     // si terminó estando oculta, salta alFinNucleo (tarde)
  if (r !== 'fin' && finOculto) {
    lejos = true;
    avisoAlVolver();
  }
  programarTimeout();
  pintar();
  arrancarBucle();
}

function iniciarModulo() {
  if (!document.body) return;
  asegurarUI();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') alVolverVisible();
    else pararBucle(); // los fotogramas no corren oculta; el setTimeout del fin sigue programado
  });
  document.addEventListener('freeze', pararBucle);
  document.addEventListener('resume', alVolverVisible);
  window.addEventListener('pageshow', alVolverVisible);
  // Tras recargar o reabrir no hay AudioContext: el primer toque lo crea y, si hay un
  // cronómetro restaurado, desbloquearAudio() vuelve a programar sus pitidos pendientes.
  const primerToque = () => {
    document.removeEventListener('pointerdown', primerToque, true);
    document.removeEventListener('keydown', primerToque, true);
    desbloquearAudio();
    if (nucleo.estado().activo) iniciarAudioFondo(); // cronómetro restaurado tras recargar
  };
  document.addEventListener('pointerdown', primerToque, { capture: true });
  document.addEventListener('keydown', primerToque, { capture: true });
  // Ajustes guardados: respetar el nuevo modo de aviso con el cronómetro en marcha.
  window.addEventListener('mag:config', () => {
    const e = nucleo.estado();
    if (!e.activo) return;
    programarAudio();
    if (!canales().pitarBloqueado) pararAudioFondo();
    else if (!fondo) iniciarAudioFondo(); // llega del toque en "Guardar"
  });

  // Retomar un cronómetro guardado (app recargada o reabierta).
  if (!nucleo.restaurar(storage.get(CLAVE_CRONOMETRO, null))) return;
  const d = nucleo.datos();
  const e = nucleo.estado();
  anuncio10 = e.fase !== 'cuenta' || e.restanteMs <= AVISO_MS;
  pitidoPrevioHecho = e.fase !== 'cuenta' || e.restanteMs <= PITIDO_PREVIO_MS;
  if (d.terminado) lejos = true;
  faseVista = e.fase;
  mostrar(true);
  pedirWakeLock();
  programarTimeout();
  const r = nucleo.comprobar();     // terminó con la app cerrada: aviso "tarde"
  if (r !== 'fin' && d.terminado && !d.avisado) avisoAlVolver();
  pintar();
  arrancarBucle();
  avisarOyentes(oyentesCambio, nucleo.estado());
}

if (hayDOM) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarModulo, { once: true });
  else setTimeout(iniciarModulo, 0);
}
