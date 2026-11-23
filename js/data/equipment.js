/*
 * MicroApp Gym — equipment.js
 * Inventario de discos y calculadora de montaje. Funciones puras (sin DOM ni localStorage).
 *
 * Todos los pesos en GRAMOS ENTEROS. `config` tiene la forma de getConfig() (storage.js).
 * tipo: 'barra' | 'una-mancuerna' | 'par-mancuernas'. En 'par-mancuernas' el peso es POR MANCUERNA.
 *
 * API
 *   INVENTARIO_POR_DEFECTO                    -> { 1250: 8, 2000: 4, 2500: 4 }
 *   pesoVacio(tipo, config)                   -> gramos del montaje sin discos
 *   discosDisponiblesPorLado(tipo, config)    -> { [gramosDisco]: unidades por lado }
 *   combinaciones(tipo, config)               -> [{ discosPorLado, discos: [mayor→menor], total }]
 *                                                una por peso distinto (la de menos discos), total ascendente
 *   pesosMontables(tipo, config)              -> [totales] ascendente
 *   calcularMontaje(objetivo, tipo, config)   -> { exacto, objetivo, total, discosPorLado: [..],
 *                                                  porDebajo: combinación|null, porEncima: combinación|null }
 *   siguientePeso(actual, tipo, config, dir=1)-> total montable siguiente (1) o anterior (-1) | null
 *   cambiosMontaje(discosActuales, discosNuevos) -> { quitar: [..], poner: [..] } (por lado)
 *   textoMontaje(resultado, tipo)             -> 'Barra: 10,75 kg → por lado: 2,5 + 2'
 *   textoCambios(cambios)                     -> 'Quita 2 por lado' | 'Cambia 2,5 por 2 en cada lado' | 'Sin cambios'
 *   kg(gramos)                                -> '10,75 kg'
 */

export const INVENTARIO_POR_DEFECTO = Object.freeze({ 1250: 8, 2000: 4, 2500: 4 });

const PIEZAS_POR_DEFECTO = { mango: 500, conector: 500, tuerca: 125 };
const TUERCAS_POR_DEFECTO = { porMancuerna: 2, barra: 2 };
const MAX_LADO_MANGO_POR_DEFECTO = 7000;

function entero(valor, porDefecto = 0) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : porDefecto;
}

function leerPieza(config, nombre) {
  const piezas = (config && config.piezas) || {};
  return entero(piezas[nombre] ?? PIEZAS_POR_DEFECTO[nombre], PIEZAS_POR_DEFECTO[nombre]);
}

function leerTuercas(config, nombre) {
  const tuercas = (config && config.tuercas) || {};
  return entero(tuercas[nombre] ?? TUERCAS_POR_DEFECTO[nombre], TUERCAS_POR_DEFECTO[nombre]);
}

export function pesoVacio(tipo, config) {
  const mango = leerPieza(config, 'mango');
  const tuerca = leerPieza(config, 'tuerca');
  if (tipo === 'barra') {
    return 2 * mango + leerPieza(config, 'conector') + leerTuercas(config, 'barra') * tuerca;
  }
  return mango + leerTuercas(config, 'porMancuerna') * tuerca;
}

export function discosDisponiblesPorLado(tipo, config) {
  const inventario = (config && config.inventario) || INVENTARIO_POR_DEFECTO;
  const divisor = tipo === 'par-mancuernas' ? 4 : 2;
  const porLado = {};
  for (const [clave, unidades] of Object.entries(inventario)) {
    const gramos = Number(clave);
    const n = Math.floor(entero(unidades) / divisor);
    if (Number.isInteger(gramos) && gramos > 0 && n > 0) porLado[gramos] = n;
  }
  return porLado;
}

function maxPorLado(tipo, config) {
  if (tipo !== 'una-mancuerna') return Infinity;
  const valor = config ? config.maxDiscosPorLadoMango : undefined;
  if (valor === null || valor === undefined) return MAX_LADO_MANGO_POR_DEFECTO;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : MAX_LADO_MANGO_POR_DEFECTO;
}

