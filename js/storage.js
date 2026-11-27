/*
 * MicroApp Gym — storage.js
 * Guardado local (localStorage) con esquema versionado, migraciones,
 * recuperación de datos corruptos, persistencia y exportar/importar en JSON.
 *
 * ============================================================================
 * CONTRATOS (los demás módulos se adaptan a esto)
 * ============================================================================
 *
 * REGLAS GENERALES
 * - Todos los pesos se guardan en GRAMOS ENTEROS (1,25 kg = 1250). Se muestran
 *   en kg con coma decimal solo en la interfaz.
 * - Fechas de calendario: 'AAAA-MM-DD' (hora local). Instantes: ISO 8601 (toISOString).
 * - Días de la semana: números ISO, 1 = lunes … 7 = domingo.
 * - Montaje: 'barra' | 'mancuernas' | 'ninguno'.
 * - Cada objeto raíz lleva `version` (versión de SU forma, empieza en 1).
 *
 * CLAVES (todas con el prefijo 'mag:'; la versión global del esquema va en 'mag:schema')
 *   CLAVES.config        -> 'mag:config'         Configuración del usuario
 *   CLAVES.rutina        -> 'mag:rutina'         Rutina generada por planner.js
 *   CLAVES.sesiones      -> 'mag:sesiones'       Array de registros de sesión terminados
 *   CLAVES.sesionActiva  -> 'mag:sesionActiva'   Registro de sesión a medias (o null)
 *   CLAVES.meta          -> 'mag:meta'           Datos internos (ver META más abajo)
 *   'mag:respaldoImportacion'  Copia de los datos previos mientras se importa; se borra al
 *                        terminar (y se libera si falta espacio).
 *   'mag:cronometro'     Estado temporal del cronómetro (timer.js): finEn absoluto, modo, etc.
 *                        No está en CLAVES: no se exporta ni se importa y se borra al cerrarlo.
 *   Copias de datos corruptos: 'mag:corrupto:<clave>:<marca de tiempo>' (texto tal cual). Solo se
 *                        guarda la MÁS RECIENTE de cada clave. Si al guardar falta espacio, se
 *                        borran estas copias y el respaldo de importación y se reintenta una vez.
 *   Cada valor se guarda envuelto: { "v": <versión del esquema>, "d": <dato> }.
 *
 * CONFIGURACIÓN  (CLAVES.config)
 * {
 *   version: 1,
 *   configurado: false,              // true tras completar la configuración inicial
 *   diasPorSemana: 4,                // 3 | 4 | 5
 *   diasSemana: [1, 2, 4, 5],        // ISO; longitud = diasPorSemana
 *   nivel: 'intermedio',             // 'principiante' | 'intermedio'
 *   fechaInicio: null,               // 'AAAA-MM-DD' | null (cuenta las 2 semanas del principiante)
 *   equipo: { mancuernas: true, barraDominadas: false, banco: false },
 *   inventario: { '1250': 8, '2000': 4, '2500': 4 }, // gramos del disco -> unidades TOTALES
 *   piezas: { mango: 500, conector: 500, tuerca: 125 },        // gramos por pieza
 *   tuercas: { porMancuerna: 2, barra: 2 },                    // tuercas por montaje
 *   maxDiscosPorLadoMango: 7000,     // gramos de discos que caben por lado de un mango
 *   avisos: {                        // aviso al terminar el descanso (timer.js)
 *     modo: 'ambos',                 // 'ambos' | 'sonido' | 'vibracion'
 *     pitarBloqueado: false          // audio casi silencioso en bucle para pitar con el móvil bloqueado
 *   },
 *   notificaciones: {                // avisos de racha (js/notificaciones.js); se guarda al momento
 *     racha: false                   // true solo si el usuario lo activó Y concedió el permiso
 *   }
 * }
 *   Ojo: las claves de `inventario` son texto en JSON; conviértelas con Number().
 *
 * RUTINA GENERADA  (CLAVES.rutina; la escribe planner.js)
 * {
 *   version: 1,
 *   generadaEn: '2026-11-23T18:00:00.000Z',
 *   plantillaId: '4-dias',           // '3-dias' | '4-dias' | '5-dias'
 *   nivel: 'intermedio',
 *   dias: [
 *     {
 *       id: 'torso-a',               // id estable del día de la plantilla
 *       nombre: 'Torso A',
 *       diaSemana: 1,                // ISO
 *       ejercicios: [                // YA ordenados por montaje (barra -> mancuernas -> ninguno)
 *         {
 *           ejercicioId: 'press-suelo-barra',
 *           montaje: 'barra',
 *           numMancuernas: null,     // 1 | 2 si montaje = 'mancuernas'; null en otro caso
 *           series: 4,
 *           repeticiones: [8, 12],   // [min, max] | null si es de tiempo o casiFallo
 *           segundos: null,          // [min, max] | null (ejercicios de tiempo)
 *           casiFallo: false,
 *           descanso: 120,           // segundos
 *           tempo: null,             // '3-1-1' | null
 *           pausa: null,             // segundos | null
 *           superserieCon: null,     // ejercicioId | null
 *           variante: null,          // id de variante o modificador de la escalera | null
 *           pesoSugerido: 10750      // gramos (total por mancuerna o de la barra) | null
 *         }
 *       ]
 *     }
 *   ]
 * }
 *
 * REGISTRO DE SESIÓN  (elementos de CLAVES.sesiones y valor de CLAVES.sesionActiva)
 * {
 *   version: 1,
 *   id: 's-1763920800000',           // 's-' + Date.now() al empezar
 *   fecha: '2026-11-23',             // día de calendario local
 *   diaId: 'torso-a',
 *   inicio: '2026-11-23T18:00:00.000Z',
 *   fin: null,                       // ISO al terminar
 *   terminada: false,
 *   diaNombre: 'Torso A',
 *   posicion: { ejercicio: 0, serie: 0 }, // siguiente serie por hacer (para retomar)
 *   cronoLibre: null,                // { ejercicio, serie } con el cronómetro libre en marcha | null
 *   ejercicios: [
 *     {
 *       ejercicioId: 'press-suelo-barra',
 *       variante: null,              // variante usada | null
 *       montaje: 'barra', numMancuernas: null,           // copia del plan (workout.js)
 *       repeticiones: [8, 12], segundos: null, casiFallo: false,
 *       descanso: 120, tempo: null, pausa: null, superserieCon: null,
 *       saltado: false,
 *       series: [
 *         { peso: 10750, repeticiones: 10, segundos: null, hecha: true, hechaEn: '2026-11-23T18:05:00.000Z' }
 *         // peso en gramos (por mancuerna o total de la barra; 0 en peso corporal).
 *         // Se crean con los valores planeados y hecha: false.
 *       ]
 *     }
 *   ]
 * }
 *   + progresion (solo en sesiones terminadas desde la Fase 7; los registros antiguos no lo
 *     tienen y se aceptan igual). Lo escribe js/cierre-sesion.js UNA sola vez al archivar, ya
 *     COMPACTA (compactarProgresion, esquema 2): solo lo que hace falta para pintarla después
 *     (resumen de la sesión e Historial con cierre-sesion.htmlProgresion) y para el aviso.
 *   progresion: {
 *     version: 2,
 *     sugerencias: [                 // una por ejercicio, en el orden de la sesión
 *       { ejercicioId: 'press-suelo-mancuernas', accion: 'subir-peso',
 *         texto: 'Sube a 8,25 kg por mancuerna la próxima vez',
 *         peso: 8250 }               // gramos; SOLO si la sugerencia lleva peso (subir/bajar)
 *     ],                             // accion: 'subir-peso' | 'bajar-peso' | 'variante' |
 *                                    //         'subir-tiempo' | 'mantener'
 *     marcas: [                      // solo las que se enseñan (marcasRelevantes, máx. 3, en orden)
 *       { ejercicioId, tipo: 'peso' | 'repeticiones' | 'segundos' | 'volumen', valor,
 *         anterior }                 // `anterior` se omite si era null
 *     ],
 *     racha: { despues: 7, hito: 5 },// entrenamientos seguidos tras la sesión; `hito` se omite si
 *                                    // no hubo. Sin rutina usable: { despues: 0 }
 *     aplicada: true,                // SOLO si hubo cambios y se guardó la rutina nueva (si no, se omite)
 *     deshecha: true                 // SOLO si el usuario pulsó "Deshacer cambios de progresión"
 *   }
 *   No se guardan diaId, indice, cambios, pesoAnterior, paso ni racha.antes: los cambios ya
 *   están aplicados en la rutina (y la rutina anterior, en meta.deshacerProgresion).
 *   Tamaño medido: Torso B con 8 ejercicios, todo subido: progresion 1906 -> 1051 bytes, sesión
 *   6621 -> 5766; 16 sesiones variadas migradas en Chrome: 6360 -> 5263 bytes por sesión (-17 %).
 *   Lo que queda es sobre todo el registro de series (≈4,7 KB; hechaEn ≈ 1 KB).
 *   El formato de la Fase 7 (version 1, con todo) se sigue leyendo y se compacta en la migración al esquema 2 y al importar.
 *   Volumen (workout.resumen): Σ peso × repeticiones de las series hechas; par de
 *   mancuernas ×2; una mancuerna, barra y unilaterales tal cual.
 *   La sesión a medias se guarda en CLAVES.sesionActiva tras CADA serie; al terminar
 *   se añade a CLAVES.sesiones y CLAVES.sesionActiva pasa a null.
 *
 * META  (CLAVES.meta; todo opcional)
 * {
 *   aperturas: 12, ultimaApertura: ISO,           // app.js
 *   resumenPendiente: 's-…',          // sesión terminada fuera de #sesion; su resumen se ve una vez
 *   rachaRecord: 12,                  // récord de racha visto (no baja si se reinterpreta el pasado)
 *   deshacerProgresion: {             // solo la ÚLTIMA progresión aplicada
 *     sesionId: 's-…',
 *     rutina: { ...rutina anterior... },
 *     huella: 'h1a2b3c'               // huella de la rutina que dejó la progresión: solo se puede
 *   }                                 // deshacer si la rutina guardada sigue siendo esa
 * }
 *
 * CACHE STORAGE 'mag-datos'  (no es localStorage: lo lee el service worker, que no puede leer
 *   localStorage; 'activate' no la borra porque no empieza por 'gym-'). Una entrada
 *   './mag-datos/racha.json' que escribe js/notificaciones.js tras arrancar, terminar una sesión
 *   o cambiar ajustes:
 *   { version: 1, activado: boolean, escritoEn: 'AAAA-MM-DD', racha: 7,
 *     proximos: [{ fecha: 'AAAA-MM-DD', diaNombre: 'Pierna A' }],   // días de entrenamiento, 14 días desde hoy
 *     entrenadas: ['AAAA-MM-DD', …],    // fechas con sesión terminada (últimos 21 días)
 *     ultimaNotificada: 'AAAA-MM-DD' | null }  // la escribe también el SW al avisar
 *
 * API
 *   init()                      -> Promise<{ persistente: boolean|null, disponible: boolean }>
 *                                  Migra el esquema y pide navigator.storage.persist().
 *   get(clave, porDefecto)      -> valor guardado o porDefecto (nunca lanza)
 *   set(clave, valor)           -> true si se guardó (nunca lanza). Si falla por CUOTA
 *                                  (QuotaExceededError) lanza en window el evento
 *                                  EVENTO_LLENO ('mag:almacenamiento-lleno', detail: { clave }),
 *                                  que app.js convierte en un aviso visible (exportar datos).
 *   almacenamientoLleno()       -> true si la última escritura de alguna clave falló por cuota
 *   compactarProgresion(p)      -> `progresion` en el formato compacto (acepta el de la Fase 7;
 *                                  idempotente; null si no es un objeto)
 *   marcasRelevantes(marcas, max = 3) -> las marcas que se enseñan y se guardan (cierre-sesion
 *                                  la reexporta)
 *   remove(clave)               -> true si se borró
 *   getConfig()                 -> configuración completa (rellena huecos con valores por defecto)
 *   setConfig(config)           -> true si se guardó
 *   configPorDefecto()          -> copia nueva de la configuración por defecto
 *   exportar()                  -> texto JSON con todos los datos
 *   analizarCopia(texto)        -> comprueba una copia SIN escribir nada:
 *                                  { ok: false, error } | { ok: true, datos, resumen: { config: bool,
 *                                  sesiones: n|null, descartadas: n, diasRutina: n|null,
 *                                  sesionActiva: bool, exportadoEn: ISO|null, schema: n } }
 *                                  (null = la copia no trae esa clave)
 *   importar(texto)             -> { ok: true, resumen } | { ok: false, error: 'mensaje en español' }
 *                                  Valida TODO antes de escribir (config objeto, sesiones array de
 *                                  registros con id, fecha y ejercicios con series; rutina con dias o
 *                                  null; sesionActiva válida o null; meta objeto). Un tipo no válido
 *                                  rechaza la copia sin tocar nada; las sesiones con forma no válida
 *                                  se descartan (resumen.descartadas). Solo se sustituyen las claves
 *                                  que trae la copia: las demás se CONSERVAN.
 *   estaDisponible()            -> false si localStorage no funciona (se usa memoria)
 *   SCHEMA_VERSION, CLAVES, EVENTO_LLENO
 * ============================================================================
 */

