/*
 * MicroApp Gym — progress.js
 * Historial, mejores marcas, doble progresión con escalera de variantes, racha y gráficas.
 * Funciones PURAS: sin DOM ni localStorage. Nunca mutan la entrada. Pesos en gramos enteros.
 * Fechas de calendario 'AAAA-MM-DD' (locales). `sesiones` = array de REGISTROS DE SESIÓN
 * (storage.js); `rutina` y `config` con la forma de los CONTRATOS de storage.js.
 *
 * API
 *   historialEjercicio(sesiones, ejercicioId)
 *       -> [{ fecha, sesionId, diaId, variante, tipo: 'repeticiones'|'tiempo', pesoMax,
 *             mejorSerie: { peso, repeticiones, segundos } , volumen,
 *             series: [{ peso, repeticiones, segundos }] }]
 *       Ascendente por fecha (y por `inicio` el mismo día). Solo sesiones terminadas y solo
 *       series hechas; se omiten las sesiones sin series hechas de ese ejercicio. Si el
 *       ejercicio aparece dos veces en la misma sesión, sus series se juntan en una entrada.
 *       mejorSerie: tiempo -> la de más segundos; repeticiones -> la de más peso y, a igual
 *       peso, más repeticiones (en peso corporal, la de más repeticiones).
 *       volumen: Σ workout.volumenSerie (se importa workout.js; no arrastra DOM).
 *   mejoresMarcas(sesiones)
 *       -> { [ejercicioId]: { pesoMax: { peso, repeticiones, fecha } | null,
 *                              repsMax: { repeticiones, peso, fecha } | null,
 *                              segundosMax: { segundos, fecha } | null,
 *                              volumenSesion: { volumen, fecha } | null } }
 *       Solo sesiones terminadas. pesoMax solo con peso > 0. volumenSesion solo con volumen > 0.
 *       Ante un empate exacto se queda la fecha más antigua.
 *   marcasNuevas(sesion, sesionesAnteriores)
 *       -> [{ ejercicioId, tipo: 'peso'|'repeticiones'|'segundos'|'volumen', valor, anterior }]
 *       Lo que `sesion` supera estrictamente. `sesion` se evalúa aunque no tenga terminada: true;
 *       si aparece en sesionesAnteriores (mismo id), se descarta de ahí. Un ejercicio sin
 *       historial anterior no da marcas. `anterior` puede ser null si el ejercicio tenía historial
 *       pero nunca esa marca (p. ej. primer peso > 0).
 *   sugerirProgresion(rutina, sesiones, sesion, config)
 *       -> [{ diaId, indice, ejercicioId, accion, texto, cambios, + peso, + pesoAnterior, + paso }]
 *       Una sugerencia por cada ejercicio de `sesion` que esté en rutina.dias[diaId] (k-ésima
 *       aparición del ejercicio en la sesión <-> k-ésima en el día). Da igual que `sesion` esté o
 *       no dentro de `sesiones` (se deduplica por id; manda la versión de `sesion`).
 *       accion: 'subir-peso' | 'bajar-peso' | 'variante' | 'subir-tiempo' | 'mantener'.
 *       cambios (campos de la rutina): { pesoSugerido } | { tempo | pausa | repeticiones |
 *       segundos, variante } | { ejercicioId, variante: null, pesoSugerido, repeticiones,
 *       segundos } | {} (mantener).
 *       + peso: gramos sugeridos (subir/bajar) o null · + pesoAnterior: gramos de referencia
 *         de la sesión o null · + paso: escalón de la escalera aplicado ({ tipo, texto, ... }) o null.
 *   aplicarProgresion(rutina, sugerencias, config) -> rutina nueva
 *       Aplica `cambios` a rutina.dias[diaId].ejercicios[indice] si el ejercicioId coincide (si no,
 *       ignora esa sugerencia). Cambios de peso/rango vía planner.ajustarEjercicio; tempo, pausa y
 *       variante directos; cambio de ejercicio vía planner.cambiarEjercicio (reordena por montaje)
 *       y vuelve a enlazar la superserie con la pareja. Sugerencias inválidas se ignoran.
 *   calcularRacha(sesiones, config, rutina, hoy)
 *       -> { actual, record, entrenadoHoy, hoyPendiente, ultimaFecha, + hoyMarcado }
 *   HITOS = [5, 10, 25, 50, 100]
 *   hitoAlcanzado(antes, despues) -> mayor hito h con antes < h <= despues | null
 *   datosGrafica(sesiones, ejercicioId, campo = campoGraficaPorDefecto(ejercicioId))
 *       -> [{ fecha, valor }] (una entrada por sesión, ascendente)
 *       'pesoMax' -> gramos · 'volumen' -> gramos ·
 *       'mejorSerie' -> tiempo: segundos; peso corporal (mejor serie con peso 0): repeticiones;
 *                       con peso: 1RM estimado (Epley, peso × (1 + reps / 30)) en gramos.
 *   campoGraficaPorDefecto(ejercicioId) -> 'pesoMax' (barra/mancuernas) | 'mejorSerie' (peso corporal o tiempo)
 *   + unidadGrafica(ejercicioId, campo) -> 'g' | 'reps' | 's' (para formatear el eje)
 *
 * DECISIONES
 * - item.variante (rutina y sesión) = ÍNDICE (0, 1, 2…) del último escalón de `variantes` del
 *   ejercicio ACTUAL que se ha aplicado, o null si ninguno. Al cambiar de ejercicio (paso
 *   'ejercicio') vuelve a null: empieza la escalera del ejercicio nuevo.
 * - La escalera continúa desde la variante de la SESIÓN (lo que se hizo de verdad; si falta, la
 *   del elemento de la rutina). Así, repetir sugerir+aplicar con la misma sesión no avanza dos veces.
 *   Los escalones cuyo efecto ya tiene el elemento (mismo tempo, misma pausa, mismo rango o mismos
 *   segundos; p. ej. la goblet de Pierna B ya lleva pausa de 2 s) se saltan, igual que los pasos
 *   'ejercicio' cuyo destino no está en planner.sustitutosPosibles (equipo que no se tiene).
 *   Los escalones son acumulativos: aplicar la pausa conserva el tempo anterior.
 * - SUBIR: todas las series del ejercicio hechas (ninguna pendiente) y todas con repeticiones
 *   (o segundos) >= máximo del rango. Peso de referencia = el MENOR peso de esas series; se
 *   sugiere el siguiente montable por encima. Sin montable mayor o en peso corporal -> escalera.
 *   Plancha: un escalón 'tiempo' da accion 'subir-tiempo'; el resto, 'variante'.
 * - BAJAR: una sesión "no llega" si AL MENOS LA MITAD de sus series hechas quedan por debajo del
 *   mínimo del rango. Se baja si la sesión actual y la anterior de ese ejercicio en el mismo
 *   diaId no llegan y la anterior se hizo con un peso de referencia (el mayor) <= al de la
 *   actual (si ya se bajó entre medias, no se vuelve a bajar). Va al montable anterior al mayor
 *   peso de la sesión actual; si no hay ninguno menor, 'mantener'. Solo en ejercicios con montaje.
 * - Un paso 'ejercicio' cuyo destino ya está en ese día (o ya se ha sugerido en esta misma
 *   llamada para otro ejercicio) se salta; si no queda otro escalón: 'mantener' con
 *   "Ya haces Sentadilla búlgara este día: sigue con la técnica y la pausa.".
 * - casiFallo: si TODAS las series se hacen y todas llegan a ejercicio.porDefecto.repeticiones[1]
 *   (15 si no hay), pasa al siguiente escalón de la escalera; si no, 'mantener'.
 * - Ejercicio saltado o sin series hechas -> se incluye con 'mantener', cambios {} y un texto
 *   corto. Ejercicios que ya no están en la rutina -> se omiten.
 * - marcasNuevas 'repeticiones': solo cuenta lo hecho con un peso >= al de la marca anterior de
 *   repeticiones (en peso corporal, 0 >= 0: igual que siempre).
 * - aplicarProgresion: al cambiar de ejercicio dentro de una superserie, la pareja se reenlaza
 *   solo si los montajes son compatibles; con barra + mancuernas queda superserieCon null en ambos.
 * - Racha: se usa la configuración y la rutina ACTUALES para todo el pasado (si cambias los días
 *   marcados, el pasado se reinterpreta). Solo cuentan sesiones terminadas con fecha <= hoy.
 */

