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
 *   CLAVES.meta          -> 'mag:meta'           Datos internos (aperturas, etc.; resumenPendiente:
 *                                                id de la sesión terminada fuera de la pantalla de sesión,
 *                                                cuyo resumen se muestra una vez al volver a #sesion)
 *   'mag:cronometro'     Estado temporal del cronómetro (timer.js): finEn absoluto, modo, etc.
 *                        No está en CLAVES: no se exporta ni se importa y se borra al cerrarlo.
 *   Copias de datos corruptos: 'mag:corrupto:<clave>:<marca de tiempo>' (texto tal cual).
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
 *   Volumen (workout.resumen): Σ peso × repeticiones de las series hechas; par de
 *   mancuernas ×2; una mancuerna, barra y unilaterales tal cual.
 *   La sesión a medias se guarda en CLAVES.sesionActiva tras CADA serie; al terminar
 *   se añade a CLAVES.sesiones y CLAVES.sesionActiva pasa a null.
 *
 * API
 *   init()                      -> Promise<{ persistente: boolean|null, disponible: boolean }>
 *                                  Migra el esquema y pide navigator.storage.persist().
 *   get(clave, porDefecto)      -> valor guardado o porDefecto (nunca lanza)
 *   set(clave, valor)           -> true si se guardó (nunca lanza)
 *   remove(clave)               -> true si se borró
 *   getConfig()                 -> configuración completa (rellena huecos con valores por defecto)
 *   setConfig(config)           -> true si se guardó
 *   configPorDefecto()          -> copia nueva de la configuración por defecto
 *   exportar()                  -> texto JSON con todos los datos
 *   importar(texto)             -> { ok: true } | { ok: false, error: 'mensaje en español' }
 *   estaDisponible()            -> false si localStorage no funciona (se usa memoria)
 *   SCHEMA_VERSION, CLAVES
 * ============================================================================
 */

export const SCHEMA_VERSION = 1;

const PREFIJO = 'mag:';
const CLAVE_SCHEMA = PREFIJO + 'schema';

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
});

/*
 * MIGRACIONES: MIGRACIONES[n] convierte los datos del esquema n-1 al esquema n.
 * Reciben y devuelven un objeto { [clave]: dato } con los datos ya desenvueltos.
 * Para cambiar el formato: sube SCHEMA_VERSION y añade aquí la función nueva.
 */
const MIGRACIONES = {
  // 1: datos anteriores a tener esquema (no existían): se dejan tal cual.
  1: (datos) => datos,
};

/* ---------- Almacén: localStorage con respaldo en memoria ---------- */

const memoria = new Map();
let disponible = comprobarDisponible();

function comprobarDisponible() {
  try {
    const prueba = PREFIJO + '__prueba__';
    window.localStorage.setItem(prueba, '1');
    window.localStorage.removeItem(prueba);
    return true;
  } catch (e) {
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

function escribirCrudo(clave, texto) {
  try {
    if (disponible) window.localStorage.setItem(clave, texto);
    else memoria.set(clave, texto);
    return true;
  } catch (e) {
    console.error('[storage] Error al guardar', clave, e);
    return false;
  }
}

function borrarCrudo(clave) {
  try {
    if (disponible) window.localStorage.removeItem(clave);
    else memoria.delete(clave);
    return true;
  } catch (e) {
    console.error('[storage] Error al borrar', clave, e);
    return false;
  }
}

/** Guarda una copia del texto corrupto y borra la clave para empezar de cero. */
function apartarCorrupto(clave, texto) {
  const copia = `${PREFIJO}corrupto:${clave.slice(PREFIJO.length)}:${Date.now()}`;
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
  const guardada = get(CLAVES.config, null);
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
    for (const [clave, valor] of Object.entries(migrados)) set(clave, valor);
    escribirCrudo(CLAVE_SCHEMA, String(SCHEMA_VERSION));
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

export function importar(texto) {
  let paquete;
  try {
    paquete = JSON.parse(texto);
  } catch (e) {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (!paquete || paquete.app !== MARCA_APP || typeof paquete.datos !== 'object'
      || paquete.datos === null || Array.isArray(paquete.datos)) {
    return { ok: false, error: 'El archivo no es una copia de MicroApp Gym.' };
  }
  const clavesValidas = new Set(Object.values(CLAVES));
  if (!Object.keys(paquete.datos).some((k) => clavesValidas.has(k))) {
    return { ok: false, error: 'La copia está vacía: no se ha cambiado nada.' };
  }
  const schema = Number(paquete.schema);
  if (!Number.isInteger(schema) || schema < 0) {
    return { ok: false, error: 'La copia no indica una versión válida.' };
  }
  if (schema > SCHEMA_VERSION) {
    return { ok: false, error: 'La copia es de una versión más nueva de la app. Actualiza la app primero.' };
  }

  // Solo se aceptan las claves conocidas.
  const conocidas = new Set(Object.values(CLAVES));
  const entrantes = {};
  for (const [clave, valor] of Object.entries(paquete.datos)) {
    if (conocidas.has(clave)) entrantes[clave] = valor;
  }

  let migrados;
  try {
    migrados = migrar(entrantes, schema);
  } catch (e) {
    return { ok: false, error: 'No se pudo adaptar la copia a esta versión.' };
  }

  // Copia de seguridad de los datos actuales por si algo falla a mitad.
  const anterior = exportar();
  escribirCrudo(PREFIJO + 'respaldoImportacion', anterior);

  for (const clave of conocidas) {
    const ok = clave in migrados ? set(clave, migrados[clave]) : remove(clave);
    if (!ok) {
      restaurarRespaldo(anterior);
      return { ok: false, error: 'No hay espacio para guardar la copia. Se han mantenido tus datos.' };
    }
  }
  escribirCrudo(CLAVE_SCHEMA, String(SCHEMA_VERSION));
  return { ok: true };
}

function restaurarRespaldo(texto) {
  try {
    const { datos } = JSON.parse(texto);
    for (const clave of Object.values(CLAVES)) {
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