export const SCHEMA_VERSION = 2;

const PREFIJO = 'mag:';
const CLAVE_SCHEMA = PREFIJO + 'schema';
const CLAVE_RESPALDO = PREFIJO + 'respaldoImportacion';
export const EVENTO_LLENO = 'mag:almacenamiento-lleno';

export const CLAVES = Object.freeze({
  config: PREFIJO + 'config',
  rutina: PREFIJO + 'rutina',
  sesiones: PREFIJO + 'sesiones',
  sesionActiva: PREFIJO + 'sesionActiva',
  meta: PREFIJO + 'meta',
});

const CONFIG_POR_DEFECTO = Object.freeze({
  version: 1,
  configurado: false,
  diasPorSemana: 4,
  diasSemana: [1, 2, 4, 5],
  nivel: 'intermedio',
  fechaInicio: null,
  equipo: { mancuernas: true, barraDominadas: false, banco: false },
  inventario: { '1250': 8, '2000': 4, '2500': 4 },
  piezas: { mango: 500, conector: 500, tuerca: 125 },
  tuercas: { porMancuerna: 2, barra: 2 },
  maxDiscosPorLadoMango: 7000,
  avisos: { modo: 'ambos', pitarBloqueado: false },
  notificaciones: { racha: false },
});

/*
 * MIGRACIONES: MIGRACIONES[n] convierte los datos del esquema n-1 al esquema n.
 * Reciben y devuelven un objeto { [clave]: dato } con los datos ya desenvueltos.
 * Para cambiar el formato: sube SCHEMA_VERSION y añade aquí la función nueva.
 */
