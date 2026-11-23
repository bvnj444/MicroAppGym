/*
 * MicroApp Gym — planner.js
 * Planificador: genera la rutina, aplica el nivel, asigna días, cambia y ajusta ejercicios.
 * Funciones PURAS: sin DOM ni localStorage. Nunca mutan la entrada; devuelven datos nuevos.
 *
 * Convenciones: fecha 'AAAA-MM-DD' (local), días ISO (1 = lunes … 7 = domingo), pesos en gramos.
 * `config` y la RUTINA GENERADA tienen la forma de los CONTRATOS de storage.js.
 * La rutina de 3 días lleva además `huecos` (días ISO) y `rotacion` ({ semanaImpar, semanaPar }),
 * y sus días cuerpo-a / cuerpo-b llevan diaSemana: null.
 * `pesoSugerido` es null en los elementos sin montaje (peso corporal).
 *
 * API
 *   generarRutina(config, ahoraISO?)                -> rutina nueva (version 1)
 *   pesoInicial(ejercicioId, nivel, config)         -> gramos (montable, redondeado hacia abajo; 0 en peso corporal)
 *   tipoMontaje(item)                               -> 'barra' | 'una-mancuerna' | 'par-mancuernas' | null
 *   necesitaRegenerar(rutina, config)               -> boolean
 *   reasignarDias(rutina, config)                   -> rutina con diaSemana (o huecos) = config.diasSemana
 *   semanaISO(fecha)                                -> { anio, semana }
 *   diaParaFecha(rutina, config, fecha)             -> { dia: copia con el nivel aplicado | null, descanso, diaSemana }
 *   semana(rutina, config, fecha)                   -> [{ fecha, diaSemana, dia | null, descanso }] × 7 (lunes→domingo)
 *   proximoEntreno(rutina, config, fecha)           -> { fecha, dia } | null (busca desde el día siguiente)
 *   sustitutosPosibles(ejercicioId, config)         -> [ejercicio del catálogo]
 *   cambiarEjercicio(rutina, diaId, indice, nuevoId, config)  -> rutina nueva (lanza Error si no es válido)
 *   ajustarEjercicio(rutina, diaId, indice, cambios, config)  -> rutina nueva (lanza Error si no es válido)
 *       cambios: { series?, repeticiones?: [min,max], segundos?: [min,max], descanso?, pesoSugerido? }
 *   pesosPosibles(item, config)                     -> [gramos] ascendente | [] (peso corporal)
 *   resumenDia(dia)                                 -> { ejercicios, series, minutosEstimados, montajes }
 *
 * Detalles:
 * - El día que devuelve diaParaFecha lleva `ajustePrincipiante: true|false`.
 * - Principiante: si fechaInicio es null, el periodo cuenta desde la propia `fecha` consultada.
 * - Al reordenar por montaje, una superserie (pareja enlazada y consecutiva) se mueve como un
 *   bloque con el montaje de su primer elemento, para que nunca se separe.
 * - resumenDia.montajes: montajes distintos en orden de aparición (incluye 'ninguno').
 */

import { EJERCICIOS } from './data/exercises.js';
import { PLANTILLAS } from './data/routines.js';
import { pesosMontables, calcularMontaje } from './data/equipment.js';

const VERSION_RUTINA = 1;
const ORDEN_MONTAJE = { barra: 0, mancuernas: 1, ninguno: 2 };
const DIAS_PRINCIPIANTE = 14;

const POR_ID = new Map(EJERCICIOS.map((e) => [e.id, e]));
const ejercicio = (id) => POR_ID.get(id) || null;

