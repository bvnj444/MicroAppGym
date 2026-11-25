/*
 * MicroApp Gym — workout.js  (pertenece a sesion-cronometro)
 * Lógica PURA de la sesión activa: sin DOM ni localStorage (se prueba en Node).
 * Nunca muta la entrada: cada operación devuelve una sesión nueva.
 *
 * REGISTRO DE SESIÓN (contrato de storage.js) + campos añadidos (compatibles; marcados con +):
 * {
 *   version: 1, id: 's-<ms>', fecha: 'AAAA-MM-DD', diaId, inicio: ISO, fin: ISO | null,
 *   terminada: false,
 *   + diaNombre: 'Torso A',
 *   posicion: { ejercicio, serie },  // siguiente serie a hacer (se guarda tras cada serie)
 *   + cronoLibre: { ejercicio, serie } | null,  // serie de tiempo con el cronómetro libre en marcha
 *   ejercicios: [{
 *     ejercicioId, variante,
 *     + montaje: 'barra' | 'mancuernas' | 'ninguno', + numMancuernas: 1 | 2 | null,
 *     + repeticiones: [min, max] | null, + segundos: [min, max] | null, + casiFallo: boolean,
 *     + descanso: segundos, + tempo: '3-1-1' | null, + pausa: segundos | null,
 *     + superserieCon: ejercicioId | null,
 *     + saltado: boolean,              // "Saltar ejercicio": sus series pendientes no se hacen
 *     series: [{ peso, repeticiones, segundos, hecha, + hechaEn: ISO | null }]
 *   }]
 * }
 *   Las series nacen con los valores PLANEADOS (peso sugerido, máximo del rango de repeticiones
 *   o de segundos; 10 repeticiones si es "casi al fallo") y hecha: false. Al marcarlas se
 *   guardan los valores reales.
 *
 * ORDEN DE LOS PASOS
 *   Ejercicios en el orden de la rutina (ya agrupados por montaje). Superserie = dos ejercicios
 *   consecutivos con superserieCon recíproco: A1, B1, A2, B2… Descanso tras cada serie y tras
 *   cada pareja (0 s entre A y B de la misma ronda). Sin descanso tras la última serie.
 *
 * VOLUMEN (gramos) = Σ peso × repeticiones de las series hechas, con el peso:
 *   barra: total de la barra · par de mancuernas: peso por mancuerna × 2 ·
 *   una mancuerna: tal cual (en los unilaterales, las repeticiones por lado tal cual).
 *   Series de tiempo y de peso corporal (peso 0) no suman.
 *
 * API
 *   crearSesion(rutina, diaId, fecha, config, ahora?)  -> sesión nueva (nivel aplicado para `fecha`)
 *   ordenPasos(sesion)                     -> [{ ejercicio, serie, ronda, unidad, pareja }]
 *   pasoActual(sesion)                     -> paso | null (null = no queda nada)
 *       paso = { ejercicio, serie, indice, total, item, set, numeroEjercicio, totalEjercicios,
 *                superserie: { orden: 1 | 2, con: ejercicioId } | null }
 *   marcarSerie(sesion, datos?, { config, ahora }?)
 *       datos = { ejercicio?, serie?, peso?, repeticiones?, segundos? } (por defecto, la actual)
 *       -> { sesion, descanso: segundos (0 = sin descanso), siguiente: paso | null,
 *            cambioMontaje: aviso | null (para el paso siguiente), completa: boolean }
 *   editarSerie(sesion, ejercicio, serie, cambios, { propagar = true }?)
 *       cambios = { peso?, repeticiones?, segundos?, hecha? }; con propagar, un cambio de peso
 *       se copia a las series PENDIENTES posteriores del mismo ejercicio. Con hecha: false, si la
 *       serie está antes de la actual, la posición vuelve a ella (y el ejercicio deja de estar saltado).
 *   saltarEjercicio(sesion, ejercicio?)    -> sesión con ese ejercicio saltado (por defecto, el actual)
 *   saltar(sesion, ejercicio?)             -> { sesion, descanso, siguiente }: igual, y si se salta B
 *                                             justo tras hacer A de la misma ronda, descanso de la pareja
 *   validarSesion(s)                       -> boolean (forma mínima válida)
 *   ultimaHecha(sesion)                    -> { ejercicio, serie } | null (por hechaEn)
 *   valorSugerido(item, serie)             -> reps/segundos de la última serie hecha del ejercicio, o lo planeado
 *   ponerCronoLibre(sesion, paso | null)   -> sesión con cronoLibre puesto o quitado
 *   avisoMontaje(sesion, paso, config)     -> { completo, tipo, texto, total, discosPorLado } | null
 *       Compara con lo montado en la ÚLTIMA serie hecha (por hechaEn) con montaje; si no hay
 *       o el tipo cambia, montaje completo (textoMontaje); si cambian los discos, solo los
 *       cambios (textoCambios); si no cambia nada, null.
 *   completa(sesion)                       -> true si no quedan series pendientes
 *   terminar(sesion, ahora?)               -> sesión con terminada: true y fin
 *   volumenSerie(item, set)                -> gramos
 *   resumen(sesion)                        -> { seriesHechas, seriesTotales (todas las planeadas),
 *                                              saltadas (pendientes de ejercicios saltados), ejerciciosHechos,
 *                                              volumen, duracionMs, porEjercicio: [...] }
 *   tipoMontajeDe(item)                    -> 'barra' | 'una-mancuerna' | 'par-mancuernas' | null
 *   Textos (sirven para un elemento de la rutina o un ejercicio de la sesión):
 *   textoObjetivo(item)                    -> '10–12 reps por pierna' | '30–45 s' | 'Casi al fallo'
 *   textoTecnica(item)                     -> 'Baja en 3 s (tempo 3-1-1) · Pausa 2 s abajo' | ''
 *                                             (+ textos de los escalones 'lastre' de variantes[0..item.variante])
 *   nombreEjercicio(id)                    -> nombre del catálogo (o el id)
 */