const MIGRACIONES = {
  // 1: datos anteriores a tener esquema (no existían): se dejan tal cual.
  1: (datos) => datos,
  // 2: `progresion` compacta en las sesiones (Fase 8): ~1 KB menos por sesión.
  2: (datos) => compactarSesiones(datos),
};

/* ---------- Progresión compacta (esquema 2) ---------- */

const esObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export function compactarProgresion(p) {
  if (!esObjeto(p)) return null;
  const sugerencias = (Array.isArray(p.sugerencias) ? p.sugerencias : [])
    .filter((s) => esObjeto(s) && s.ejercicioId)
    .map((s) => {
      const c = {
        ejercicioId: String(s.ejercicioId),
        accion: typeof s.accion === 'string' ? s.accion : 'mantener',
        texto: String(s.texto ?? ''),
      };
      if (Number.isFinite(s.peso)) c.peso = s.peso;
      return c;
    });
  const marcas = (Array.isArray(p.marcas) ? p.marcas : [])
    .filter((m) => esObjeto(m) && m.ejercicioId && typeof m.tipo === 'string')
    .map((m) => {
      const c = { ejercicioId: String(m.ejercicioId), tipo: m.tipo, valor: m.valor };
      if (m.anterior !== null && m.anterior !== undefined) c.anterior = m.anterior;
      return c;
    });
  const out = { version: 2, sugerencias, marcas: marcasRelevantes(marcas, MAX_MARCAS) };
  if (esObjeto(p.racha)) {
    out.racha = { despues: Number(p.racha.despues) || 0 };
    if (p.racha.hito) out.racha.hito = p.racha.hito;
  }
  if (p.aplicada === true) out.aplicada = true;
  if (p.deshecha === true) out.deshecha = true;
  return out;
}