/* ---------- Pesos iniciales (kg, nivel intermedio; principiante = 70 %) ---------- */
// Barra: peso total. Par de mancuernas: por mancuerna. Una mancuerna: esa mancuerna.
const PESOS_INICIALES_KG = {
  // Barra
  'press-suelo-barra': 15,
  'remo-barra': 15,
  'press-militar-barra': 10,
  'press-frances-suelo': 8,
  'curl-barra': 10,
  'peso-muerto-rumano-barra': 20,
  'hip-thrust-barra': 25,
  // Par de mancuernas
  'press-suelo-mancuernas': 8,
  'aperturas-suelo': 5,
  'press-squeeze': 6,
  'remo-inclinado-mancuernas': 8,
  'remo-renegado': 5,
  'elevaciones-laterales': 4,
  'pajaros': 4,
  'curl-martillo': 6,
  'sentadilla-bulgara': 6,
  'peso-muerto-una-pierna': 8,
  'zancadas-atras': 6,
  'press-militar-mancuernas': 7,
  // Una mancuerna
  'sentadilla-goblet': 12,
  'remo-mancuerna-una-mano': 10,
  'pullover-suelo': 8,
  'curl-concentrado': 6,
  'extension-triceps-cabeza': 8,
  'hip-thrust-una-pierna': 10,
};

// Respaldo por grupo y tipo de montaje para ejercicios que no estén en la tabla.
const PESOS_POR_GRUPO_KG = {
  barra: { pecho: 15, espalda: 15, hombro: 10, pierna: 20, brazos: 8, core: 5 },
  'par-mancuernas': { pecho: 6, espalda: 8, hombro: 4, pierna: 6, brazos: 5, core: 3 },
  'una-mancuerna': { pecho: 8, espalda: 10, hombro: 6, pierna: 10, brazos: 6, core: 5 },
};

/* ---------- Utilidades internas ---------- */

const clonar = (v) => structuredClone(v);

function montajeDeEjercicio(ej) {
  if (!ej) return 'ninguno';
  if (ej.equipo === 'barra') return 'barra';
  if (ej.equipo === 'mancuernas') return 'mancuernas';
  return 'ninguno';
}

function equipoCumple(ej, config) {
  if (!ej) return false;
  const equipo = (config && config.equipo) || {};
  if (ej.equipo !== 'peso corporal' && equipo.mancuernas === false) return false;
  return (ej.requiere || []).every((r) => equipo[r] === true);
}

function pesoParaElemento(item, nivel, config) {
  return tipoMontaje(item) ? pesoInicial(item.ejercicioId, nivel, config) : null;
}

/** Elemento nuevo de rutina a partir del catálogo (porDefecto). */
function crearElemento(ejercicioId, config) {
  const ej = ejercicio(ejercicioId);
  const pd = ej.porDefecto || {};
  const montaje = montajeDeEjercicio(ej);
  const item = {
    ejercicioId,
    montaje,
    numMancuernas: montaje === 'mancuernas' ? (ej.numMancuernas || 2) : null,
    series: pd.series ?? 3,
    repeticiones: pd.repeticiones ? [...pd.repeticiones] : null,
    segundos: pd.segundos ? [...pd.segundos] : null,
    casiFallo: false,
    descanso: pd.descanso ?? 90,
    tempo: null,
    pausa: null,
    superserieCon: null,
    variante: null,
    pesoSugerido: null,
  };
  item.pesoSugerido = pesoParaElemento(item, config && config.nivel, config);
  return item;
}

/** Índice de la pareja de superserie del elemento i, o -1. */
function indicePareja(ejercicios, i) {
  const item = ejercicios[i];
  if (!item || !item.superserieCon) return -1;
  const cand = [i + 1, i - 1, ...ejercicios.map((_, k) => k)];
  for (const k of cand) {
    const otro = ejercicios[k];
    if (k !== i && otro && otro.ejercicioId === item.superserieCon && otro.superserieCon === item.ejercicioId) return k;
  }
  return -1;
}