import * as planner from './planner.js';
import { volumenSerie } from './workout.js';
import { EJERCICIOS } from './data/exercises.js';
import { pesosMontables, kg } from './data/equipment.js';

const POR_ID = new Map(EJERCICIOS.map((e) => [e.id, e]));
const ejercicio = (id) => POR_ID.get(id) || null;
const clonar = (v) => structuredClone(v);

export const HITOS = Object.freeze([5, 10, 25, 50, 100]);

/* ---------- Utilidades internas ---------- */

const esNum = (v) => typeof v === 'number' && Number.isFinite(v);
const rango = (v) => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(Number(x)))
  ? [Number(v[0]), Number(v[1])] : null);

function ordenarSesiones(lista) {
  return lista
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.fecha < b.s.fecha ? -1 : a.s.fecha > b.s.fecha ? 1 : 0)
      || String(a.s.inicio || '').localeCompare(String(b.s.inicio || ''))
      || a.i - b.i)
    .map((x) => x.s);
}

function sesionValida(s) {
  return s && typeof s === 'object' && typeof s.fecha === 'string' && Array.isArray(s.ejercicios);
}

function terminadas(sesiones) {
  return ordenarSesiones((Array.isArray(sesiones) ? sesiones : []).filter((s) => sesionValida(s) && s.terminada === true));
}