/** Máximo de marcas que se enseñan (y se guardan) por sesión. */
const MAX_MARCAS = 3;

const PRIORIDAD = { peso: 0, repeticiones: 1, segundos: 2, volumen: 3 };

/**
 * Las marcas más relevantes (peso > repeticiones > segundos > volumen; a igual tipo, mayor mejora;
 * una por ejercicio primero), en el orden en que se enseñan. Aplicarla dos veces da lo mismo.
 */
export function marcasRelevantes(marcas, max = 3) {
  const lista = (Array.isArray(marcas) ? marcas : []).filter((m) => m && m.ejercicioId)
    .map((m) => ({ m, mejora: m.anterior ? (m.valor - m.anterior) / m.anterior : 1 }))
    .sort((a, b) => (PRIORIDAD[a.m.tipo] ?? 9) - (PRIORIDAD[b.m.tipo] ?? 9) || b.mejora - a.mejora)
    .map((x) => x.m);
  const elegidas = [];
  const vistos = new Set();
  for (const m of lista) {
    if (elegidas.length >= max) break;
    if (!vistos.has(m.ejercicioId)) { elegidas.push(m); vistos.add(m.ejercicioId); }
  }
  for (const m of lista) {
    if (elegidas.length >= max) break;
    if (!elegidas.includes(m)) elegidas.push(m);
  }
  return elegidas;
}

/** Compacta `progresion` en CLAVES.sesiones (y en la sesión activa, por si acaso). Idempotente. */
function compactarSesiones(datos) {
  const conProgresion = (s) => (esObjeto(s) && esObjeto(s.progresion)
    ? { ...s, progresion: compactarProgresion(s.progresion) } : s);
  const out = { ...datos };
  if (Array.isArray(out[CLAVES.sesiones])) out[CLAVES.sesiones] = out[CLAVES.sesiones].map(conProgresion);
  if (esObjeto(out[CLAVES.sesionActiva])) out[CLAVES.sesionActiva] = conProgresion(out[CLAVES.sesionActiva]);
  return out;
}