/** Orden estable por montaje; las superseries consecutivas se mueven juntas. */
function ordenarPorMontaje(ejercicios) {
  const bloques = [];
  for (let i = 0; i < ejercicios.length; i++) {
    const item = ejercicios[i];
    const sig = ejercicios[i + 1];
    if (sig && item.superserieCon && item.superserieCon === sig.ejercicioId && sig.superserieCon === item.ejercicioId) {
      bloques.push({ items: [item, sig], pos: bloques.length });
      i++;
    } else {
      bloques.push({ items: [item], pos: bloques.length });
    }
  }
  const clave = (b) => ORDEN_MONTAJE[b.items[0].montaje] ?? 3;
  bloques.sort((a, b) => clave(a) - clave(b) || a.pos - b.pos);
  return bloques.flatMap((b) => b.items);
}

/** Cambia en sitio (sobre una copia) el elemento i del día por nuevoId. */
function sustituirEnDia(dia, i, nuevoId, config) {
  const viejo = dia.ejercicios[i];
  const k = indicePareja(dia.ejercicios, i);
  if (k >= 0) dia.ejercicios[k].superserieCon = null;
  else if (viejo.superserieCon) {
    // Enlace sin pareja recíproca: rompe cualquier referencia que apunte al viejo.
    for (const otro of dia.ejercicios) if (otro.superserieCon === viejo.ejercicioId) otro.superserieCon = null;
  }
  dia.ejercicios[i] = crearElemento(nuevoId, config);
  dia.ejercicios = ordenarPorMontaje(dia.ejercicios);
}

function buscarDia(rutina, diaId) {
  if (!rutina || !Array.isArray(rutina.dias)) throw new Error('No hay ninguna rutina.');
  const dia = rutina.dias.find((d) => d.id === diaId);
  if (!dia) throw new Error(`No existe el día "${diaId}" en la rutina.`);
  return dia;
}

function buscarElemento(dia, indice) {
  const item = Number.isInteger(indice) ? dia.ejercicios[indice] : undefined;
  if (!item) throw new Error(`No hay ningún ejercicio en la posición ${indice} de ${dia.nombre || dia.id}.`);
  return item;
}

function diasElegidos(config) {
  return Array.isArray(config && config.diasSemana) ? [...config.diasSemana].sort((a, b) => a - b) : [];
}

/* ---------- Fechas ---------- */