function tipoDe(ejercicioId, item) {
  const ej = ejercicio(ejercicioId);
  if (ej) return ej.tipo === 'tiempo' ? 'tiempo' : 'repeticiones';
  return item && Array.isArray(item.segundos) ? 'tiempo' : 'repeticiones';
}

function seriesHechas(item) {
  return (item && Array.isArray(item.series) ? item.series : []).filter((s) => s && s.hecha === true);
}

const limpiaSerie = (s) => ({
  peso: Number(s.peso) || 0,
  repeticiones: esNum(s.repeticiones) ? s.repeticiones : null,
  segundos: esNum(s.segundos) ? s.segundos : null,
});

/** ¿La serie a es mejor que b? */
function mejorQue(a, b, tipo) {
  if (!b) return true;
  if (tipo === 'tiempo') return (a.segundos || 0) > (b.segundos || 0);
  if (a.peso !== b.peso) return a.peso > b.peso;
  return (a.repeticiones || 0) > (b.repeticiones || 0);
}

/** Resumen de un ejercicio dentro de una sesión (junta las apariciones repetidas). */
function entradaDeSesion(sesion, ejercicioId) {
  const items = sesion.ejercicios.filter((e) => e && e.ejercicioId === ejercicioId);
  if (!items.length) return null;
  const series = [];
  let volumen = 0;
  for (const item of items) {
    for (const s of seriesHechas(item)) {
      series.push(limpiaSerie(s));
      volumen += volumenSerie(item, s);
    }
  }
  if (!series.length) return null;
  const tipo = tipoDe(ejercicioId, items[0]);
  let mejor = null;
  for (const s of series) if (mejorQue(s, mejor, tipo)) mejor = s;
  return {
    fecha: sesion.fecha,
    sesionId: sesion.id,
    diaId: sesion.diaId,
    variante: items[0].variante ?? null,
    tipo,
    pesoMax: series.reduce((m, s) => Math.max(m, s.peso), 0),
    mejorSerie: { ...mejor },
    volumen,
    series,
  };
}

/* ---------- Historial y marcas ---------- */

export function historialEjercicio(sesiones, ejercicioId) {
  const out = [];
  for (const s of terminadas(sesiones)) {
    const e = entradaDeSesion(s, ejercicioId);
    if (e) out.push(e);
  }
  return out;
}

function marcasVacias() {
  return { pesoMax: null, repsMax: null, segundosMax: null, volumenSesion: null };
}

/** Acumula en `marcas` (mutable, interno) las marcas de una sesión. */
function acumularMarcas(marcas, sesion) {
  const ids = [...new Set(sesion.ejercicios.filter(Boolean).map((e) => e.ejercicioId))];
  for (const id of ids) {
    const e = entradaDeSesion(sesion, id);
    if (!e) continue;
    const m = marcas[id] || (marcas[id] = marcasVacias());
    const fecha = sesion.fecha;
    for (const s of e.series) {
      if (s.peso > 0 && esNum(s.repeticiones)) {
        if (!m.pesoMax || s.peso > m.pesoMax.peso || (s.peso === m.pesoMax.peso && s.repeticiones > m.pesoMax.repeticiones)) {
          m.pesoMax = { peso: s.peso, repeticiones: s.repeticiones, fecha };
        }
      }
      if (esNum(s.repeticiones) && s.repeticiones > 0) {
        if (!m.repsMax || s.repeticiones > m.repsMax.repeticiones || (s.repeticiones === m.repsMax.repeticiones && s.peso > m.repsMax.peso)) {
          m.repsMax = { repeticiones: s.repeticiones, peso: s.peso, fecha };
        }
      }
      if (esNum(s.segundos) && s.segundos > 0) {
        if (!m.segundosMax || s.segundos > m.segundosMax.segundos) m.segundosMax = { segundos: s.segundos, fecha };
      }
    }
    if (e.volumen > 0 && (!m.volumenSesion || e.volumen > m.volumenSesion.volumen)) {
      m.volumenSesion = { volumen: e.volumen, fecha };
    }
  }
  return marcas;
}