import * as planner from './planner.js';
import { EJERCICIOS } from './data/exercises.js';
import { calcularMontaje, cambiosMontaje, textoMontaje, textoCambios, kg } from './data/equipment.js';

const POR_ID = new Map(EJERCICIOS.map((e) => [e.id, e]));

const VERSION_SESION = 1;
const REPS_CASI_FALLO = 10;

const clonar = (v) => JSON.parse(JSON.stringify(v));
const aMs = (ahora) => (typeof ahora === 'number' ? ahora : ahora ? Date.parse(ahora) : Date.now());
const rango = (v) => (Array.isArray(v) && v.length === 2 ? [Number(v[0]), Number(v[1])] : null);

export function tipoMontajeDe(item) {
  return planner.tipoMontaje(item);
}

/* ---------- Crear ---------- */

function diaConNivel(rutina, diaId, fecha, config) {
  if (!rutina || !Array.isArray(rutina.dias)) throw new Error('No hay ninguna rutina.');
  const base = rutina.dias.find((d) => d.id === diaId);
  if (!base) throw new Error(`No existe el día "${diaId}" en la rutina.`);
  // El nivel (principiante: 1 serie menos y +30 s) lo aplica planner.diaParaFecha. Se le pasa
  // una rutina con solo este día puesto en el día de la semana de `fecha`.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha));
  if (!m) throw new Error(`Fecha no válida: "${fecha}".`);
  const ds = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() || 7;
  const sola = { version: rutina.version, plantillaId: 'sesion', dias: [{ ...clonar(base), diaSemana: ds }] };
  return planner.diaParaFecha(sola, config, fecha).dia || clonar(base);
}