function aUTC(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha));
  if (!m) throw new Error(`Fecha no válida: "${fecha}". Usa el formato AAAA-MM-DD.`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function aTexto(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function sumarDias(fecha, n) {
  const d = aUTC(fecha);
  d.setUTCDate(d.getUTCDate() + n);
  return aTexto(d);
}

function diaSemanaDe(fecha) {
  return aUTC(fecha).getUTCDay() || 7;
}

/**
 * Rotación de 3 días: alterna A/B/A y B/A/B semana a semana de forma continua,
 * contando semanas desde la semana de `fechaInicio` (la primera semana es A/B/A).
 * No usa la paridad de la semana ISO, que se rompe en los años de 53 semanas
 * (la 53 y la 1 son impares y saldrían dos A/B/A seguidas).
 */
function listaRotacion(rotacion, config, fecha) {
  const lunes = (f) => sumarDias(f, 1 - diaSemanaDe(f));
  const inicio = config && config.fechaInicio ? config.fechaInicio : '2026-01-05'; // un lunes de referencia
  const semanas = Math.round((aUTC(lunes(fecha)) - aUTC(lunes(inicio))) / (7 * 86400000));
  return ((semanas % 2) + 2) % 2 === 0 ? rotacion.semanaImpar : rotacion.semanaPar;
}

export function semanaISO(fecha) {
  const d = aUTC(fecha);
  const ds = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - ds); // jueves de esa semana
  const anio = d.getUTCFullYear();
  const inicio = Date.UTC(anio, 0, 1);
  const semana = Math.floor((d.getTime() - inicio) / 86400000 / 7) + 1;
  return { anio, semana };
}

/* ---------- API ---------- */

export function tipoMontaje(item) {
  if (!item) return null;
  let montaje = item.montaje;
  if (!montaje && item.equipo) montaje = montajeDeEjercicio(item);
  if (montaje === 'barra') return 'barra';
  if (montaje === 'mancuernas') return item.numMancuernas === 1 ? 'una-mancuerna' : 'par-mancuernas';
  return null;
}

export function pesoInicial(ejercicioId, nivel, config) {
  const ej = ejercicio(ejercicioId);
  if (!ej) return 0;
  const tipo = tipoMontaje({ montaje: montajeDeEjercicio(ej), numMancuernas: ej.numMancuernas });
  if (!tipo) return 0;
  const kg = PESOS_INICIALES_KG[ejercicioId] ?? PESOS_POR_GRUPO_KG[tipo][ej.grupo] ?? 5;
  const objetivo = Math.round(kg * 1000 * (nivel === 'principiante' ? 0.7 : 1));
  const pesos = pesosMontables(tipo, config);
  if (!pesos.length) return 0;
  let elegido = pesos[0];
  for (const p of pesos) if (p <= objetivo) elegido = p;
  return elegido;
}

export function generarRutina(config, ahoraISO = new Date().toISOString()) {
  const n = config && config.diasPorSemana;
  const plantillaId = `${n}-dias`;
  const plantilla = PLANTILLAS[plantillaId];
  if (!plantilla) throw new Error(`No hay rutina para ${n} días por semana.`);
  const tpl = clonar(plantilla);
  const elegidos = diasElegidos(config);
  const tres = n === 3;

  const dias = tpl.dias.map((d, i) => {
    const dia = {
      id: d.id,
      nombre: d.nombre,
      diaSemana: tres ? null : (elegidos[i] ?? null),
      ejercicios: d.ejercicios.map((e) => {
        const item = { ...e, variante: null, pesoSugerido: null };
        item.pesoSugerido = pesoParaElemento(item, config.nivel, config);
        return item;
      }),
    };
    // Cambia los ejercicios que el equipo actual no permite por su primer sustituto posible.
    for (let k = 0; k < dia.ejercicios.length; k++) {
      const id = dia.ejercicios[k].ejercicioId;
      if (!equipoCumple(ejercicio(id), config)) {
        const alt = sustitutosPosibles(id, config)[0];
        if (alt) sustituirEnDia(dia, k, alt.id, config);
      }
    }
    return dia;
  });

  const rutina = {
    version: VERSION_RUTINA,
    generadaEn: ahoraISO,
    plantillaId,
    nivel: config.nivel,
    dias,
  };
  if (tres) {
    rutina.huecos = elegidos;
    rutina.rotacion = clonar(tpl.rotacion);
  }
  return rutina;
}

export function necesitaRegenerar(rutina, config) {
  if (!rutina || typeof rutina !== 'object' || Array.isArray(rutina)) return true;
  if (rutina.version !== VERSION_RUTINA || !Array.isArray(rutina.dias) || !rutina.dias.length) return true;
  return rutina.plantillaId !== `${config && config.diasPorSemana}-dias`;
}

export function reasignarDias(rutina, config) {
  const nueva = clonar(rutina);
  const elegidos = diasElegidos(config);
  if (nueva.plantillaId === '3-dias') {
    nueva.huecos = elegidos;
    for (const d of nueva.dias) d.diaSemana = null;
  } else {
    nueva.dias.forEach((d, i) => { d.diaSemana = elegidos[i] ?? null; });
  }
  // Los demás ajustes (nivel, discos, peso de las piezas) se aplican sin perder los
  // cambios del usuario: se actualiza el nivel y cada peso sugerido se lleva al
  // montable más cercano con el equipo actual (si ya era montable, no cambia).
  // Si cambia el nivel, los pesos que el usuario NO ha tocado (siguen siendo el peso
  // inicial del nivel anterior) pasan al peso inicial del nivel nuevo.
  const nivelAnterior = nueva.nivel;
  const cambiaNivel = nivelAnterior && nivelAnterior !== config.nivel;
  nueva.nivel = config.nivel;
  for (const d of nueva.dias) {
    for (const item of d.ejercicios) {
      const tipo = tipoMontaje(item);
      if (cambiaNivel && tipo && item.pesoSugerido === pesoInicial(item.ejercicioId, nivelAnterior, config)) {
        item.pesoSugerido = pesoInicial(item.ejercicioId, config.nivel, config);
      }
      if (tipo && Number.isFinite(item.pesoSugerido)) {
        item.pesoSugerido = pesoMasCercano(item.pesoSugerido, tipo, config);
      }
    }
  }
  return nueva;
}

function enPeriodoPrincipiante(config, fecha) {
  if (!config || config.nivel !== 'principiante') return false;
  const inicio = config.fechaInicio || fecha;
  return fecha < sumarDias(inicio, DIAS_PRINCIPIANTE);
}

function aplicarNivel(dia, config, fecha) {
  const copia = clonar(dia);
  copia.ajustePrincipiante = enPeriodoPrincipiante(config, fecha);
  if (copia.ajustePrincipiante) {
    for (const e of copia.ejercicios) {
      e.series = Math.max(1, (e.series || 1) - 1);
      e.descanso = (e.descanso || 0) + 30;
    }
  }
  return copia;
}

export function diaParaFecha(rutina, config, fecha) {
  const diaSemana = diaSemanaDe(fecha);
  if (!rutina || !Array.isArray(rutina.dias)) return { dia: null, descanso: true, diaSemana };
  let dia = null;
  if (rutina.plantillaId === '3-dias') {
    const huecos = Array.isArray(rutina.huecos) ? [...rutina.huecos].sort((a, b) => a - b) : diasElegidos(config);
    const i = huecos.indexOf(diaSemana);
    if (i >= 0 && rutina.rotacion) {
      const lista = listaRotacion(rutina.rotacion, config, fecha);
      const id = lista[i % lista.length];
      dia = rutina.dias.find((d) => d.id === id) || null;
    }
  } else {
    dia = rutina.dias.find((d) => d.diaSemana === diaSemana) || null;
  }
  return { dia: dia ? aplicarNivel(dia, config, fecha) : null, descanso: !dia, diaSemana };
}

export function semana(rutina, config, fecha) {
  const lunes = sumarDias(fecha, 1 - diaSemanaDe(fecha));
  return Array.from({ length: 7 }, (_, i) => {
    const f = sumarDias(lunes, i);
    const r = diaParaFecha(rutina, config, f);
    return { fecha: f, diaSemana: r.diaSemana, dia: r.dia, descanso: r.descanso };
  });
}

export function proximoEntreno(rutina, config, fecha) {
  for (let i = 1; i <= 14; i++) {
    const f = sumarDias(fecha, i);
    const r = diaParaFecha(rutina, config, f);
    if (r.dia) return { fecha: f, dia: r.dia };
  }
  return null;
}

export function sustitutosPosibles(ejercicioId, config) {
  const ej = ejercicio(ejercicioId);
  if (!ej) return [];
  return (ej.sustitutos || []).map(ejercicio).filter((s) => s && equipoCumple(s, config));
}

export function cambiarEjercicio(rutina, diaId, indice, nuevoId, config) {
  const nueva = clonar(rutina);
  const dia = buscarDia(nueva, diaId);
  const item = buscarElemento(dia, indice);
  if (!sustitutosPosibles(item.ejercicioId, config).some((s) => s.id === nuevoId)) {
    const ej = ejercicio(item.ejercicioId);
    throw new Error(`"${nuevoId}" no es un sustituto posible de ${ej ? ej.nombre : item.ejercicioId} con tu equipo.`);
  }
  sustituirEnDia(dia, indice, nuevoId, config);
  return nueva;
}

function rangoValido(valor, min, max, nombre) {
  if (!Array.isArray(valor) || valor.length !== 2 || !valor.every((v) => Number.isInteger(v) && v >= min && v <= max)) {
    throw new Error(`${nombre}: indica dos números enteros entre ${min} y ${max}.`);
  }
  if (valor[0] > valor[1]) throw new Error(`${nombre}: el mínimo no puede ser mayor que el máximo.`);
  return [valor[0], valor[1]];
}

function enteroValido(valor, min, max, nombre) {
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new Error(`${nombre}: debe ser un número entero entre ${min} y ${max}.`);
  }
  return valor;
}