export function mejoresMarcas(sesiones) {
  const marcas = {};
  for (const s of terminadas(sesiones)) acumularMarcas(marcas, s);
  return marcas;
}

export function marcasNuevas(sesion, sesionesAnteriores) {
  if (!sesionValida(sesion)) return [];
  const previas = (Array.isArray(sesionesAnteriores) ? sesionesAnteriores : []).filter((s) => s && s.id !== sesion.id);
  const antes = mejoresMarcas(previas);
  const ahora = acumularMarcas({}, sesion);
  const out = [];
  for (const [id, m] of Object.entries(ahora)) {
    const a = antes[id];
    if (!a) continue; // sin historial: no cuenta como marca
    const comparar = (tipo, valor, anterior) => {
      if (valor === null || valor === undefined) return;
      if (anterior === null || valor > anterior) out.push({ ejercicioId: id, tipo, valor, anterior });
    };
    if (m.pesoMax) comparar('peso', m.pesoMax.peso, a.pesoMax ? a.pesoMax.peso : null);
    if (m.repsMax) {
      // Solo cuenta con un peso igual o mayor que el de la marca anterior de repeticiones.
      const minPeso = a.repsMax ? a.repsMax.peso : 0;
      const e = entradaDeSesion(sesion, id);
      const reps = e ? e.series.filter((x) => x.peso >= minPeso && esNum(x.repeticiones)).map((x) => x.repeticiones) : [];
      if (reps.length) comparar('repeticiones', Math.max(...reps), a.repsMax ? a.repsMax.repeticiones : null);
    }
    if (m.segundosMax) comparar('segundos', m.segundosMax.segundos, a.segundosMax ? a.segundosMax.segundos : null);
    if (m.volumenSesion) comparar('volumen', m.volumenSesion.volumen, a.volumenSesion ? a.volumenSesion.volumen : null);
  }
  return out;
}

/* ---------- Progresión ---------- */

const textoPeso = (g, tipo) => `${kg(g)}${tipo === 'par-mancuernas' ? ' por mancuerna' : ''}`;

function siguienteMontable(peso, tipo, config, dir) {
  const lista = pesosMontables(tipo, config);
  if (dir > 0) return lista.find((p) => p > peso) ?? null;
  for (let i = lista.length - 1; i >= 0; i--) if (lista[i] < peso) return lista[i];
  return null;
}

const mismoRango = (a, b) => Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];

/** ¿El elemento ya tiene el efecto de este escalón? */
function pasoYaAplicado(paso, item) {
  switch (paso.tipo) {
    case 'tempo': return item.tempo === paso.valor;
    case 'pausa': return item.pausa === paso.segundos;
    case 'rango': return mismoRango(rango(item.repeticiones), paso.repeticiones);
    case 'tiempo': return mismoRango(rango(item.segundos), paso.segundos);
    default: return false;
  }
}

function indiceVariante(v, ej) {
  if (Number.isInteger(v) && v >= 0) return v;
  // Compatibilidad: si alguien guardó un id de ejercicio o un texto, se busca en la escalera.
  if (typeof v === 'string' && ej) {
    const i = (ej.variantes || []).findIndex((p) => p && (p.id === v || p.texto === v || p.valor === v));
    return i;
  }
  return -1;
}