export function crearSesion(rutina, diaId, fecha, config, ahora = Date.now()) {
  const dia = diaConNivel(rutina, diaId, fecha, config);
  const t = aMs(ahora);
  const ejercicios = dia.ejercicios.map((e) => {
    const reps = rango(e.repeticiones);
    const segs = rango(e.segundos);
    const conPeso = Boolean(planner.tipoMontaje(e));
    const serie = () => ({
      peso: conPeso ? Math.max(0, Number(e.pesoSugerido) || 0) : 0,
      repeticiones: segs ? null : reps ? reps[1] : REPS_CASI_FALLO,
      segundos: segs ? segs[1] : null,
      hecha: false,
      hechaEn: null,
    });
    return {
      ejercicioId: e.ejercicioId,
      variante: e.variante ?? null,
      montaje: e.montaje || 'ninguno',
      numMancuernas: e.numMancuernas ?? null,
      repeticiones: segs ? null : reps,
      segundos: segs,
      casiFallo: e.casiFallo === true,
      descanso: Math.max(0, Number(e.descanso) || 0),
      tempo: e.tempo ?? null,
      pausa: e.pausa ?? null,
      superserieCon: e.superserieCon ?? null,
      saltado: false,
      series: Array.from({ length: Math.max(1, Number(e.series) || 1) }, serie),
    };
  });
  return {
    version: VERSION_SESION,
    id: 's-' + t,
    fecha,
    diaId: dia.id,
    diaNombre: dia.nombre || dia.id,
    inicio: new Date(t).toISOString(),
    fin: null,
    terminada: false,
    posicion: { ejercicio: 0, serie: 0 },
    cronoLibre: null,
    ejercicios,
  };
}

/* ---------- Orden ---------- */

function unidades(ejercicios) {
  const lista = [];
  for (let i = 0; i < ejercicios.length; i++) {
    const a = ejercicios[i];
    const b = ejercicios[i + 1];
    if (b && a.superserieCon && a.superserieCon === b.ejercicioId && b.superserieCon === a.ejercicioId) {
      lista.push([i, i + 1]);
      i++;
    } else lista.push([i]);
  }
  return lista;
}

export function ordenPasos(sesion) {
  const pasos = [];
  unidades(sesion.ejercicios).forEach((ind, u) => {
    const rondas = Math.max(...ind.map((i) => sesion.ejercicios[i].series.length));
    for (let r = 0; r < rondas; r++) {
      for (const i of ind) {
        if (r < sesion.ejercicios[i].series.length) {
          pasos.push({ ejercicio: i, serie: r, ronda: r, unidad: u, pareja: ind.length === 2 });
        }
      }
    }
  });
  return pasos;
}

const pendiente = (sesion, p) => {
  const item = sesion.ejercicios[p.ejercicio];
  return !item.saltado && !item.series[p.serie].hecha;
};

function describir(sesion, pasos, k) {
  const p = pasos[k];
  const item = sesion.ejercicios[p.ejercicio];
  let superserie = null;
  if (p.pareja) {
    const ind = unidades(sesion.ejercicios)[p.unidad];
    superserie = { orden: ind.indexOf(p.ejercicio) + 1, con: item.superserieCon };
  }
  return {
    ejercicio: p.ejercicio,
    serie: p.serie,
    indice: k,
    total: pasos.length,
    item,
    set: item.series[p.serie],
    numeroEjercicio: p.ejercicio + 1,
    totalEjercicios: sesion.ejercicios.length,
    superserie,
  };
}

/** Índice (en pasos) del siguiente pendiente después de k; si no hay, el primero pendiente. */
function siguientePendiente(sesion, pasos, k) {
  for (let j = k + 1; j < pasos.length; j++) if (pendiente(sesion, pasos[j])) return j;
  for (let j = 0; j <= Math.min(k, pasos.length - 1); j++) if (pendiente(sesion, pasos[j])) return j;
  return -1;
}

function indiceActual(sesion, pasos) {
  const pos = sesion.posicion || {};
  const k = pasos.findIndex((p) => p.ejercicio === pos.ejercicio && p.serie === pos.serie);
  if (k >= 0 && pendiente(sesion, pasos[k])) return k;
  // Posición ya hecha o no válida: el siguiente pendiente a partir de ella (o el primero).
  return siguientePendiente(sesion, pasos, k >= 0 ? k : -1);
}

export function pasoActual(sesion) {
  if (!sesion || !Array.isArray(sesion.ejercicios)) return null;
  const pasos = ordenPasos(sesion);
  const k = indiceActual(sesion, pasos);
  return k < 0 ? null : describir(sesion, pasos, k);
}

export function completa(sesion) {
  return pasoActual(sesion) === null;
}

/* ---------- Montaje ---------- */