function pesoMasCercano(peso, tipo, config) {
  const r = calcularMontaje(peso, tipo, config);
  if (r.exacto) return r.total;
  const abajo = r.porDebajo ? r.porDebajo.total : null;
  const arriba = r.porEncima ? r.porEncima.total : null;
  if (abajo === null) return arriba ?? r.total;
  if (arriba === null) return abajo;
  return peso - abajo <= arriba - peso ? abajo : arriba;
}

export function ajustarEjercicio(rutina, diaId, indice, cambios, config) {
  const nueva = clonar(rutina);
  const dia = buscarDia(nueva, diaId);
  const item = buscarElemento(dia, indice);
  const c = cambios || {};
  const ej = ejercicio(item.ejercicioId);
  const esTiempo = ej ? ej.tipo === 'tiempo' : !!item.segundos;
  const k = indicePareja(dia.ejercicios, indice);
  const pareja = k >= 0 ? dia.ejercicios[k] : null;

  if ('series' in c) {
    const s = enteroValido(c.series, 1, 8, 'Series');
    item.series = s;
    if (pareja) pareja.series = s;
  }
  if ('repeticiones' in c) {
    if (esTiempo) throw new Error('Este ejercicio se mide en segundos, no en repeticiones.');
    item.repeticiones = rangoValido(c.repeticiones, 1, 50, 'Repeticiones');
    item.casiFallo = false;
  }
  if ('segundos' in c) {
    if (!esTiempo) throw new Error('Este ejercicio se mide en repeticiones, no en segundos.');
    item.segundos = rangoValido(c.segundos, 5, 300, 'Segundos');
  }
  if ('descanso' in c) {
    const d = enteroValido(c.descanso, 15, 600, 'Descanso');
    item.descanso = d;
    if (pareja) pareja.descanso = d;
  }
  if ('pesoSugerido' in c) {
    const tipo = tipoMontaje(item);
    if (!tipo) item.pesoSugerido = null;
    else {
      const p = Number(c.pesoSugerido);
      if (!Number.isFinite(p) || p < 0) throw new Error('Peso: indica un número de gramos válido.');
      item.pesoSugerido = pesoMasCercano(p, tipo, config);
    }
  }
  return nueva;
}