/* ---------- Almacén: localStorage con respaldo en memoria ---------- */

const memoria = new Map();
let disponible = comprobarDisponible();

function comprobarDisponible() {
  if (typeof window === 'undefined') return false; // Node (pruebas): memoria y sin aviso
  try {
    const prueba = PREFIJO + '__prueba__';
    window.localStorage.setItem(prueba, '1');
    window.localStorage.removeItem(prueba);
    return true;
  } catch (e) {
    // Lleno no es "no disponible": los datos guardados se siguen leyendo de localStorage
    // (con memoria parecería que se han perdido) y cada escritura fallida avisa.
    if (esErrorCuota(e)) {
      console.warn('[storage] localStorage lleno al arrancar.', e);
      return true;
    }
    console.warn('[storage] localStorage no disponible; los datos solo durarán esta sesión.', e);
    return false;
  }
}

function leerCrudo(clave) {
  try {
    return disponible ? window.localStorage.getItem(clave) : (memoria.has(clave) ? memoria.get(clave) : null);
  } catch (e) {
    console.error('[storage] Error al leer', clave, e);
    return null;
  }
}

/* ---------- Almacenamiento lleno ---------- */

const clavesSinEspacio = new Set();

function esErrorCuota(e) {
  if (!e) return false;
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || e.code === 22 || e.code === 1014;
}

function avisarLleno(clave) {
  clavesSinEspacio.add(clave);
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(EVENTO_LLENO, { detail: { clave } }));
    }
  } catch { /* sin aviso: el error ya está en la consola */ }
}

export function almacenamientoLleno() {
  return clavesSinEspacio.size > 0;
}

function escribirCrudo(clave, texto) {
  try {
    if (disponible) window.localStorage.setItem(clave, texto);
    else memoria.set(clave, texto);
    clavesSinEspacio.delete(clave);
    return true;
  } catch (e) {
    let error = e;
    // Falta espacio: primero se libera lo prescindible (un respaldo de importación que se quedó
    // atrás y las copias de datos corruptos) y se reintenta una vez.
    if (esErrorCuota(e) && liberarEspacio(clave)) {
      try {
        window.localStorage.setItem(clave, texto);
        clavesSinEspacio.delete(clave);
        return true;
      } catch (e2) {
        error = e2;
      }
    }
    console.error('[storage] Error al guardar', clave, error);
    if (esErrorCuota(error)) avisarLleno(clave);
    return false;
  }
}

function borrarCrudo(clave) {
  try {
    if (disponible) window.localStorage.removeItem(clave);
    else memoria.delete(clave);
    clavesSinEspacio.delete(clave);
    return true;
  } catch (e) {
    console.error('[storage] Error al borrar', clave, e);
    return false;
  }
}

/** Todas las claves guardadas (localStorage o memoria). Nunca lanza. */
function listarClaves() {
  try {
    if (!disponible) return [...memoria.keys()];
    const ls = window.localStorage;
    const claves = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k !== null) claves.push(k);
    }
    return claves;
  } catch (e) {
    console.error('[storage] No se pueden listar las claves', e);
    return [];
  }
}

const PREFIJO_CORRUPTO = PREFIJO + 'corrupto:';

/** Borra el respaldo de importación y las copias de datos corruptos (salvo `excepto`). */
function liberarEspacio(excepto) {
  const sobrantes = listarClaves().filter((k) => k !== excepto
    && (k === CLAVE_RESPALDO || k.startsWith(PREFIJO_CORRUPTO)));
  for (const k of sobrantes) borrarCrudo(k);
  if (sobrantes.length) console.warn('[storage] Falta espacio: se ha borrado', sobrantes.join(', '));
  return sobrantes.length > 0;
}

/**
 * Guarda una copia del texto corrupto y borra la clave para empezar de cero. Solo se conserva
 * la copia MÁS RECIENTE de cada clave: las anteriores se borran (si no, gastarían cuota sin límite).
 */
function apartarCorrupto(clave, texto) {
  const base = `${PREFIJO_CORRUPTO}${clave.slice(PREFIJO.length)}:`;
  for (const k of listarClaves()) {
    if (k.startsWith(base) && /^\d+$/.test(k.slice(base.length))) borrarCrudo(k);
  }
  const copia = base + Date.now();
  escribirCrudo(copia, String(texto));
  borrarCrudo(clave);
  console.warn(`[storage] Datos corruptos en "${clave}". Copia guardada en "${copia}"; se empieza de cero.`);
}

/* ---------- API básica ---------- */