export function avisoMontaje(sesion, paso, config) {
  if (!paso) return null;
  const item = sesion.ejercicios[paso.ejercicio];
  const tipo = planner.tipoMontaje(item);
  if (!tipo) return null;
  const calc = calcularMontaje(item.series[paso.serie].peso, tipo, config);

  // Lo montado: la última serie hecha (por hechaEn) de un ejercicio con montaje.
  let montado = null;
  let marca = -Infinity;
  ordenPasos(sesion).forEach((p, orden) => {
    const it = sesion.ejercicios[p.ejercicio];
    const s = it.series[p.serie];
    const t = planner.tipoMontaje(it);
    if (!s.hecha || !t) return;
    const ms = (Date.parse(s.hechaEn) || 0) + orden / 1000; // a igualdad de hora, el orden
    if (ms >= marca) { marca = ms; montado = { tipo: t, peso: s.peso }; }
  });

  const base = { tipo, total: calc.total, discosPorLado: calc.discosPorLado };
  if (!montado || montado.tipo !== tipo) {
    return { ...base, completo: true, texto: textoMontaje(calc, tipo) };
  }
  const antes = calcularMontaje(montado.peso, tipo, config);
  const cambios = cambiosMontaje(antes.discosPorLado, calc.discosPorLado);
  if (!cambios.quitar.length && !cambios.poner.length) return null;
  return { ...base, completo: false, cambios, texto: `${textoCambios(cambios)} → ${kg(calc.total)}` };
}

/* ---------- Marcar y editar ---------- */

function valor(n, min = 0) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(min, v) : null;
}

export function marcarSerie(sesion, datos = {}, { config = null, ahora = Date.now() } = {}) {
  const nueva = clonar(sesion);
  const pasos = ordenPasos(nueva);
  let k;
  if (Number.isInteger(datos.ejercicio) && Number.isInteger(datos.serie)) {
    k = pasos.findIndex((p) => p.ejercicio === datos.ejercicio && p.serie === datos.serie);
    if (k < 0) throw new Error('Esa serie no existe en la sesión.');
  } else {
    k = indiceActual(nueva, pasos);
    if (k < 0) throw new Error('No quedan series por hacer.');
  }
  const p = pasos[k];
  const item = nueva.ejercicios[p.ejercicio];
  const s = item.series[p.serie];
  if ('peso' in datos && planner.tipoMontaje(item)) s.peso = valor(datos.peso) ?? s.peso;
  if ('repeticiones' in datos && !item.segundos) s.repeticiones = valor(datos.repeticiones) ?? s.repeticiones;
  if ('segundos' in datos && item.segundos) s.segundos = valor(datos.segundos) ?? s.segundos;
  s.hecha = true;
  s.hechaEn = new Date(aMs(ahora)).toISOString();
  item.saltado = false; // hacer una serie de un ejercicio saltado lo recupera
  nueva.cronoLibre = null;

  const j = siguientePendiente(nueva, pasos, k);
  let descanso = 0;
  let siguiente = null;
  let cambioMontaje = null;
  if (j >= 0) {
    const q = pasos[j];
    nueva.posicion = { ejercicio: q.ejercicio, serie: q.serie };
    // Sin descanso entre A y B de la misma ronda de una superserie.
    const dentroDePareja = p.pareja && q.unidad === p.unidad && q.ronda === p.ronda && j > k;
    descanso = dentroDePareja ? 0 : item.descanso;
    siguiente = describir(nueva, pasos, j);
    if (config) cambioMontaje = avisoMontaje(nueva, siguiente, config);
  } else {
    nueva.posicion = { ejercicio: p.ejercicio, serie: p.serie };
  }
  return { sesion: nueva, descanso, siguiente, cambioMontaje, completa: j < 0 };
}