/** Siguiente escalón aplicable: { indice, paso } | null. */
function siguienteEscalon(ejercicioId, base, config, ocupados = new Set(), info = {}) {
  const ej = ejercicio(ejercicioId);
  if (!ej || !Array.isArray(ej.variantes)) return null;
  const desde = indiceVariante(base.variante, ej) + 1;
  for (let i = desde; i < ej.variantes.length; i++) {
    const paso = ej.variantes[i];
    if (!paso || pasoYaAplicado(paso, base)) continue;
    if (paso.tipo === 'ejercicio') {
      const ok = planner.sustitutosPosibles(ejercicioId, config).some((s) => s.id === paso.id);
      if (!ok || !ejercicio(paso.id)) continue;
      if (ocupados.has(paso.id)) { info.duplicado = paso.id; continue; }
    }
    return { indice: i, paso };
  }
  return null;
}

function cambiosDeEscalon(esc, config) {
  const { indice, paso } = esc;
  switch (paso.tipo) {
    case 'tempo': return { tempo: paso.valor, variante: indice };
    case 'pausa': return { pausa: paso.segundos, variante: indice };
    case 'rango': return { repeticiones: [...paso.repeticiones], variante: indice };
    case 'tiempo': return { segundos: [...paso.segundos], variante: indice };
    case 'lastre': return { variante: indice };
    case 'ejercicio': {
      const nuevo = ejercicio(paso.id);
      const pd = nuevo.porDefecto || {};
      const conPeso = nuevo.equipo === 'barra' || nuevo.equipo === 'mancuernas';
      return {
        ejercicioId: paso.id,
        variante: null,
        pesoSugerido: conPeso ? planner.pesoInicial(paso.id, config && config.nivel, config) : null,
        repeticiones: pd.repeticiones ? [...pd.repeticiones] : null,
        segundos: pd.segundos ? [...pd.segundos] : null,
      };
    }
    default: return { variante: indice };
  }
}

/** ¿La sesión "no llega" al mínimo? Al menos la mitad de las series hechas por debajo. */
function noLlega(item) {
  const hechas = seriesHechas(item);
  if (!hechas.length || item.casiFallo) return false;
  const segs = rango(item.segundos);
  const reps = rango(item.repeticiones);
  const campo = segs ? 'segundos' : 'repeticiones';
  const r = segs || reps;
  if (!r) return false;
  const debajo = hechas.filter((s) => (Number(s[campo]) || 0) < r[0]).length;
  return debajo * 2 >= hechas.length;
}

function mantener(base, texto) {
  return { ...base, accion: 'mantener', texto, cambios: {}, peso: null, paso: null };
}

/** Escalera: sugerencia del siguiente escalón, o 'mantener' si no queda ninguno. */
function sugerirEscalon(base, item, itemRutina, config, ocupados, tipo, pesoMin) {
  const elegir = (campo) => (item[campo] !== undefined ? item[campo] : itemRutina[campo]);
  const baseEscalera = {
    variante: elegir('variante'), tempo: elegir('tempo'), pausa: elegir('pausa'),
    repeticiones: elegir('repeticiones'), segundos: elegir('segundos'),
  };
  const info = {};
  const esc = siguienteEscalon(item.ejercicioId, baseEscalera, config, ocupados, info);
  if (!esc) {
    if (info.duplicado) {
      const nombre = ejercicio(info.duplicado).nombre;
      const tecnica = baseEscalera.pausa ? ' y la pausa' : baseEscalera.tempo ? ' y la bajada lenta' : '';
      return mantener(base, `Ya haces ${nombre} este día: sigue con la técnica${tecnica}.`);
    }
    return mantener(base, tipo
      ? `Escalera completada: sigue con ${textoPeso(pesoMin, tipo)} y cuida la técnica.`
      : 'Escalera completada: sigue así y cuida la técnica.');
  }
  const cambios = cambiosDeEscalon(esc, config);
  if (cambios.ejercicioId) ocupados.add(cambios.ejercicioId);
  const accion = esc.paso.tipo === 'tiempo' ? 'subir-tiempo' : 'variante';
  const motivo = tipo ? 'Peso al máximo. ' : '';
  return { ...base, accion, texto: `${motivo}Siguiente paso: ${esc.paso.texto}`.trim(),
    cambios, peso: null, paso: clonar(esc.paso) };
}

const REPS_CASI_FALLO_POR_DEFECTO = 15;