export function get(clave, porDefecto = null) {
  const texto = leerCrudo(clave);
  if (texto === null) return clonar(porDefecto);
  try {
    const sobre = JSON.parse(texto);
    if (!sobre || typeof sobre !== 'object' || !('v' in sobre) || !('d' in sobre)) {
      throw new Error('Formato de sobre no válido');
    }
    // Un valor nulo guardado equivale a "no hay dato": se devuelve el valor por defecto.
    return sobre.d === null || sobre.d === undefined ? clonar(porDefecto) : sobre.d;
  } catch (e) {
    apartarCorrupto(clave, texto);
    return clonar(porDefecto);
  }
}

export function set(clave, valor) {
  let texto;
  try {
    texto = JSON.stringify({ v: SCHEMA_VERSION, d: valor });
  } catch (e) {
    console.error('[storage] No se puede convertir a JSON', clave, e);
    return false;
  }
  return escribirCrudo(clave, texto);
}

export function remove(clave) {
  return borrarCrudo(clave);
}

export function estaDisponible() {
  return disponible;
}

/* ---------- Configuración ---------- */

export function configPorDefecto() {
  return clonar(CONFIG_POR_DEFECTO);
}

export function getConfig() {
  return normalizarConfig(get(CLAVES.config, null));
}

/** Configuración completa y válida a partir de lo guardado (rellena huecos, corrige tipos). */
function normalizarConfig(guardada) {
  const base = configPorDefecto();
  if (!guardada || typeof guardada !== 'object' || Array.isArray(guardada)) return base;
  const config = {
    ...base,
    ...guardada,
    equipo: { ...base.equipo, ...objeto(guardada.equipo) },
    inventario: { ...base.inventario, ...objeto(guardada.inventario) },
    piezas: { ...base.piezas, ...objeto(guardada.piezas) },
    tuercas: { ...base.tuercas, ...objeto(guardada.tuercas) },
    avisos: { ...base.avisos, ...objeto(guardada.avisos) },
    notificaciones: { ...base.notificaciones, ...objeto(guardada.notificaciones) },
  };
  return validarConfig(config, base);
}

function objeto(valor) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
}

const esEnteroNoNegativo = (n) => Number.isInteger(n) && n >= 0;

/** Sustituye por el valor por defecto cualquier campo con un tipo o rango no válido. */
function validarConfig(config, base) {
  if (![3, 4, 5].includes(config.diasPorSemana)) config.diasPorSemana = base.diasPorSemana;
  if (!['principiante', 'intermedio'].includes(config.nivel)) config.nivel = base.nivel;
  config.configurado = config.configurado === true;
  if (config.fechaInicio !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(config.fechaInicio))) {
    config.fechaInicio = null;
  }

  const dias = Array.isArray(config.diasSemana)
    ? [...new Set(config.diasSemana)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b)
    : [];
  config.diasSemana = dias.length === config.diasPorSemana
    ? dias
    : (config.diasPorSemana === base.diasPorSemana ? [...base.diasSemana] : DIAS_POR_DEFECTO[config.diasPorSemana]);

  if (!['ambos', 'sonido', 'vibracion'].includes(config.avisos.modo)) config.avisos.modo = base.avisos.modo;
  config.avisos.pitarBloqueado = config.avisos.pitarBloqueado === true;
  config.avisos = { modo: config.avisos.modo, pitarBloqueado: config.avisos.pitarBloqueado };
  config.notificaciones = { racha: config.notificaciones.racha === true };

  for (const grupo of ['equipo']) {
    for (const k of Object.keys(config[grupo])) {
      if (typeof config[grupo][k] !== 'boolean') config[grupo][k] = base[grupo][k] ?? false;
    }
  }
  for (const grupo of ['inventario', 'piezas', 'tuercas']) {
    for (const k of Object.keys(config[grupo])) {
      if (!esEnteroNoNegativo(config[grupo][k])) {
        if (k in base[grupo]) config[grupo][k] = base[grupo][k];
        else delete config[grupo][k];
      }
    }
  }
  return config;
}

const DIAS_POR_DEFECTO = { 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 4, 5, 6] };

export function setConfig(config) {
  return set(CLAVES.config, { ...config, version: CONFIG_POR_DEFECTO.version });
}

/* ---------- Esquema y migraciones ---------- */

function leerTodo() {
  const datos = {};
  for (const clave of Object.values(CLAVES)) {
    // Solo se incluyen las claves que existen y tienen un valor (no null).
    if (leerCrudo(clave) === null) continue;
    const valor = get(clave, null);
    if (valor !== null) datos[clave] = valor;
  }
  return datos;
}

function migrar(datos, desde) {
  let actual = datos;
  for (let v = desde + 1; v <= SCHEMA_VERSION; v++) {
    const paso = MIGRACIONES[v];
    if (typeof paso !== 'function') throw new Error(`Falta la migración al esquema ${v}`);
    actual = paso(actual) || actual;
  }
  return actual;
}