export function editarSerie(sesion, ejercicio, serie, cambios = {}, { propagar = true } = {}) {
  const nueva = clonar(sesion);
  const item = nueva.ejercicios[ejercicio];
  const s = item && item.series[serie];
  if (!s) throw new Error('Esa serie no existe en la sesión.');
  if ('peso' in cambios && planner.tipoMontaje(item)) {
    const peso = valor(cambios.peso);
    if (peso !== null) {
      s.peso = peso;
      if (propagar) for (let i = serie + 1; i < item.series.length; i++) if (!item.series[i].hecha) item.series[i].peso = peso;
    }
  }
  if ('repeticiones' in cambios && !item.segundos) s.repeticiones = valor(cambios.repeticiones) ?? s.repeticiones;
  if ('segundos' in cambios && item.segundos) s.segundos = valor(cambios.segundos) ?? s.segundos;
  if ('hecha' in cambios) {
    const actual = pasoActual(nueva);
    s.hecha = cambios.hecha === true;
    s.hechaEn = s.hecha ? (s.hechaEn || new Date().toISOString()) : null;
    if (!s.hecha) {
      item.saltado = false;
      // Desmarcar una serie anterior a la actual: se vuelve a ella.
      const pasos = ordenPasos(nueva);
      const k = pasos.findIndex((p) => p.ejercicio === ejercicio && p.serie === serie);
      if (!actual || k < actual.indice) nueva.posicion = { ejercicio, serie };
    }
  }
  return nueva;
}

export function saltarEjercicio(sesion, ejercicio) {
  return saltar(sesion, ejercicio).sesion;
}

export function saltar(sesion, ejercicio) {
  const nueva = clonar(sesion);
  const actual = pasoActual(nueva);
  const i = Number.isInteger(ejercicio) ? ejercicio : actual ? actual.ejercicio : -1;
  if (!nueva.ejercicios[i]) return { sesion: nueva, descanso: 0, siguiente: actual };
  nueva.ejercicios[i].saltado = true;
  if (nueva.cronoLibre && nueva.cronoLibre.ejercicio === i) nueva.cronoLibre = null;
  const pasos = ordenPasos(nueva);
  const actualSigue = actual && pendiente(nueva, pasos[actual.indice]);
  let j = actual ? actual.indice : -1;
  if (!actualSigue) j = siguientePendiente(nueva, pasos, actual ? actual.indice : -1);
  if (j >= 0) nueva.posicion = { ejercicio: pasos[j].ejercicio, serie: pasos[j].serie };
  // Se salta B justo después de hacer A de la misma ronda: toca el descanso de la pareja.
  let descanso = 0;
  if (actual && !actualSigue && actual.superserie && actual.superserie.orden === 2 && j >= 0) {
    const a = nueva.ejercicios[actual.ejercicio - 1];
    if (a && a.series[actual.serie] && a.series[actual.serie].hecha) descanso = a.descanso;
  }
  return { sesion: nueva, descanso, siguiente: j >= 0 ? describir(nueva, pasos, j) : null };
}

export function ponerCronoLibre(sesion, paso) {
  return { ...clonar(sesion), cronoLibre: paso ? { ejercicio: paso.ejercicio, serie: paso.serie } : null };
}

export function terminar(sesion, ahora = Date.now()) {
  return { ...clonar(sesion), terminada: true, fin: new Date(aMs(ahora)).toISOString(), cronoLibre: null };
}

/* ---------- Validación y valores sugeridos ---------- */

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** true si tiene la forma mínima de una sesión (ejercicios con ejercicioId y series de objetos). */
export function validarSesion(s) {
  if (!esObjeto(s) || !Array.isArray(s.ejercicios) || !s.ejercicios.length) return false;
  return s.ejercicios.every((e) => esObjeto(e) && typeof e.ejercicioId === 'string' && e.ejercicioId
    && Array.isArray(e.series) && e.series.length > 0 && e.series.every(esObjeto));
}

/** La última serie hecha de toda la sesión (por hechaEn) -> { ejercicio, serie } | null. */
export function ultimaHecha(sesion) {
  let mejor = null;
  let marca = -Infinity;
  ordenPasos(sesion).forEach((p, orden) => {
    const st = sesion.ejercicios[p.ejercicio].series[p.serie];
    if (!st.hecha) return;
    const ms = (Date.parse(st.hechaEn) || 0) + orden / 1000;
    if (ms >= marca) { marca = ms; mejor = { ejercicio: p.ejercicio, serie: p.serie }; }
  });
  return mejor;
}