function sugerirUno(base, item, itemRutina, previo, config, ocupados) {
  const ej = ejercicio(item.ejercicioId);
  const tipo = planner.tipoMontaje(itemRutina) || planner.tipoMontaje(item);
  const hechas = seriesHechas(item);
  const segs = rango(item.segundos);
  const reps = rango(item.repeticiones);
  const campo = segs ? 'segundos' : 'repeticiones';
  const r = segs || reps;
  const unidad = segs ? 's' : 'repeticiones';
  const pesoTxt = (g) => textoPeso(g, tipo);

  if (item.saltado) return mantener(base, 'Ejercicio saltado: repite el plan la próxima vez.');
  if (!hechas.length) return mantener(base, 'Sin series hechas: repite el plan la próxima vez.');
  if (item.casiFallo || !r) {
    const mejor = Math.max(...hechas.map((s) => Number(s.repeticiones) || 0));
    const pd = ej && ej.porDefecto && Array.isArray(ej.porDefecto.repeticiones) ? ej.porDefecto.repeticiones : null;
    const umbral = pd ? pd[1] : REPS_CASI_FALLO_POR_DEFECTO;
    const todasHechas = item.series.length > 0 && item.series.every((s) => s && s.hecha === true);
    if (item.casiFallo && todasHechas && hechas.every((s) => (Number(s.repeticiones) || 0) >= umbral)) {
      const sug = sugerirEscalon(base, item, itemRutina, config, ocupados, null, 0);
      if (sug.accion !== 'mantener' || /^Ya haces/.test(sug.texto)) return sug;
    }
    return mantener(base, `Casi al fallo: intenta superar tus ${mejor} repeticiones.`);
  }

  const pesos = hechas.map((s) => Number(s.peso) || 0);
  const pesoMin = Math.min(...pesos);
  const pesoMax = Math.max(...pesos);
  base.pesoAnterior = tipo ? pesoMin : null;
  const todas = item.series.length > 0 && item.series.every((s) => s && s.hecha === true);
  const enMaximo = todas && hechas.every((s) => (Number(s[campo]) || 0) >= r[1]);

  if (enMaximo) {
    const sig = tipo ? siguienteMontable(pesoMin, tipo, config, 1) : null;
    if (sig !== null) {
      return { ...base, accion: 'subir-peso', texto: `Sube a ${pesoTxt(sig)} la próxima vez`,
        cambios: { pesoSugerido: sig }, peso: sig, paso: null };
    }
    return sugerirEscalon(base, item, itemRutina, config, ocupados, tipo, pesoMin);
  }

  if (tipo && noLlega(item) && previo && noLlega(previo.item) && previo.pesoRef <= pesoMax) {
    const ant = siguienteMontable(pesoMax, tipo, config, -1);
    if (ant !== null) {
      base.pesoAnterior = pesoMax;
      return { ...base, accion: 'bajar-peso',
        texto: `Baja a ${pesoTxt(ant)}: 2 sesiones sin llegar a ${r[0]} ${unidad}`,
        cambios: { pesoSugerido: ant }, peso: ant, paso: null };
    }
  }

  // Mantener: cuánto falta para el máximo.
  const faltan = item.series
    .map((s, k) => ({ k, f: s && s.hecha ? Math.max(0, r[1] - (Number(s[campo]) || 0)) : null }))
    .filter((x) => x.f !== 0);
  const inicio = tipo ? `Sigue con ${pesoTxt(pesoMin)}` : 'Sigue así';
  let detalle;
  if (faltan.length === 1 && faltan[0].f !== null) {
    detalle = `te ${faltan[0].f === 1 ? 'falta' : 'faltan'} ${faltan[0].f} ${segs ? 's' : faltan[0].f === 1 ? 'repetición' : 'repeticiones'} en la serie ${faltan[0].k + 1}`;
  } else {
    detalle = `llega a ${r[1]} ${segs ? 's' : 'repeticiones'} en todas las series para subir`;
  }
  return mantener(base, `${inicio}: ${detalle}.`);
}