// ¿La combinación a es mejor que b? Menos discos; a igualdad, discos más pesados.
function esMejor(a, b) {
  if (a.length !== b.length) return a.length < b.length;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export function combinaciones(tipo, config) {
  const disponibles = discosDisponiblesPorLado(tipo, config);
  const tipos = Object.keys(disponibles).map(Number).sort((a, b) => b - a);
  const limite = maxPorLado(tipo, config);
  const vacio = pesoVacio(tipo, config);
  const mejores = new Map(); // discosPorLado -> discos

  const recorrer = (i, suma, discos) => {
    if (i === tipos.length) {
      const actual = mejores.get(suma);
      if (!actual || esMejor(discos, actual)) mejores.set(suma, discos.slice());
      return;
    }
    const g = tipos[i];
    let n = 0;
    for (; n <= disponibles[g] && suma + n * g <= limite; n++) {
      recorrer(i + 1, suma + n * g, discos);
      discos.push(g);
    }
    discos.length -= n; // deshace los discos añadidos de este tipo
  };
  recorrer(0, 0, []);

  // Siempre hay dos lados: el total suma los discos de ambos.
  return [...mejores.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([porLado, discos]) => ({ discosPorLado: porLado, discos, total: vacio + 2 * porLado }));
}

export function pesosMontables(tipo, config) {
  return combinaciones(tipo, config).map((c) => c.total);
}

export function calcularMontaje(pesoObjetivo, tipo, config) {
  const lista = combinaciones(tipo, config);
  const objetivo = Number(pesoObjetivo) || 0;
  const iExacto = lista.findIndex((c) => c.total === objetivo);
  if (iExacto >= 0) {
    const c = lista[iExacto];
    return {
      exacto: true,
      objetivo,
      total: c.total,
      discosPorLado: c.discos.slice(),
      porDebajo: lista[iExacto - 1] || null,
      porEncima: lista[iExacto + 1] || null,
    };
  }
  let porDebajo = null;
  let porEncima = null;
  for (const c of lista) {
    if (c.total < objetivo) porDebajo = c;
    else if (c.total > objetivo && !porEncima) porEncima = c;
  }
  const elegido = porDebajo || lista[0];
  return {
    exacto: false,
    objetivo,
    total: elegido.total,
    discosPorLado: elegido.discos.slice(),
    porDebajo,
    porEncima,
  };
}

export function siguientePeso(pesoActual, tipo, config, direccion = 1) {
  const pesos = pesosMontables(tipo, config);
  const actual = Number(pesoActual) || 0;
  if (direccion >= 0) return pesos.find((p) => p > actual) ?? null;
  for (let i = pesos.length - 1; i >= 0; i--) if (pesos[i] < actual) return pesos[i];
  return null;
}

export function cambiosMontaje(discosActuales = [], discosNuevos = []) {
  const restantes = discosNuevos.slice();
  const quitar = [];
  for (const d of discosActuales) {
    const i = restantes.indexOf(d);
    if (i >= 0) restantes.splice(i, 1);
    else quitar.push(d);
  }
  const desc = (a, b) => b - a;
  return { quitar: quitar.sort(desc), poner: restantes.sort(desc) };
}

function numeroKg(gramos) {
  const g = Math.round(Number(gramos) || 0);
  const signo = g < 0 ? '-' : '';
  const abs = Math.abs(g);
  const enteros = Math.floor(abs / 1000);
  const resto = String(abs % 1000).padStart(3, '0').replace(/0+$/, '');
  return signo + enteros + (resto ? ',' + resto : '');
}

export function kg(gramos) {
  return numeroKg(gramos) + ' kg';
}

const listaDiscos = (discos) => discos.map(numeroKg).join(' + ');

export function textoMontaje(resultado, tipo) {
  const total = numeroKg(resultado.total) + ' kg';
  const cabecera =
    tipo === 'barra' ? `Barra: ${total}`
    : tipo === 'par-mancuernas' ? `2 mancuernas: ${total} cada una`
    : `1 mancuerna: ${total}`;
  const discos = resultado.discosPorLado || [];
  return discos.length ? `${cabecera} → por lado: ${listaDiscos(discos)}` : `${cabecera} → sin discos`;
}

export function textoCambios(cambios) {
  const quitar = (cambios && cambios.quitar) || [];
  const poner = (cambios && cambios.poner) || [];
  if (quitar.length && poner.length) return `Cambia ${listaDiscos(quitar)} por ${listaDiscos(poner)} en cada lado`;
  if (quitar.length) return `Quita ${listaDiscos(quitar)} por lado`;
  if (poner.length) return `Pon ${listaDiscos(poner)} por lado`;
  return 'Sin cambios';
}