/** Repeticiones (o segundos) para la serie: lo último hecho en ese ejercicio, o lo planeado. */
export function valorSugerido(item, serie) {
  const campo = Array.isArray(item.segundos) ? 'segundos' : 'repeticiones';
  let valor = null;
  let marca = -Infinity;
  item.series.forEach((st, k) => {
    if (!st.hecha || !Number.isFinite(st[campo])) return;
    const ms = (Date.parse(st.hechaEn) || 0) + k / 1000;
    if (ms >= marca) { marca = ms; valor = st[campo]; }
  });
  return valor ?? item.series[serie][campo];
}

/* ---------- Resumen ---------- */

export function volumenSerie(item, set) {
  if (!set || !set.hecha) return 0;
  const peso = Number(set.peso) || 0;
  const reps = Number(set.repeticiones) || 0;
  if (peso <= 0 || reps <= 0) return 0;
  return peso * reps * (planner.tipoMontaje(item) === 'par-mancuernas' ? 2 : 1);
}

export function resumen(sesion) {
  let seriesHechas = 0;
  let seriesTotales = 0;
  let saltadas = 0;
  let volumen = 0;
  const porEjercicio = sesion.ejercicios.map((item) => {
    const hechas = item.series.filter((s) => s.hecha);
    const vol = hechas.reduce((t, s) => t + volumenSerie(item, s), 0);
    seriesHechas += hechas.length;
    seriesTotales += item.series.length;
    if (item.saltado) saltadas += item.series.length - hechas.length;
    volumen += vol;
    return {
      ejercicioId: item.ejercicioId,
      seriesHechas: hechas.length,
      volumen: vol,
      pesoMaximo: hechas.reduce((m, s) => Math.max(m, Number(s.peso) || 0), 0),
      saltado: item.saltado === true,
    };
  });
  const ini = Date.parse(sesion.inicio);
  const fin = sesion.fin ? Date.parse(sesion.fin) : Date.now();
  return {
    seriesHechas,
    seriesTotales,
    saltadas,
    ejerciciosHechos: porEjercicio.filter((e) => e.seriesHechas > 0).length,
    volumen,
    duracionMs: Number.isFinite(ini) && Number.isFinite(fin) ? Math.max(0, fin - ini) : 0,
    porEjercicio,
  };
}

/* ---------- Textos ---------- */

export function nombreEjercicio(id) {
  return (POR_ID.get(id) || {}).nombre || id;
}

const textoRango = ([a, b]) => (a === b ? `${a}` : `${a}–${b}`);

export function textoObjetivo(item) {
  if (!item) return '';
  if (Array.isArray(item.segundos)) return `${textoRango(item.segundos)} s`;
  if (item.casiFallo || !Array.isArray(item.repeticiones)) return 'Casi al fallo';
  const ej = POR_ID.get(item.ejercicioId);
  const lado = ej && ej.unilateral
    ? (ej.grupo === 'pierna' ? ' por pierna' : ej.grupo === 'core' ? ' por lado' : ' por brazo')
    : '';
  return `${textoRango(item.repeticiones)} reps${lado}`;
}

export function textoTecnica(item) {
  const notas = [];
  if (!item) return '';
  if (item.tempo) {
    const bajada = Number(String(item.tempo).split('-')[0]);
    notas.push(bajada > 1 ? `Baja en ${bajada} s (tempo ${item.tempo})` : `Tempo ${item.tempo}`);
  }
  if (item.pausa) {
    const ej = POR_ID.get(item.ejercicioId);
    const paso = ej && (ej.variantes || []).find((v) => v && v.tipo === 'pausa' && v.segundos === item.pausa && v.donde);
    notas.push(`Pausa ${item.pausa} s${paso ? ' ' + paso.donde : ''}`);
  }
  // Escalones 'lastre' aplicados (acumulativos): variantes[0..item.variante] del ejercicio.
  // item.variante = índice del último escalón aplicado (progress.js) o null.
  const hasta = Number.isInteger(item.variante) ? item.variante : -1;
  if (hasta >= 0) {
    const ej = POR_ID.get(item.ejercicioId);
    const escalera = (ej && ej.variantes) || [];
    for (let i = 0; i <= hasta && i < escalera.length; i++) {
      const v = escalera[i];
      if (v && v.tipo === 'lastre' && v.texto) notas.push(v.texto);
    }
  }
  return notas.join(' · ');
}