export function sugerirProgresion(rutina, sesiones, sesion, config) {
  if (!rutina || !Array.isArray(rutina.dias) || !sesionValida(sesion)) return [];
  const dia = rutina.dias.find((d) => d.id === sesion.diaId);
  if (!dia) return [];

  // Sesiones del mismo día, sin duplicar la actual, hasta la actual (incluida).
  const otras = (Array.isArray(sesiones) ? sesiones : [])
    .filter((s) => sesionValida(s) && s.terminada === true && s.id !== sesion.id && s.diaId === sesion.diaId);
  const orden = ordenarSesiones([...otras, sesion]);
  const posActual = orden.indexOf(sesion);
  const anteriores = orden.slice(0, posActual);

  const vistos = {};
  const out = [];
  // Ejercicios que ya hay en el día (y destinos ya sugeridos): un paso 'ejercicio' no los repite.
  const ocupados = new Set(dia.ejercicios.map((e) => e.ejercicioId));
  for (const item of sesion.ejercicios) {
    if (!item) continue;
    const id = item.ejercicioId;
    const k = vistos[id] = (vistos[id] ?? -1) + 1;
    let n = -1;
    const indice = dia.ejercicios.findIndex((e) => e.ejercicioId === id && ++n === k);
    if (indice < 0) continue;

    // Sesión anterior con ese ejercicio hecho.
    let previo = null;
    for (let i = anteriores.length - 1; i >= 0 && !previo; i--) {
      const pi = anteriores[i].ejercicios.filter((e) => e && e.ejercicioId === id);
      const it = pi[k] || pi[0];
      if (it && seriesHechas(it).length) {
        previo = { item: it, pesoRef: Math.max(...seriesHechas(it).map((s) => Number(s.peso) || 0)) };
      }
    }
    const base = { diaId: dia.id, indice, ejercicioId: id, pesoAnterior: null };
    out.push(sugerirUno(base, item, dia.ejercicios[indice], previo, config, ocupados));
  }
  return out;
}

const MARCA = '__progresoPos';

export function aplicarProgresion(rutina, sugerencias, config) {
  let nueva = clonar(rutina);
  if (!nueva || !Array.isArray(nueva.dias)) return nueva;
  const validas = (Array.isArray(sugerencias) ? sugerencias : []).filter((s) => {
    if (!s || !s.cambios || !Object.keys(s.cambios).length) return false;
    const d = nueva.dias.find((x) => x.id === s.diaId);
    const it = d && Number.isInteger(s.indice) ? d.ejercicios[s.indice] : null;
    return Boolean(it && it.ejercicioId === s.ejercicioId);
  });

  // 1) Cambios que no mueven elementos.
  for (const s of validas.filter((x) => !x.cambios.ejercicioId || x.cambios.ejercicioId === x.ejercicioId)) {
    const c = s.cambios;
    const ajuste = {};
    for (const campo of ['series', 'repeticiones', 'segundos', 'descanso', 'pesoSugerido']) {
      if (campo in c && c[campo] !== null && c[campo] !== undefined) ajuste[campo] = c[campo];
    }
    let paso = nueva;
    try {
      if (Object.keys(ajuste).length) paso = planner.ajustarEjercicio(paso, s.diaId, s.indice, ajuste, config);
    } catch {
      continue; // cambio no válido: se ignora esta sugerencia
    }
    if (paso === nueva) paso = clonar(nueva);
    const item = paso.dias.find((d) => d.id === s.diaId).ejercicios[s.indice];
    for (const campo of ['tempo', 'pausa', 'variante']) if (campo in c) item[campo] = c[campo];
    nueva = paso;
  }

  // 2) Cambios de ejercicio (reordenan el día): se sigue cada elemento con una marca temporal.
  const deEjercicio = validas.filter((x) => x.cambios.ejercicioId && x.cambios.ejercicioId !== x.ejercicioId);
  if (deEjercicio.length) {
    for (const d of nueva.dias) d.ejercicios.forEach((e, i) => { e[MARCA] = i; });
    for (const s of deEjercicio) {
      const d = nueva.dias.find((x) => x.id === s.diaId);
      const idx = d.ejercicios.findIndex((e) => e[MARCA] === s.indice);
      if (idx < 0 || d.ejercicios[idx].ejercicioId !== s.ejercicioId) continue;
      const viejo = d.ejercicios[idx];
      const parejaPos = viejo.superserieCon
        ? (d.ejercicios.find((e) => e !== viejo && e.ejercicioId === viejo.superserieCon && e.superserieCon === viejo.ejercicioId) || {})[MARCA]
        : undefined;
      let r;
      try {
        r = planner.cambiarEjercicio(nueva, s.diaId, idx, s.cambios.ejercicioId, config);
      } catch {
        continue;
      }
      const dn = r.dias.find((x) => x.id === s.diaId);
      const nuevoItem = dn.ejercicios.find((e) => !(MARCA in e));
      if (!nuevoItem) continue;
      nuevoItem[MARCA] = s.indice;
      nuevoItem.variante = null;
      if (parejaPos !== undefined) {
        const pareja = dn.ejercicios.find((e) => e[MARCA] === parejaPos);
        const montajes = new Set([pareja && pareja.montaje, nuevoItem.montaje]);
        const compatibles = !(montajes.has('barra') && montajes.has('mancuernas'));
        if (pareja && compatibles) {
          pareja.superserieCon = nuevoItem.ejercicioId;
          nuevoItem.superserieCon = pareja.ejercicioId;
          const iN = dn.ejercicios.indexOf(nuevoItem);
          const iP = dn.ejercicios.indexOf(pareja);
          if (Math.abs(iN - iP) !== 1) {
            dn.ejercicios.splice(iP, 1);
            const destino = dn.ejercicios.indexOf(nuevoItem);
            dn.ejercicios.splice(iP < iN ? destino : destino + 1, 0, pareja);
          }
        }
      }
      nueva = r;
    }
    for (const d of nueva.dias) for (const e of d.ejercicios) delete e[MARCA];
  }
  return nueva;
}