function leerVersionSchema() {
  const texto = leerCrudo(CLAVE_SCHEMA);
  if (texto === null) return 0;
  const n = Number(texto);
  if (!Number.isInteger(n) || n < 0) {
    apartarCorrupto(CLAVE_SCHEMA, texto);
    return 0;
  }
  return n;
}

function aplicarMigraciones() {
  const version = leerVersionSchema();
  if (version === SCHEMA_VERSION) return;
  if (version > SCHEMA_VERSION) {
    console.warn(`[storage] Los datos son de una versión más nueva (${version}). No se tocan.`);
    return;
  }
  try {
    const migrados = migrar(leerTodo(), version);
    let todoGuardado = true;
    for (const [clave, valor] of Object.entries(migrados)) {
      if (!set(clave, valor)) todoGuardado = false;
    }
    // Si algo no se pudo guardar, el esquema se queda como estaba y se reintenta en la próxima
    // apertura (las migraciones se pueden repetir sin problema).
    if (todoGuardado) escribirCrudo(CLAVE_SCHEMA, String(SCHEMA_VERSION));
  } catch (e) {
    console.error('[storage] Error al migrar los datos', e);
  }
}

/* ---------- Persistencia ---------- */

async function pedirPersistencia() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (e) {
    console.warn('[storage] No se pudo pedir almacenamiento persistente', e);
    return null;
  }
}

let iniciado = null;

export function init() {
  if (!iniciado) {
    iniciado = (async () => {
      aplicarMigraciones();
      const persistente = await pedirPersistencia();
      return { persistente, disponible };
    })();
  }
  return iniciado;
}

/* ---------- Exportar / importar ---------- */

const MARCA_APP = 'microapp-gym';

export function exportar() {
  return JSON.stringify({
    app: MARCA_APP,
    schema: SCHEMA_VERSION,
    exportadoEn: new Date().toISOString(),
    datos: leerTodo(),
  }, null, 2);
}

const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Forma mínima de un registro de sesión (la misma que workout.validarSesion, sin importarlo). */
function sesionValida(s) {
  if (!esObjeto(s) || typeof s.id !== 'string' || !s.id || !esFecha(s.fecha)) return false;
  if (!Array.isArray(s.ejercicios) || !s.ejercicios.length) return false;
  return s.ejercicios.every((e) => esObjeto(e) && typeof e.ejercicioId === 'string' && e.ejercicioId
    && Array.isArray(e.series) && e.series.length > 0 && e.series.every(esObjeto));
}

function rutinaValida(r) {
  return esObjeto(r) && Array.isArray(r.dias) && r.dias.length > 0
    && r.dias.every((d) => esObjeto(d) && typeof d.id === 'string' && Array.isArray(d.ejercicios));
}

/**
 * Comprueba cada clave de la copia (ya migrada) ANTES de escribir nada.
 * -> { ok: true, datos, descartadas } | { ok: false, error }
 * Las sesiones del historial con forma no válida se descartan (y se cuentan); cualquier otro
 * valor con un tipo no válido rechaza la copia entera.
 */
function validarCopia(entrantes) {
  const datos = {};
  let descartadas = 0;
  if (CLAVES.config in entrantes) {
    const c = entrantes[CLAVES.config];
    if (!esObjeto(c)) return { ok: false, error: 'La configuración de la copia no es válida.' };
    datos[CLAVES.config] = { ...normalizarConfig(c), version: CONFIG_POR_DEFECTO.version };
  }
  if (CLAVES.sesiones in entrantes) {
    const lista = entrantes[CLAVES.sesiones];
    if (!Array.isArray(lista)) return { ok: false, error: 'El historial de la copia no es válido.' };
    const validas = lista.filter(sesionValida);
    descartadas = lista.length - validas.length;
    if (lista.length && !validas.length) {
      return { ok: false, error: 'Ninguna sesión del historial de la copia es válida.' };
    }
    datos[CLAVES.sesiones] = validas;
  }
  if (CLAVES.rutina in entrantes) {
    const r = entrantes[CLAVES.rutina];
    if (r !== null && !rutinaValida(r)) return { ok: false, error: 'La rutina de la copia no es válida.' };
    datos[CLAVES.rutina] = r;
  }
  if (CLAVES.sesionActiva in entrantes) {
    const s = entrantes[CLAVES.sesionActiva];
    if (s !== null && !sesionValida(s)) {
      return { ok: false, error: 'La sesión a medias de la copia no es válida.' };
    }
    datos[CLAVES.sesionActiva] = s;
  }
  if (CLAVES.meta in entrantes) {
    if (!esObjeto(entrantes[CLAVES.meta])) return { ok: false, error: 'Los datos internos de la copia no son válidos.' };
    datos[CLAVES.meta] = entrantes[CLAVES.meta];
  }
  return { ok: true, datos, descartadas };
}