export function pesosPosibles(item, config) {
  const tipo = tipoMontaje(item);
  return tipo ? pesosMontables(tipo, config) : [];
}

export function resumenDia(dia) {
  const lista = (dia && dia.ejercicios) || [];
  let series = 0;
  let segundosTotales = 0;
  const montajes = [];
  let cambios = 0;
  let anterior = null;
  const segundaDePareja = new Set();

  lista.forEach((e, i) => {
    series += e.series || 0;
    if (!montajes.includes(e.montaje)) montajes.push(e.montaje);
    if (e.montaje !== 'ninguno') {
      if (anterior !== null && e.montaje !== anterior) cambios++;
      anterior = e.montaje;
    }
    const k = indicePareja(lista, i);
    if (k > i) segundaDePareja.add(k);
    const trabajo = Array.isArray(e.segundos) ? (e.segundos[0] + e.segundos[1]) / 2 : 45;
    const descanso = segundaDePareja.has(i) ? 0 : (e.descanso || 0);
    segundosTotales += (e.series || 0) * (trabajo + descanso);
  });

  const minutos = segundosTotales / 60 + 2 * cambios;
  return {
    ejercicios: lista.length,
    series,
    minutosEstimados: lista.length ? Math.max(5, Math.round(minutos / 5) * 5) : 0,
    montajes,
  };
}