/* ---------- Racha ---------- */

function aUTC(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

function aTexto(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function calcularRacha(sesiones, config, rutina, hoy) {
  const fechas = new Set(
    (Array.isArray(sesiones) ? sesiones : [])
      .filter((s) => sesionValida(s) && s.terminada === true && aUTC(s.fecha) && s.fecha <= hoy)
      .map((s) => s.fecha),
  );
  const marcado = (f) => {
    try {
      return Boolean(planner.diaParaFecha(rutina, config, f).dia);
    } catch {
      return false;
    }
  };
  const hoyMarcado = aUTC(hoy) ? marcado(hoy) : false;
  const entrenadoHoy = fechas.has(hoy);
  const res = { actual: 0, record: 0, entrenadoHoy, hoyPendiente: hoyMarcado && !entrenadoHoy, ultimaFecha: null, hoyMarcado };
  if (!fechas.size || !aUTC(hoy)) return res;

  const ordenadas = [...fechas].sort();
  res.ultimaFecha = ordenadas[ordenadas.length - 1];
  const d = aUTC(ordenadas[0]);
  const fin = aUTC(hoy);
  let actual = 0;
  let record = 0;
  while (d <= fin) {
    const f = aTexto(d);
    if (fechas.has(f)) {
      actual++;
      if (actual > record) record = actual;
    } else if (f !== hoy && marcado(f)) {
      actual = 0;
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  res.actual = actual;
  res.record = record;
  return res;
}

export function hitoAlcanzado(antes, despues) {
  const a = Number(antes) || 0;
  const b = Number(despues) || 0;
  let hito = null;
  for (const h of HITOS) if (a < h && h <= b) hito = h;
  return hito;
}

/* ---------- Gráficas ---------- */

function conPeso(ejercicioId) {
  const ej = ejercicio(ejercicioId);
  return Boolean(ej && (ej.equipo === 'barra' || ej.equipo === 'mancuernas'));
}

export function campoGraficaPorDefecto(ejercicioId) {
  const ej = ejercicio(ejercicioId);
  if (!ej) return 'mejorSerie';
  return ej.tipo !== 'tiempo' && conPeso(ejercicioId) ? 'pesoMax' : 'mejorSerie';
}

export function unidadGrafica(ejercicioId, campo = campoGraficaPorDefecto(ejercicioId)) {
  if (campo === 'pesoMax' || campo === 'volumen') return 'g';
  const ej = ejercicio(ejercicioId);
  if (ej && ej.tipo === 'tiempo') return 's';
  return conPeso(ejercicioId) ? 'g' : 'reps';
}

export function datosGrafica(sesiones, ejercicioId, campo = campoGraficaPorDefecto(ejercicioId)) {
  return historialEjercicio(sesiones, ejercicioId).map((e) => {
    let valor;
    if (campo === 'volumen') valor = e.volumen;
    else if (campo === 'pesoMax') valor = e.pesoMax;
    else if (e.tipo === 'tiempo') valor = e.mejorSerie.segundos || 0;
    else if (!(e.mejorSerie.peso > 0)) valor = e.mejorSerie.repeticiones || 0;
    else valor = Math.round(e.mejorSerie.peso * (1 + (e.mejorSerie.repeticiones || 0) / 30));
    return { fecha: e.fecha, valor };
  });
}