/**
 * Lee y comprueba una copia SIN escribir nada (para enseñarla antes de importar).
 * -> { ok: false, error } | { ok: true, datos, resumen }
 * resumen: { config: boolean, sesiones: n | null (null = no trae historial), descartadas: n,
 *            diasRutina: n | null (null = no trae rutina; 0 = la trae vacía/null),
 *            sesionActiva: boolean, exportadoEn: ISO | null, schema: n }
 */
export function analizarCopia(texto) {
  let paquete;
  try {
    paquete = JSON.parse(texto);
  } catch (e) {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (!esObjeto(paquete) || paquete.app !== MARCA_APP || !esObjeto(paquete.datos)) {
    return { ok: false, error: 'El archivo no es una copia de MicroApp Gym.' };
  }
  const conocidas = new Set(Object.values(CLAVES));
  // Solo se aceptan las claves conocidas.
  const entrantes = {};
  for (const [clave, valor] of Object.entries(paquete.datos)) {
    if (conocidas.has(clave)) entrantes[clave] = valor;
  }
  if (!Object.keys(entrantes).length) {
    return { ok: false, error: 'La copia está vacía: no se ha cambiado nada.' };
  }
  const schema = Number(paquete.schema);
  if (!Number.isInteger(schema) || schema < 0) {
    return { ok: false, error: 'La copia no indica una versión válida.' };
  }
  if (schema > SCHEMA_VERSION) {
    return { ok: false, error: 'La copia es de una versión más nueva de la app. Actualiza la app primero.' };
  }

  let migrados;
  try {
    // compactarSesiones también con copias del esquema actual: es idempotente y deja la
    // progresión compacta aunque la copia venga editada a mano.
    migrados = compactarSesiones(migrar(clonar(entrantes), schema));
  } catch (e) {
    return { ok: false, error: 'No se pudo adaptar la copia a esta versión.' };
  }
  const v = validarCopia(migrados);
  if (!v.ok) return { ok: false, error: `${v.error} No se ha cambiado nada.` };

  const d = v.datos;
  const exportadoEn = typeof paquete.exportadoEn === 'string' && !Number.isNaN(Date.parse(paquete.exportadoEn))
    ? paquete.exportadoEn : null;
  return {
    ok: true,
    datos: d,
    resumen: {
      config: CLAVES.config in d,
      sesiones: CLAVES.sesiones in d ? d[CLAVES.sesiones].length : null,
      descartadas: v.descartadas,
      diasRutina: CLAVES.rutina in d ? (d[CLAVES.rutina] ? d[CLAVES.rutina].dias.length : 0) : null,
      sesionActiva: Boolean(d[CLAVES.sesionActiva]),
      exportadoEn,
      schema,
    },
  };
}

/**
 * Importa una copia. Solo se sustituyen las claves que TRAE la copia; las demás se conservan.
 * No escribe nada si la copia no es válida.
 */
export function importar(texto) {
  const analisis = analizarCopia(texto);
  if (!analisis.ok) return analisis;
  const { datos, resumen } = analisis;

  // Copia de seguridad de los datos actuales por si algo falla a mitad.
  const anterior = exportar();
  escribirCrudo(CLAVE_RESPALDO, anterior);

  const escritas = [];
  for (const [clave, valor] of Object.entries(datos)) {
    escritas.push(clave);
    const ok = valor === null ? remove(clave) : set(clave, valor);
    if (!ok) {
      restaurarRespaldo(anterior, escritas);
      borrarCrudo(CLAVE_RESPALDO);
      return { ok: false, error: 'No hay espacio para guardar la copia. Se han mantenido tus datos.' };
    }
  }
  escribirCrudo(CLAVE_SCHEMA, String(SCHEMA_VERSION));
  borrarCrudo(CLAVE_RESPALDO); // ya no hace falta y duplicaría todos los datos
  return { ok: true, resumen };
}

/** Deja las `claves` como estaban en el texto exportado `texto`. */
function restaurarRespaldo(texto, claves) {
  try {
    const { datos } = JSON.parse(texto);
    for (const clave of claves) {
      if (clave in datos) set(clave, datos[clave]);
      else remove(clave);
    }
  } catch (e) {
    console.error('[storage] No se pudo restaurar el respaldo', e);
  }
}

/* ---------- Utilidades ---------- */

function clonar(valor) {
  if (valor === null || valor === undefined || typeof valor !== 'object') return valor;
  return JSON.parse(JSON.stringify(valor));
}
