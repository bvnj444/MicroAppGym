/*
 * MicroApp Gym — animations.js
 * Figuras SVG animadas con CSS (solo transform) y mapa de músculos. Sin librerías.
 *
 * API
 *   htmlFigura(ejercicioId, { tamano: 'mini' | 'grande', animada: true }) -> '<svg ...>'
 *   htmlMapaMusculos(principales, secundarios)                            -> '<svg ...>'
 *   tieneAnimacion(ejercicioId)                                            -> boolean
 *   asegurarEstilos()   inyecta una sola vez <style id="anim-estilos"> con los @keyframes
 *   pausarFiguras(elemento, pausar = true)  pausa o reanuda las figuras dentro de un elemento
 *
 * FORMATO DE LOS DATOS (objeto ANIMACIONES, más abajo)
 *   Cada ejercicio: { vista: 'perfil' | 'frontal', duracion (s), pausa (fracción del ciclo
 *   parada en cada extremo, por defecto 0.1), equipo, muebles, poses: [inicio, (medio), fin] }.
 *   El bucle es inicio -> ... -> fin -> ... -> inicio.
 *
 *   ÁNGULOS: absolutos, en grados, de cada segmento (de la articulación hacia el extremo).
 *   La figura de perfil mira a la DERECHA.
 *       0 = hacia abajo · 90 = hacia delante (derecha) · 180 = hacia arriba · -90 = hacia atrás
 *   Ejemplos: de pie, tronco 180 y piernas 0; muslo 90 = muslo horizontal hacia delante
 *   (sentado); tumbado boca arriba con la cabeza a la izquierda, tronco -90.
 *   Claves de una postura de perfil:
 *     tronco, cabeza, brazo, antebrazo, mano, muslo, pierna, pie   (lado cercano)
 *     brazoL, antebrazoL, manoL, musloL, piernaL, pieL             (lado lejano; por defecto = cercano)
 *     escala: { brazo: 0.7, ... }   acorta un segmento (escorzo), por defecto 1
 *     ancla: ['tobillo' | 'cadera' | 'hombro' | 'rodilla' | 'mano' | ..., x, y]
 *            coloca la figura para que ese punto quede en (x, y). O bien raiz: [x, y] (cadera).
 *   Suelo en y = 140; un tobillo apoyado está en y = 136. Largos: tronco 40, brazo 24,
 *   antebrazo 22 (+3 hasta el agarre), muslo 32, pierna 30, pie 11.
 *   Vista frontal: brazo/antebrazo/muslo/pierna son los del lado derecho de la pantalla
 *   (90 = hacia fuera) y el izquierdo se refleja. Necesita raiz: [x, y].
 *
 *   equipo: { mano, manoL, cadera } con 'barra' | 'mancuerna' (vista de frente, disco) |
 *   'mancuerna-lado' (de perfil, mango perpendicular a la mano) | 'mancuerna-eje' (de perfil,
 *   mango en la dirección de la mano).
 *   muebles: [{ tipo: 'silla' | 'sofa' | 'mesa' | 'escalon' | 'pared', x, ancho, y, ... }]
 */

import { EJERCICIOS, MUSCULOS } from './data/exercises.js';

const EJ = new Map(EJERCICIOS.map((e) => [e.id, e]));
const NOMBRE_MUSCULO = new Map(MUSCULOS.map((m) => [m.id, m.nombre]));

/* ------------------------------------------------------------------ */
/* Constantes de dibujo                                                */
/* ------------------------------------------------------------------ */

const C = {
  cerca: '#C9CED8',
  lejos: '#8A90A0',
  equipo: '#3A3F4B',
  borde: '#5A6070',
};
const ACENTO = 'var(--accent-2, #FF6B4A)';
const LARGO = { tronco: 40, brazo: 24, antebrazo: 22, muslo: 32, pierna: 30 };
const SUELO = 140;
const CUELLO = 12.5;

const GROSOR = {
  grande: { tronco: 13, troncoF: 18, hombros: 8, brazo: 7, antebrazo: 6, muslo: 10.5, pierna: 8, pie: 5, cabeza: 8.5, mano: 3.6, suelo: 1.5 },
  mini: { tronco: 16, troncoF: 22, hombros: 10, brazo: 9.5, antebrazo: 8.5, muslo: 13, pierna: 10.5, pie: 7, cabeza: 9.5, mano: 4.6, suelo: 3 },
};

const VB = {
  grande: [0, 0, 200, 150],
  mini: [25, 0, 150, 150],
};
const VB_ALTO = { grande: [0, -28, 200, 178], mini: [11, -28, 178, 178] };

/*
 * Músculo -> zonas de la figura: [segmento, lado, desde, hasta].
 * Lado: 'f' delante, 'b' detrás, 'c' centro. Distancias desde la articulación de origen
 * (el tronco va de la cadera, 0, al hombro, 40).
 */
const ZONAS = {
  pectoral: [['tronco', 'f', 23, 36]],
  'deltoide-anterior': [['brazo', 'f', -1, 8]],
  'deltoide-lateral': [['brazo', 'c', -2, 7]],
  'deltoide-posterior': [['brazo', 'b', -1, 8]],
  trapecio: [['tronco', 'b', 32, 41]],
  romboides: [['tronco', 'b', 25, 34]],
  dorsal: [['tronco', 'b', 13, 31]],
  biceps: [['brazo', 'f', 8, 21]],
  antebrazo: [['antebrazo', 'c', 2, 17]],
  triceps: [['brazo', 'b', 7, 21]],
  'recto-abdominal': [['tronco', 'f', 4, 22]],
  oblicuos: [['tronco', 'c', 6, 20]],
  lumbar: [['tronco', 'b', 2, 13]],
  'flexores-cadera': [['muslo', 'f', 0, 8], ['tronco', 'f', 0, 3]],
  cuadriceps: [['muslo', 'f', 6, 28]],
  aductores: [['muslo', 'c', 5, 18]],
  'gluteo-mayor': [['muslo', 'b', -3, 9]],
  'gluteo-medio': [['muslo', 'c', -4, 3]],
  isquiotibiales: [['muslo', 'b', 10, 28]],
  gemelo: [['pierna', 'b', 3, 17]],
};

/* ------------------------------------------------------------------ */
/* Datos de las animaciones                                            */
/* ------------------------------------------------------------------ */

/* Tumbado boca arriba, cabeza a la izquierda, rodillas dobladas y pies apoyados. */
const TUMBADO = { tronco: -90, cabeza: -90, muslo: 130, pierna: 38, pie: 90, ancla: ['cadera', 110, 133] };
/* De pie, piernas rectas, tobillo cercano en (100, 136). */
const DE_PIE = { tronco: 180, muslo: 0, pierna: 0, pie: 90, ancla: ['tobillo', 100, 136] };

const ANIMACIONES = {
  /* ============================== PECHO ============================== */
  'press-suelo-barra': {
    vista: 'perfil', duracion: 3.2,
    equipo: { mano: 'barra' },
    poses: [
      // Arriba: brazos estirados sobre los hombros.
      { ...TUMBADO, brazo: 170, antebrazo: 176 },
      // Abajo: el brazo (escorzado, codos a 45°) toca el suelo y la barra queda sobre la parte baja del pecho.
      { ...TUMBADO, brazo: 92, antebrazo: 186, escala: { brazo: 0.72 } },
    ],
  },
  'press-suelo-mancuernas': {
    vista: 'perfil', duracion: 3.2,
    equipo: { mano: 'mancuerna', manoL: 'mancuerna' },
    poses: [
      { ...TUMBADO, brazo: 172, antebrazo: 178 },
      { ...TUMBADO, brazo: 92, antebrazo: 186, escala: { brazo: 0.72 } },
    ],
  },
  'press-squeeze': {
    vista: 'perfil', duracion: 3,
    equipo: { mano: 'mancuerna-lado' },
    poses: [
      { ...TUMBADO, brazo: 170, antebrazo: 176 },
      { ...TUMBADO, brazo: 98, antebrazo: 184, escala: { brazo: 0.9 } },
    ],
  },
  'aperturas-suelo': {
    // Vista desde los pies: el arco de los brazos se ve entero.
    vista: 'frontal', duracion: 3.6, cuello: 6, cabezaDetras: true, sinPiernas: true,
    equipo: { mano: 'mancuerna' },
    poses: [
      { raiz: [100, 131], tronco: 180, brazo: 186, antebrazo: 194, escala: { tronco: 0.2 } },
      { raiz: [100, 131], tronco: 180, brazo: 72, antebrazo: 92, escala: { tronco: 0.2 } },
    ],
  },
  flexiones: {
    // Pies (ancla) y manos (fijar) quietos; el cuerpo bascula sobre las puntas.
    vista: 'perfil', duracion: 3, fijar: 'mano',
    poses: [
      { tronco: 114.9, brazo: 0, antebrazo: 0, mano: 90, muslo: -65.1, pierna: -65.1, pie: 30, ancla: ['punta', 53, 140.5] },
      { tronco: 93.9, brazo: -131.8, antebrazo: 10.3, mano: 90, muslo: -86.1, pierna: -86.1, pie: 30, escala: { brazo: 0.75 }, ancla: ['punta', 53, 140.5] },
    ],
  },
  'flexiones-declinadas': {
    vista: 'perfil', duracion: 3, fijar: 'mano', vbMini: [8, 0, 160, 160],
    muebles: [{ tipo: 'silla', x: 16, ancho: 34, y: 113, respaldo: 'izq' }],
    poses: [
      { tronco: 101.3, brazo: 0, antebrazo: 0, mano: 90, muslo: -78.7, pierna: -78.7, pie: -100, ancla: ['punta', 29.2, 106.1] },
      { tronco: 81, brazo: -167.3, antebrazo: 5.2, mano: 90, muslo: -99, pierna: -99, pie: -100, escala: { brazo: 0.51 }, ancla: ['punta', 29.2, 106.1] },
    ],
  },

  // Estática (una sola postura): V invertida, cadera arriba y cabeza entre los brazos.
  'flexiones-pike': {
    vista: 'perfil', duracion: 3,
    poses: [
      { tronco: 60, cabeza: 40, brazo: 25, antebrazo: 25, mano: 90, muslo: -22, pierna: -22, pie: 60, ancla: ['punta', 62, 140] },
    ],
  },
  // Estática: tumbado bajo la mesa, agarrado al borde con brazos estirados, cuerpo recto y talones en el suelo.
  'remo-invertido-mesa': {
    vista: 'perfil', duracion: 3,
    muebles: [{ tipo: 'mesa', x: 128, ancho: 68, y: 82 }],
    poses: [
      { tronco: 95, cabeza: 95, brazo: 175, antebrazo: 180, mano: 180, muslo: -85, pierna: -85, pie: 175, ancla: ['tobillo', 30, 136] },
    ],
  },

  /* ============================== ESPALDA ============================== */
  'remo-barra': {
    vista: 'perfil', duracion: 2.8,
    equipo: { mano: 'barra' },
    poses: [
      // Bisagra de cadera, torso a unos 45°, espalda recta, barra colgando bajo los hombros.
      { tronco: 132, brazo: 0, antebrazo: 0, muslo: 25, pierna: -12, ancla: ['tobillo', 100, 136] },
      // Codos atrás, barra al ombligo.
      { tronco: 132, brazo: -70, antebrazo: 0, muslo: 25, pierna: -12, ancla: ['tobillo', 100, 136] },
    ],
  },
  'remo-inclinado-mancuernas': {
    vista: 'perfil', duracion: 2.8,
    equipo: { mano: 'mancuerna-lado', manoL: 'mancuerna-lado' },
    poses: [
      { tronco: 132, brazo: 0, antebrazo: 0, muslo: 25, pierna: -12, ancla: ['tobillo', 100, 136] },
      { tronco: 132, brazo: -75, antebrazo: 0, muslo: 25, pierna: -12, ancla: ['tobillo', 100, 136] },
    ],
  },
  'remo-mancuerna-una-mano': {
    // Lado lejano: mano y rodilla en la silla. Lado cercano: pie en el suelo y brazo que rema.
    vista: 'perfil', duracion: 2.8,
    equipo: { mano: 'mancuerna-lado' },
    muebles: [{ tipo: 'silla', x: 72, ancho: 52, y: 114, respaldo: 'izq', altoRespaldo: 26 }],
    poses: [
      { raiz: [80, 78], tronco: 108, brazo: 0, antebrazo: 0, brazoL: 12, antebrazoL: -22, muslo: 20, pierna: -21.4, musloL: 0, piernaL: -50, pieL: 10 },
      { raiz: [80, 78], tronco: 108, brazo: -101, antebrazo: 0, brazoL: 12, antebrazoL: -22, muslo: 20, pierna: -21.4, musloL: 0, piernaL: -50, pieL: 10 },
    ],
  },
  'pullover-suelo': {
    vista: 'perfil', duracion: 3.6, vbMini: [5, -15, 170, 170],
    equipo: { mano: 'mancuerna-eje' },
    poses: [
      { ...TUMBADO, brazo: 172, antebrazo: 182 },
      // Arco por detrás de la cabeza sin doblar más los codos; para antes del suelo.
      { ...TUMBADO, brazo: 258, antebrazo: 268 },
    ],
  },

  /* ============================== HOMBRO ============================== */
  'press-militar-barra': {
    vista: 'perfil', duracion: 3.4, alto: true,
    equipo: { mano: 'barra' },
    poses: [
      { ...DE_PIE, brazo: 25, antebrazo: 175, escala: { brazo: 0.9 } },
      { ...DE_PIE, brazo: 105, antebrazo: 201, escala: { brazo: 0.65 } },
      { ...DE_PIE, brazo: 172, antebrazo: 180 },
    ],
  },
  'press-militar-mancuernas': {
    vista: 'perfil', duracion: 3.4, alto: true,
    equipo: { mano: 'mancuerna', manoL: 'mancuerna' },
    poses: [
      { ...DE_PIE, brazo: 35, antebrazo: 185, escala: { brazo: 0.85 } },
      { ...DE_PIE, brazo: 105, antebrazo: 201, escala: { brazo: 0.65 } },
      { ...DE_PIE, brazo: 174, antebrazo: 182 },
    ],
  },
  'elevaciones-laterales': {
    vista: 'frontal', duracion: 3,
    equipo: { mano: 'mancuerna' },
    poses: [
      { raiz: [100, 74], brazo: 10, antebrazo: 6, muslo: 3, pierna: -1 },
      { raiz: [100, 74], brazo: 86, antebrazo: 80, muslo: 3, pierna: -1 },
    ],
  },
  pajaros: {
    // De frente con el torso inclinado casi paralelo al suelo (tronco escorzado).
    vista: 'frontal', duracion: 3, cuello: 4,
    equipo: { mano: 'mancuerna' },
    poses: [
      { raiz: [100, 74], brazo: 4, antebrazo: 2, muslo: 4, pierna: -2, escala: { tronco: 0.25 } },
      { raiz: [100, 74], brazo: 86, antebrazo: 78, muslo: 4, pierna: -2, escala: { tronco: 0.25 } },
    ],
  },

  /* ============================== PIERNA ============================== */
  'peso-muerto-rumano-barra': {
    vista: 'perfil', duracion: 3.4,
    equipo: { mano: 'barra' },
    poses: [
      { tronco: 180, brazo: 4, antebrazo: 4, muslo: 5, pierna: -5, ancla: ['tobillo', 100, 136] },
      // Bisagra: cadera atrás, espalda recta, rodillas apenas dobladas, barra pegada a la pierna.
      { tronco: 105, brazo: -16, antebrazo: -16, muslo: 28, pierna: -6, ancla: ['tobillo', 100, 136] },
    ],
  },
  'peso-muerto-una-pierna': {
    vista: 'perfil', duracion: 3.6,
    equipo: { mano: 'mancuerna', manoL: 'mancuerna' },
    poses: [
      { tronco: 180, brazo: 2, antebrazo: 2, muslo: 3, pierna: -3, musloL: -10, piernaL: 5, pieL: 70, ancla: ['tobillo', 100, 136] },
      // La pierna libre sube estirada en línea con el tronco.
      { tronco: 98, brazo: 0, antebrazo: 0, muslo: 18, pierna: -8, musloL: -82, piernaL: -82, pieL: 0, ancla: ['tobillo', 100, 136] },
    ],
  },
  'sentadilla-goblet': {
    vista: 'perfil', duracion: 3.4,
    equipo: { mano: 'mancuerna-eje' },
    poses: [
      { tronco: 180, brazo: 15, antebrazo: 170, muslo: 0, pierna: 0, ancla: ['tobillo', 100, 136] },
      // Muslo algo por debajo de la paralela, talones apoyados, tronco erguido (~30°).
      { tronco: 150, brazo: 10, antebrazo: 165, muslo: 92, pierna: -30, ancla: ['tobillo', 100, 136] },
    ],
  },
  'zancadas-atras': {
    // Cercana: pierna de delante (fija). Lejana: la que da el paso atrás.
    vista: 'perfil', duracion: 3.4,
    equipo: { mano: 'mancuerna-lado', manoL: 'mancuerna-lado' },
    poses: [
      { tronco: 180, brazo: 0, antebrazo: 0, muslo: 0, pierna: 0, musloL: 0, piernaL: 0, pieL: 90, ancla: ['tobillo', 110, 136] },
      { tronco: 176, brazo: 0, antebrazo: 0, muslo: 40, pierna: -8, musloL: -20, piernaL: -60, pieL: 30, ancla: ['tobillo', 110, 136] },
      { tronco: 170, brazo: 0, antebrazo: 0, muslo: 85, pierna: -10, musloL: -47, piernaL: -95, pieL: 10, ancla: ['tobillo', 110, 136] },
    ],
  },
  'sentadilla-bulgara': {
    // Cercana: pierna de delante. Lejana: empeine sobre la silla.
    vista: 'perfil', duracion: 3.4, fijar: 'tobilloL', vbMini: [10, 0, 150, 150],
    equipo: { mano: 'mancuerna-lado', manoL: 'mancuerna-lado' },
    muebles: [{ tipo: 'silla', x: 22, ancho: 34, y: 116, respaldo: 'izq' }],
    poses: [
      { tronco: 175, brazo: 0, antebrazo: 0, muslo: 15, pierna: -10, musloL: -54, piernaL: -54, pieL: -95, ancla: ['tobillo', 105, 136] },
      { tronco: 165, brazo: 0, antebrazo: 0, muslo: 80, pierna: -8, musloL: -7, piernaL: -133, pieL: -95, ancla: ['tobillo', 105, 136] },
    ],
  },
  'hip-thrust-barra': {
    vista: 'perfil', duracion: 3.2, vbMini: [20, 20, 140, 140],
    equipo: { cadera: 'barra' },
    muebles: [{ tipo: 'sofa', x: 0, ancho: 60, y: 106, respaldo: 'izq' }],
    poses: [
      { tronco: -129.4, cabeza: -160, brazo: 101, antebrazo: 24.9, muslo: 123.9, pierna: 30.1, pie: 90, ancla: ['tobillo', 129.6, 136] },
      // Arriba: tronco paralelo al suelo, rodillas a 90°, barbilla metida.
      { tronco: -94.3, cabeza: -134, brazo: 121.4, antebrazo: 75.6, muslo: 90, pierna: 0, pie: 90, ancla: ['tobillo', 129.6, 136] },
    ],
  },
  'hip-thrust-una-pierna': {
    vista: 'perfil', duracion: 3.2, vbMini: [20, 20, 140, 140],
    equipo: { cadera: 'mancuerna' },
    muebles: [{ tipo: 'sofa', x: 0, ancho: 60, y: 106, respaldo: 'izq' }],
    poses: [
      { tronco: -129.4, cabeza: -160, brazo: 101, antebrazo: 24.9, muslo: 123.9, pierna: 30.1, pie: 90, musloL: 165, piernaL: 80, pieL: 170, ancla: ['tobillo', 129.6, 136] },
      { tronco: -94.3, cabeza: -134, brazo: 121.4, antebrazo: 75.6, muslo: 90, pierna: 0, pie: 90, musloL: 150, piernaL: 60, pieL: 150, ancla: ['tobillo', 129.6, 136] },
    ],
  },
  'puente-gluteo': {
    vista: 'perfil', duracion: 3,
    poses: [
      { tronco: -90, cabeza: -90, brazo: 90, antebrazo: 90, muslo: 140, pierna: 23.5, pie: 90, raiz: [100, 133] },
      { tronco: -68.4, cabeza: -90, brazo: 90, antebrazo: 90, muslo: 111.6, pierna: 10.8, pie: 90, raiz: [97.2, 118.3] },
    ],
  },
  'puente-gluteo-una-pierna': {
    // Cercana: pierna que trabaja. Lejana: estirada en línea con el muslo.
    vista: 'perfil', duracion: 3,
    poses: [
      { tronco: -90, cabeza: -90, brazo: 90, antebrazo: 90, muslo: 140, pierna: 23.5, pie: 90, musloL: 140, piernaL: 140, pieL: 230, raiz: [100, 133] },
      { tronco: -68.4, cabeza: -90, brazo: 90, antebrazo: 90, muslo: 111.6, pierna: 10.8, pie: 90, musloL: 111.6, piernaL: 111.6, pieL: 201.6, raiz: [97.2, 118.3] },
    ],
  },
  'elevacion-talones-una-pierna': {
    // Punta en el escalón, talón en el aire; mano en la pared; la otra pierna doblada atrás.
    vista: 'perfil', duracion: 2.6, pausa: 0.14,
    muebles: [{ tipo: 'escalon', x: 99, ancho: 36, alto: 6 }, { tipo: 'pared', x: 146 }],
    poses: [
      { tronco: 180, brazo: 75, antebrazo: 88, brazoL: 5, antebrazoL: 5, muslo: 0, pierna: 0, pie: 115, musloL: 5, piernaL: -75, pieL: 15, ancla: ['tobillo', 93.75, 135.4] },
      { tronco: 180, brazo: 75, antebrazo: 88, brazoL: 5, antebrazoL: 5, muslo: 0, pierna: 0, pie: 55, musloL: 5, piernaL: -75, pieL: 15, ancla: ['tobillo', 94.5, 127.4] },
    ],
  },

  /* ============================== BRAZOS ============================== */
  'curl-barra': {
    vista: 'perfil', duracion: 2.8,
    equipo: { mano: 'barra' },
    poses: [
      { ...DE_PIE, brazo: 5, antebrazo: 8 },
      { ...DE_PIE, brazo: 8, antebrazo: 160 },
    ],
  },
  'curl-martillo': {
    vista: 'perfil', duracion: 2.8,
    equipo: { mano: 'mancuerna-lado', manoL: 'mancuerna-lado' },
    poses: [
      { ...DE_PIE, brazo: 4, antebrazo: 6 },
      { ...DE_PIE, brazo: 8, antebrazo: 158 },
    ],
  },
  'curl-concentrado': {
    vista: 'perfil', duracion: 2.8,
    equipo: { mano: 'mancuerna' },
    muebles: [{ tipo: 'silla', x: 62, ancho: 34, y: 112, respaldo: 'izq' }],
    poses: [
      { raiz: [85, 106], tronco: 140, cabeza: 125, brazo: 0, antebrazo: 0, brazoL: 10, antebrazoL: 60, muslo: 90, pierna: 0, musloL: 82, piernaL: 5 },
      { raiz: [85, 106], tronco: 140, cabeza: 125, brazo: 0, antebrazo: 165, brazoL: 10, antebrazoL: 60, muslo: 90, pierna: 0, musloL: 82, piernaL: 5 },
    ],
  },
  'press-frances-suelo': {
    vista: 'perfil', duracion: 3.2,
    equipo: { mano: 'barra' },
    poses: [
      // Brazos algo inclinados hacia la cabeza; solo se mueve el codo.
      { ...TUMBADO, brazo: 198, antebrazo: 198 },
      { ...TUMBADO, brazo: 198, antebrazo: 298 },
    ],
  },
  'extension-triceps-cabeza': {
    vista: 'perfil', duracion: 3.2, alto: true, cabezaDelante: true,
    equipo: { mano: 'mancuerna-eje' },
    poses: [
      { ...DE_PIE, brazo: 174, antebrazo: 180 },
      // Codos al techo, mancuerna por detrás de la cabeza.
      { ...DE_PIE, brazo: 172, antebrazo: -45 },
    ],
  },
  'fondos-silla': {
    vista: 'perfil', duracion: 3,
    muebles: [{ tipo: 'silla', x: 35, ancho: 37, y: 97, respaldo: 'izq' }],
    poses: [
      { tronco: 180, brazo: -22, antebrazo: -22, mano: 90, muslo: 70, pierna: 0, ancla: ['tobillo', 110.1, 135.9] },
      // Codos a unos 90°, espalda cerca de la silla.
      { tronco: 180, brazo: -84, antebrazo: 4, mano: 90, muslo: 99.7, pierna: -26.3, ancla: ['tobillo', 110.1, 135.9] },
    ],
  },

  /* ============================== CORE ============================== */
  plancha: {
    // Estática: solo una respiración sutil.
    vista: 'perfil', duracion: 4, pausa: 0.2,
    poses: [
      { tronco: 100.7, cabeza: 100.7, brazo: 0, antebrazo: 90, mano: 90, muslo: -79.3, pierna: -79.3, pie: 40, ancla: ['hombro', 140, 112] },
      { tronco: 101.9, cabeza: 101.9, brazo: 0, antebrazo: 90, mano: 90, muslo: -79.3, pierna: -79.3, pie: 40, ancla: ['hombro', 140, 112] },
    ],
  },
  'elevacion-piernas': {
    vista: 'perfil', duracion: 3.2,
    poses: [
      { tronco: -90, cabeza: -90, brazo: 90, antebrazo: 90, muslo: 97, pierna: 97, pie: 187, raiz: [110, 133] },
      { tronco: -90, cabeza: -90, brazo: 90, antebrazo: 90, muslo: 180, pierna: 180, pie: 270, raiz: [110, 133] },
    ],
  },
  crunch: {
    vista: 'perfil', duracion: 2.8,
    poses: [
      { ...TUMBADO, brazo: 120, antebrazo: -60 },
      { ...TUMBADO, tronco: -110, cabeza: -135, brazo: 100, antebrazo: -80 },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const f = (n) => {
  const r = Math.round(n * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
};

const esc = (t) => String(t)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function norm(a) {
  let r = ((((a + 180) % 360) + 360) % 360) - 180;
  if (r === -180) r = 180;
  return r;
}

/* Matriz [a b c d e f] de translate(tx, ty) rotate(deg), como en CSS. */
function mat(tx, ty, deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, tx, ty];
}
function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function aplicar(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function prefiereMenosMovimiento() {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Posturas -> nodos (transformaciones de cada articulación)           */
/* ------------------------------------------------------------------ */

function completar(p) {
  const q = { ...p };
  q.tronco = p.tronco ?? 180;
  q.cabeza = p.cabeza ?? q.tronco;
  q.brazo = p.brazo ?? 3;
  q.antebrazo = p.antebrazo ?? q.brazo;
  q.mano = p.mano ?? q.antebrazo;
  q.muslo = p.muslo ?? 0;
  q.pierna = p.pierna ?? q.muslo;
  q.pie = p.pie ?? 90;
  q.brazoL = p.brazoL ?? q.brazo;
  q.antebrazoL = p.antebrazoL ?? q.antebrazo;
  q.manoL = p.manoL ?? (p.antebrazoL !== undefined ? q.antebrazoL : q.mano);
  q.musloL = p.musloL ?? q.muslo;
  q.piernaL = p.piernaL ?? q.pierna;
  q.pieL = p.pieL ?? q.pie;
  const e = p.escala || {};
  q.e = {
    tronco: e.tronco ?? 1,
    brazo: e.brazo ?? 1,
    antebrazo: e.antebrazo ?? 1,
    muslo: e.muslo ?? 1,
    pierna: e.pierna ?? 1,
  };
  q.e.brazoL = e.brazoL ?? q.e.brazo;
  q.e.antebrazoL = e.antebrazoL ?? q.e.antebrazo;
  q.e.musloL = e.musloL ?? q.e.muslo;
  q.e.piernaL = e.piernaL ?? q.e.pierna;
  return q;
}

const J = (x, y, r) => ({ t: 'j', v: [x, y, norm(r)] });
const S = (s) => ({ t: 's', v: [s] });

function nodosPerfil(q) {
  const e = q.e;
  const Lt = LARGO.tronco * e.tronco;
  return {
    raiz: { t: 'j', v: [0, 0, 0] },
    tronco: J(0, 0, -q.tronco),
    e_tronco: S(e.tronco),
    cabeza: J(0, Lt, -(q.cabeza - q.tronco)),
    brazo: J(0, Lt, -(q.brazo - q.tronco)),
    e_brazo: S(e.brazo),
    antebrazo: J(0, LARGO.brazo * e.brazo, -(q.antebrazo - q.brazo)),
    e_antebrazo: S(e.antebrazo),
    mano: J(0, LARGO.antebrazo * e.antebrazo, -(q.mano - q.antebrazo)),
    brazoL: J(1.5, Lt, -(q.brazoL - q.tronco)),
    e_brazoL: S(e.brazoL),
    antebrazoL: J(0, LARGO.brazo * e.brazoL, -(q.antebrazoL - q.brazoL)),
    e_antebrazoL: S(e.antebrazoL),
    manoL: J(0, LARGO.antebrazo * e.antebrazoL, -(q.manoL - q.antebrazoL)),
    muslo: J(0, 0, -q.muslo),
    e_muslo: S(e.muslo),
    pierna: J(0, LARGO.muslo * e.muslo, -(q.pierna - q.muslo)),
    e_pierna: S(e.pierna),
    pie: J(0, LARGO.pierna * e.pierna, -(q.pie - q.pierna)),
    musloL: J(-2, 0, -q.musloL),
    e_musloL: S(e.musloL),
    piernaL: J(0, LARGO.muslo * e.musloL, -(q.piernaL - q.musloL)),
    e_piernaL: S(e.piernaL),
    pieL: J(0, LARGO.pierna * e.piernaL, -(q.pieL - q.piernaL)),
  };
}

function nodosFrontal(q) {
  const t = q.tronco;
  const Lt = LARGO.tronco * q.e.tronco;
  const b = q.brazo;
  const a = q.antebrazo;
  const m = q.mano;
  return {
    raiz: { t: 'j', v: [0, 0, 0] },
    tronco: J(0, 0, -t),
    e_tronco: S(q.e.tronco),
    cabeza: J(0, Lt, -(q.cabeza - t)),
    brazoD: J(-13, Lt - 3, -(b - t)),
    antebrazoD: J(0, LARGO.brazo, -(a - b)),
    manoD: J(0, LARGO.antebrazo, -(m - a)),
    brazoI: J(13, Lt - 3, -(-b - t)),
    antebrazoI: J(0, LARGO.brazo, a - b),
    manoI: J(0, LARGO.antebrazo, m - a),
    musloD: J(6.5, 0, -q.muslo),
    piernaD: J(0, LARGO.muslo, -(q.pierna - q.muslo)),
    musloI: J(-6.5, 0, q.muslo),
    piernaI: J(0, LARGO.muslo, q.pierna - q.muslo),
  };
}

/* Puntos para el ancla: cadena de nodos y punto local. */
const PUNTOS = {
  cadera: [[], 0, 0],
  hombro: [['tronco', 'brazo'], 0, 0],
  codo: [['tronco', 'brazo', 'antebrazo'], 0, 0],
  mano: [['tronco', 'brazo', 'antebrazo', 'mano'], 0, 3],
  cabeza: [['tronco', 'cabeza'], 0, CUELLO],
  rodilla: [['muslo', 'pierna'], 0, 0],
  tobillo: [['muslo', 'pierna', 'pie'], 0, 0],
  punta: [['muslo', 'pierna', 'pie'], 0, 11],
  hombroL: [['tronco', 'brazoL'], 0, 0],
  manoL: [['tronco', 'brazoL', 'antebrazoL', 'manoL'], 0, 3],
  rodillaL: [['musloL', 'piernaL'], 0, 0],
  tobilloL: [['musloL', 'piernaL', 'pieL'], 0, 0],
};

function punto(nodos, nombre) {
  const [cadena, x, y] = PUNTOS[nombre] || PUNTOS.cadera;
  let m = [1, 0, 0, 1, 0, 0];
  for (const n of cadena) m = mul(m, mat(...nodos[n].v));
  return aplicar(m, x, y);
}

function nodosDePose(def, p) {
  const q = completar(p);
  const nodos = def.vista === 'frontal' ? nodosFrontal(q) : nodosPerfil(q);
  let rx = 100;
  let ry = 74;
  if (Array.isArray(p.raiz)) {
    [rx, ry] = p.raiz;
  } else if (Array.isArray(p.ancla) && def.vista !== 'frontal') {
    const [nombre, x, y] = p.ancla;
    const [px, py] = punto(nodos, nombre);
    rx = x - px;
    ry = y - py;
  }
  nodos.raiz = { t: 'j', v: [rx, ry, 0] };
  return nodos;
}

/* ------------------------------------------------------------------ */
/* Compilación: valores por postura, postura intermedia y @keyframes    */
/* ------------------------------------------------------------------ */

function transformDe(nodo, v) {
  return nodo.t === 's'
    ? `scale(1,${f(v[0])})`
    : `translate(${f(v[0])}px,${f(v[1])}px) rotate(${f(v[2])}deg)`;
}

const compilados = new Map();

function definicion(id) {
  if (ANIMACIONES[id]) return ANIMACIONES[id];
  return defEstatica(EJ.get(id));
}

function defEstatica(ej) {
  const equipo = {};
  if (ej && ej.equipo === 'barra') {
    equipo.mano = 'barra';
  } else if (ej && ej.equipo === 'mancuernas') {
    equipo.mano = 'mancuerna';
    if (ej.numMancuernas === 2) equipo.manoL = 'mancuerna';
  }
  const muebles = [];
  if (ej && ej.apoyo === 'silla') muebles.push({ tipo: 'silla', x: 36, ancho: 34, y: 108, respaldo: 'izq' });
  else if (ej && ej.apoyo === 'sofa') muebles.push({ tipo: 'sofa', x: 8, ancho: 56, y: 106, respaldo: 'izq' });
  else if (ej && ej.apoyo === 'mesa') muebles.push({ tipo: 'mesa', x: 128, ancho: 64, y: 84 });
  return {
    vista: 'perfil',
    duracion: 3,
    estatica: true,
    equipo,
    muebles,
    poses: [{ ...DE_PIE, brazo: 4, antebrazo: 6 }],
  };
}

/* Mezcla dos posturas interpolando ángulos y escalas (no matrices), para que
 * el ancla se recalcule en cada postura intermedia y el apoyo no se deslice. */
function mezclarPoses(a, b, u) {
  const qa = completar(a);
  const qb = completar(b);
  const p = { ...a };
  for (const k of Object.keys(qa)) {
    if (typeof qa[k] === 'number' && typeof qb[k] === 'number') p[k] = qa[k] + (qb[k] - qa[k]) * u;
  }
  p.escala = {};
  for (const k of Object.keys(qa.e)) p.escala[k] = qa.e[k] + (qb.e[k] - qa.e[k]) * u;
  if (Array.isArray(a.raiz) && Array.isArray(b.raiz)) {
    p.raiz = [0, 1].map((i) => a.raiz[i] + (b.raiz[i] - a.raiz[i]) * u);
  } else if (Array.isArray(a.ancla) && Array.isArray(b.ancla) && a.ancla[0] === b.ancla[0]) {
    p.ancla = [a.ancla[0], a.ancla[1] + (b.ancla[1] - a.ancla[1]) * u, a.ancla[2] + (b.ancla[2] - a.ancla[2]) * u];
  } else {
    return null; // anclas distintas: se queda la interpolación lineal de siempre
  }
  return p;
}

/* Segundo apoyo fijo (def.fijar = 'mano' | 'manoL' | 'tobillo' | 'tobilloL'):
 * el ancla sujeta un punto y este paso dobla el brazo o la pierna (cinemática
 * inversa de dos segmentos) para que la mano o el pie se quede donde estaba en
 * la primera postura. Así, en flexiones, manos y pies no se deslizan. */
const dirAng = (a) => [Math.sin(a * Math.PI / 180), Math.cos(a * Math.PI / 180)];
const angDe = (dx, dy) => Math.atan2(dx, dy) * 180 / Math.PI;

function puntoMundo(nodos, nombre) {
  const [x, y] = punto(nodos, nombre);
  return [x + nodos.raiz.v[0], y + nodos.raiz.v[1]];
}

function fijarApoyo(def, p, objetivo) {
  const fijar = def.fijar;
  if (!fijar || !objetivo || def.vista === 'frontal') return p;
  const q = completar(p);
  const nodos = nodosDePose(def, p);
  const L = fijar.endsWith('L') ? 'L' : '';
  const brazo = fijar.startsWith('mano');
  const k1 = (brazo ? 'brazo' : 'muslo') + L;
  const k2 = (brazo ? 'antebrazo' : 'pierna') + L;
  const l1 = (brazo ? LARGO.brazo : LARGO.muslo) * q.e[k1];
  const l2 = (brazo ? LARGO.antebrazo : LARGO.pierna) * q.e[k2];
  let origen;
  let meta = objetivo;
  if (brazo) {
    origen = puntoMundo(nodos, 'hombro' + L);
    const d = dirAng(q['mano' + L]);
    meta = [objetivo[0] - 3 * d[0], objetivo[1] - 3 * d[1]];
  } else {
    origen = [nodos.raiz.v[0] + (L ? -2 : 0), nodos.raiz.v[1]];
  }
  const dx = meta[0] - origen[0];
  const dy = meta[1] - origen[1];
  const dist = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
  const base = angDe(dx, dy);
  const alfa = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)))) * 180 / Math.PI;
  const dif = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
  const a1 = [base + alfa, base - alfa].sort((a, b) => dif(a, q[k1]) - dif(b, q[k1]))[0];
  const d1 = dirAng(a1);
  const codo = [origen[0] + l1 * d1[0], origen[1] + l1 * d1[1]];
  const a2 = angDe(meta[0] - codo[0], meta[1] - codo[1]);
  const r = { ...p, [k1]: a1, [k2]: a2 };
  // Mantener la mano o el pie con su ángulo (por defecto copiarían el segmento anterior).
  if (brazo) r['mano' + L] = q['mano' + L];
  else r['pie' + L] = q['pie' + L];
  return r;
}

const suave = (s) => s * s * (3 - 2 * s); // ease-in-out horneado en los pasos intermedios
const SUBPASOS = 4;

/* ¿Se desliza el apoyo a mitad del tramo? Compara la mano/pie/cadera ancla en
 * la postura real a mitad de camino con la que daría la interpolación lineal. */
function tramoNecesitaPasos(def, a, b, na, nb, ajustar) {
  if (def.vista === 'frontal' || !Array.isArray(a.ancla)) return false;
  const m = mezclarPoses(a, b, 0.5);
  if (!m) return false;
  const real = nodosDePose(def, ajustar(m));
  const deriva = Object.keys(real).some((k) => real[k].t === 'j' && na[k].v.some((x, i) => {
    let y = nb[k].v[i];
    if (i === 2) { while (y - x > 180) y -= 360; while (y - x < -180) y += 360; }
    let r = real[k].v[i];
    if (i === 2) { while (r - x > 180) r -= 360; while (r - x < -180) r += 360; }
    return Math.abs((x + y) / 2 - r) > (i === 2 ? 3 : 1);
  }));
  return deriva;
}

function compilar(id) {
  if (compilados.has(id)) return compilados.get(id);
  const def = definicion(id);
  const objetivo = def.fijar ? puntoMundo(nodosDePose(def, def.poses[0]), def.fijar) : null;
  const ajustar = (p) => fijarApoyo(def, p, objetivo);
  const poses = def.poses.map(ajustar);
  const n = poses.length;
  const base = poses.map((p) => nodosDePose(def, p));
  const animada = n > 1 && !def.estatica;

  // Fotogramas: [fracción, nodos, curva hasta el siguiente]
  const fotos = [];
  if (animada) {
    const h = def.pausa ?? 0.1;
    const seq = [];
    for (let i = 0; i < n; i++) seq.push(i);
    for (let i = n - 2; i >= 0; i--) seq.push(i);
    const dt = (1 - 2 * h) / (seq.length - 1);
    let t = 0;
    fotos.push([0, base[0], 'ease-in-out']);
    t = h;
    fotos.push([t, base[0], 'ease-in-out']);
    for (let k = 1; k < seq.length; k++) {
      const ia = seq[k - 1];
      const ib = seq[k];
      if (tramoNecesitaPasos(def, poses[ia], poses[ib], base[ia], base[ib], ajustar)) {
        fotos[fotos.length - 1][2] = 'linear';
        for (let j = 1; j < SUBPASOS; j++) {
          const s = j / SUBPASOS;
          fotos.push([t + dt * s, nodosDePose(def, ajustar(mezclarPoses(poses[ia], poses[ib], suave(s)))), 'linear']);
        }
      }
      t += dt;
      fotos.push([t, base[ib], 'ease-in-out']);
      if (k === n - 1) {
        t += h;
        fotos.push([t, base[ib], 'ease-in-out']);
      }
    }
    fotos[fotos.length - 1][0] = 1;
  }

  // Postura intermedia (movimiento reducido y figuras quietas)
  let medio;
  if (n === 2) {
    const m = mezclarPoses(poses[0], poses[1], 0.5);
    medio = m ? nodosDePose(def, ajustar(m)) : null;
  } else {
    medio = base[Math.floor(n / 2)];
  }

  const nodos = {};
  for (const nombre of Object.keys(base[0])) {
    const tipo = base[0][nombre].t;
    const vals = base.map((ns) => ns[nombre].v.slice());
    const frames = fotos.map(([t, ns, curva]) => [t, ns[nombre].v.slice(), curva]);
    if (tipo === 'j') {
      for (let i = 1; i < vals.length; i++) {
        while (vals[i][2] - vals[i - 1][2] > 180) vals[i][2] -= 360;
        while (vals[i][2] - vals[i - 1][2] < -180) vals[i][2] += 360;
      }
      for (let i = 1; i < frames.length; i++) {
        while (frames[i][1][2] - frames[i - 1][1][2] > 180) frames[i][1][2] -= 360;
        while (frames[i][1][2] - frames[i - 1][1][2] < -180) frames[i][1][2] += 360;
      }
    }
    const variable = vals.some((v) => v.some((x, i) => Math.abs(x - vals[0][i]) > 0.01));
    const vMedio = medio
      ? medio[nombre].v.slice()
      : vals[0].map((x, i) => (x + vals[1][i]) / 2);
    nodos[nombre] = { t: tipo, vals, frames, variable, medio: vMedio };
  }
  const c = { id, def, nodos, n, animada };
  compilados.set(id, c);
  return c;
}

function keyframesDe(c) {
  if (!c.animada) return '';
  let css = '';
  for (const [nombre, nodo] of Object.entries(c.nodos)) {
    if (!nodo.variable) continue;
    css += `@keyframes anim-${c.id}-${nombre}{`;
    for (const [t, v, curva] of nodo.frames) {
      css += `${f(t * 100)}%{transform:${transformDe(nodo, v)}${curva === 'linear' ? ';animation-timing-function:linear' : ''}}`;
    }
    css += '}\n';
  }
  return css;
}

/* Atributo style de un nodo: postura intermedia fija y, si se mueve, la animación. */
function estilo(c, nombre, mover) {
  const nodo = c.nodos[nombre];
  if (!nodo) return '';
  let s = `transform:${transformDe(nodo, nodo.medio)}`;
  if (mover && c.animada && nodo.variable) {
    s += `;animation:anim-${c.id}-${nombre} ${f(c.def.duracion || 3)}s ease-in-out infinite`;
  }
  return ` style="${s}"`;
}

/* ------------------------------------------------------------------ */
/* Estilos                                                             */
/* ------------------------------------------------------------------ */

let estilosListos = false;

export function asegurarEstilos() {
  if (estilosListos) return;
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById('anim-estilos')) {
    estilosListos = true;
    return;
  }
  let css = '.anim-fig{display:block;overflow:hidden}\n'
    + '.anim-fig g{transform-origin:0 0}\n'
    + '.anim-fig--grande{width:100%;height:240px}\n'
    + '.anim-fig--mini{width:56px;height:56px}\n'
    + '.anim-pausada *{animation-play-state:paused!important}\n'
    + '.anim-mapa{display:block;width:100%;height:auto;max-height:220px}\n'
    + '@media (prefers-reduced-motion: reduce){.anim-fig *{animation:none!important}}\n';
  for (const id of Object.keys(ANIMACIONES)) css += keyframesDe(compilar(id));
  const el = document.createElement('style');
  el.id = 'anim-estilos';
  el.textContent = css;
  document.head.appendChild(el);
  estilosListos = true;
}

/* ------------------------------------------------------------------ */
/* Dibujo                                                              */
/* ------------------------------------------------------------------ */

function linea(x1, y1, x2, y2, color, ancho, extra = '') {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${f(ancho)}" stroke-linecap="round"${extra}/>`;
}

/* Capas coral de los músculos sobre un segmento (dibujado de (0,0) a (0,largo)). */
function capasMusculo(ctx, seg, largo, ancho, lejano) {
  const frontal = ctx.vista === 'frontal';
  const signoFrente = seg === 'tronco' ? -1 : 1;
  let s = '';
  const capa = (lista, opacidad) => {
    for (const id of lista) {
      for (const [zSeg, lado, a, b] of ZONAS[id] || []) {
        if (zSeg !== seg) continue;
        let x = 0;
        let w = ancho * 0.62;
        if (frontal) {
          w = ancho * (seg === 'tronco' ? 0.5 : 0.62);
        } else if (lado === 'f') {
          x = signoFrente * ancho * 0.22;
          w = ancho * 0.56;
        } else if (lado === 'b') {
          x = -signoFrente * ancho * 0.22;
          w = ancho * 0.56;
        }
        const y1 = Math.max(-4, a);
        const y2 = Math.min(largo + 2, b * (largo / (LARGO[seg] || largo)));
        // Borde oscuro fino: el músculo se distingue del cuerpo sin depender solo del tono.
        s += `<line x1="${f(x)}" y1="${f(y1)}" x2="${f(x)}" y2="${f(y2)}" stroke-width="${f(w + (ctx.mini ? 2.4 : 1.6))}" stroke-linecap="round" stroke="#1E222A" stroke-opacity="${f(Math.min(1, opacidad + 0.2))}"/>`;
        const op = opacidad;
        s += `<line x1="${f(x)}" y1="${f(y1)}" x2="${f(x)}" y2="${f(y2)}" stroke-width="${f(w)}" stroke-linecap="round" style="stroke:${ACENTO}" stroke-opacity="${f(op)}"/>`;
      }
    }
  };
  capa(ctx.secundarios, 0.55);
  capa(ctx.principales, 0.95);
  return s;
}

/* Segmento escalable (grupo e_*) con sus capas de músculo. */
function segmento(ctx, nodoEscala, seg, color, ancho, lejano) {
  const largo = LARGO[seg];
  return `<g${estilo(ctx.c, nodoEscala, ctx.mover)}>`
    + linea(0, 0, 0, largo, color, ancho)
    + capasMusculo(ctx, seg, largo, ancho, lejano)
    + '</g>';
}

function mancuernaPerfil(mini) {
  const r = `fill="${C.equipo}" stroke="${C.borde}" stroke-width="1.2"`;
  return `<line x1="-8" y1="0" x2="8" y2="0" stroke="${C.borde}" stroke-width="${mini ? 3.4 : 2.6}" stroke-linecap="round"/>`
    + `<rect x="-12.5" y="-6.5" width="4.5" height="13" rx="1.5" ${r}/>`
    + `<rect x="8" y="-6.5" width="4.5" height="13" rx="1.5" ${r}/>`;
}

function equipoSvg(tipo, mini) {
  const relleno = `fill="${C.equipo}" stroke="${C.borde}" stroke-width="1.5"`;
  switch (tipo) {
    case 'barra':
      return `<circle cx="0" cy="3" r="9.5" ${relleno} fill-opacity="0.92"/>`
        + (mini ? '' : `<circle cx="0" cy="3" r="2" fill="${C.borde}"/>`);
    case 'mancuerna':
      return `<circle cx="0" cy="3" r="6.2" ${relleno}/>`
        + (mini ? '' : `<circle cx="0" cy="3" r="1.4" fill="${C.borde}"/>`);
    case 'mancuerna-lado':
      return `<g transform="translate(0 3)">${mancuernaPerfil(mini)}</g>`;
    case 'mancuerna-eje':
      return `<g transform="translate(0 -4) rotate(90)">${mancuernaPerfil(mini)}</g>`;
    default:
      return '';
  }
}

function mano(ctx, nodo, tipoEquipo, color) {
  return `<g${estilo(ctx.c, nodo, ctx.mover)}>`
    + equipoSvg(tipoEquipo, ctx.mini)
    + `<circle cx="0" cy="1.5" r="${ctx.g.mano}" fill="${color}"/>`
    + '</g>';
}

function cabeza(ctx, color) {
  const d = ctx.c.def.cuello ?? CUELLO;
  return `<g${estilo(ctx.c, 'cabeza', ctx.mover)}><circle cx="0" cy="${f(d)}" r="${ctx.g.cabeza}" fill="${color}"/></g>`;
}

function muebleSvg(m) {
  const r = `fill="${C.equipo}" stroke="${C.borde}" stroke-width="1.5"`;
  switch (m.tipo) {
    case 'silla': {
      const { x, ancho, y } = m;
      let s = '';
      if (m.respaldo) {
        const bx = m.respaldo === 'der' ? x + ancho - 2 : x + 2;
        s += linea(bx, y, bx, y - (m.altoRespaldo ?? 34), C.borde, 4);
      }
      s += linea(x + 3, y + 3, x + 3, SUELO, C.borde, 3);
      s += linea(x + ancho - 3, y + 3, x + ancho - 3, SUELO, C.borde, 3);
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(ancho)}" height="5" rx="2" ${r}/>`;
      return s;
    }
    case 'sofa': {
      const { x, ancho, y } = m;
      const bx = m.respaldo === 'der' ? x + ancho - 14 : x;
      return `<rect x="${f(bx)}" y="${f(y - 34)}" width="14" height="${f(SUELO - y + 34)}" rx="5" ${r}/>`
        + `<rect x="${f(x)}" y="${f(y)}" width="${f(ancho)}" height="${f(SUELO - y)}" rx="5" ${r}/>`;
    }
    case 'mesa': {
      const { x, ancho, y } = m;
      return linea(x + 4, y, x + 4, SUELO, C.borde, 3.5)
        + linea(x + ancho - 4, y, x + ancho - 4, SUELO, C.borde, 3.5)
        + `<rect x="${f(x)}" y="${f(y - 5)}" width="${f(ancho)}" height="6" rx="2" ${r}/>`;
    }
    case 'escalon':
      return `<rect x="${f(m.x)}" y="${f(SUELO - m.alto)}" width="${f(m.ancho)}" height="${f(m.alto)}" rx="1.5" ${r}/>`;
    case 'pared':
      return `<rect x="${f(m.x)}" y="-40" width="8" height="${f(SUELO + 40)}" fill="${C.equipo}" fill-opacity="0.6"/>`;
    default:
      return '';
  }
}

function figuraPerfil(ctx) {
  const { c, g, mover } = ctx;
  const eq = c.def.equipo || {};
  const st = (n) => estilo(c, n, mover);

  const pierna = (L, color, lejano) => `<g${st('muslo' + L)}>`
    + segmento(ctx, 'e_muslo' + L, 'muslo', color, g.muslo, lejano)
    + `<g${st('pierna' + L)}>`
    + segmento(ctx, 'e_pierna' + L, 'pierna', color, g.pierna, lejano)
    + `<g${st('pie' + L)}>${linea(0, -3, 0, 11, color, g.pie)}</g>`
    + '</g></g>';

  const brazo = (L, color, lejano) => `<g${st('brazo' + L)}>`
    + segmento(ctx, 'e_brazo' + L, 'brazo', color, g.brazo, lejano)
    + `<g${st('antebrazo' + L)}>`
    + segmento(ctx, 'e_antebrazo' + L, 'antebrazo', color, g.antebrazo, lejano)
    + mano(ctx, 'mano' + L, L ? eq.manoL : eq.mano, color)
    + '</g></g>';

  const delante = !!c.def.cabezaDelante;
  let s = `<g${st('raiz')}>`;
  s += pierna('L', C.lejos, true);
  s += `<g${st('tronco')}>`
    + brazo('L', C.lejos, true)
    + segmento(ctx, 'e_tronco', 'tronco', C.cerca, g.tronco, false)
    + (delante ? '' : cabeza(ctx, C.cerca))
    + '</g>';
  s += pierna('', C.cerca, false);
  if (eq.cadera) s += `<g transform="translate(2 -14)">${equipoSvg(eq.cadera, ctx.mini)}</g>`;
  s += `<g${st('tronco')}>` + brazo('', C.cerca, false) + (delante ? cabeza(ctx, C.cerca) : '') + '</g>';
  s += '</g>';
  return s;
}

function figuraFrontal(ctx) {
  const { c, g, mover } = ctx;
  const def = c.def;
  const eq = def.equipo || {};
  const st = (n) => estilo(c, n, mover);
  const col = C.cerca;

  const pierna = (L) => `<g${st('muslo' + L)}>`
    + linea(0, 0, 0, LARGO.muslo, col, g.muslo)
    + capasMusculo(ctx, 'muslo', LARGO.muslo, g.muslo, false)
    + `<g${st('pierna' + L)}>`
    + linea(0, 0, 0, LARGO.pierna, col, g.pierna)
    + capasMusculo(ctx, 'pierna', LARGO.pierna, g.pierna, false)
    + linea(-2.5, LARGO.pierna + 2, 2.5, LARGO.pierna + 2, col, g.pie + 1)
    + '</g></g>';

  const brazo = (L) => `<g${st('brazo' + L)}>`
    + linea(0, 0, 0, LARGO.brazo, col, g.brazo)
    + capasMusculo(ctx, 'brazo', LARGO.brazo, g.brazo, false)
    + `<g${st('antebrazo' + L)}>`
    + linea(0, 0, 0, LARGO.antebrazo, col, g.antebrazo)
    + capasMusculo(ctx, 'antebrazo', LARGO.antebrazo, g.antebrazo, false)
    + mano(ctx, 'mano' + L, eq.mano, col)
    + '</g></g>';

  const Lt = LARGO.tronco * (c.nodos.e_tronco ? c.nodos.e_tronco.medio[0] : 1);
  let s = `<g${st('raiz')}>`;
  if (!def.sinPiernas) {
    s += pierna('D') + pierna('I');
    s += linea(-7, 0, 7, 0, col, g.muslo + 1);
  }
  s += `<g${st('tronco')}>`;
  if (def.cabezaDetras) s += cabeza(ctx, col);
  s += `<g${st('e_tronco')}>`
    + linea(0, 0, 0, LARGO.tronco, col, g.troncoF)
    + capasMusculo(ctx, 'tronco', LARGO.tronco, g.troncoF, false)
    + '</g>';
  s += linea(-12, Lt - 3, 12, Lt - 3, col, g.hombros);
  if (!def.cabezaDetras) s += cabeza(ctx, col);
  s += brazo('D') + brazo('I');
  s += '</g></g>';
  return s;
}

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

export function tieneAnimacion(ejercicioId) {
  const d = ANIMACIONES[ejercicioId];
  return !!(d && Array.isArray(d.poses) && d.poses.length > 1);
}

export function htmlFigura(ejercicioId, { tamano = 'mini', animada = true } = {}) {
  asegurarEstilos();
  const tam = tamano === 'grande' ? 'grande' : 'mini';
  const mini = tam === 'mini';
  const ej = EJ.get(ejercicioId);
  const c = compilar(ejercicioId);
  const def = c.def;
  const ctx = {
    c,
    g: GROSOR[tam],
    mini,
    vista: def.vista,
    mover: animada && c.animada && !prefiereMenosMovimiento(),
    principales: (ej && ej.musculosPrincipales) || [],
    secundarios: (ej && ej.musculosSecundarios) || [],
  };
  const vb = (mini ? def.vbMini : def.vb)
    || (def.alto ? VB_ALTO[tam] : VB[tam]);
  const nombre = ej ? ej.nombre : ejercicioId;
  const dims = mini ? 'width="56" height="56"' : 'width="100%" height="240"';

  let s = `<svg class="anim-fig anim-fig--${tam}" xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" ${dims} preserveAspectRatio="xMidYMid meet" role="img" aria-label="${mini ? esc(nombre) : `Animación: ${esc(nombre)}`}" focusable="false">`;
  for (const m of def.muebles || []) s += muebleSvg(m);
  if (def.vista !== 'frontal' || !def.sinSuelo) {
    s += `<line x1="-40" y1="${SUELO + 1}" x2="240" y2="${SUELO + 1}" stroke-width="${GROSOR[tam].suelo}" style="stroke:var(--border, #2C313C)"/>`;
  }
  s += def.vista === 'frontal' ? figuraFrontal(ctx) : figuraPerfil(ctx);
  s += '</svg>';
  return s;
}

export function pausarFiguras(elemento, pausar = true) {
  if (!elemento) return;
  const lista = elemento.matches && elemento.matches('svg.anim-fig')
    ? [elemento]
    : Array.from(elemento.querySelectorAll ? elemento.querySelectorAll('svg.anim-fig') : []);
  for (const svg of lista) svg.classList.toggle('anim-pausada', !!pausar);
}

/* ------------------------------------------------------------------ */
/* Mapa de músculos (frente y espalda)                                 */
/* ------------------------------------------------------------------ */

/* [dx, cy, rx, ry]; con dx > 0 se dibuja a los dos lados. */
const FORMAS = {
  frente: {
    trapecio: [[9, 27.5, 5.5, 2.4]],
    'deltoide-anterior': [[18.5, 34, 3.6, 5]],
    'deltoide-lateral': [[23.2, 33, 2.8, 5]],
    pectoral: [[8.5, 41, 8.3, 6.3]],
    biceps: [[24, 48, 3.3, 8.5]],
    antebrazo: [[27, 75, 3, 10]],
    'recto-abdominal': [[0, 66, 6.3, 13.5]],
    oblicuos: [[12.3, 67, 2.8, 9]],
    'flexores-cadera': [[7, 89, 3.2, 4]],
    cuadriceps: [[10, 112, 5.2, 14]],
    aductores: [[4, 104, 2.2, 8]],
  },
  espalda: {
    trapecio: 'M0 22 L14 30 L0 47 L-14 30 Z',
    'deltoide-posterior': [[18.5, 34, 3.6, 5]],
    'deltoide-lateral': [[23.2, 33, 2.8, 5]],
    romboides: [[5.5, 41, 3.3, 4.6]],
    dorsal: [[12.3, 56, 5.3, 11]],
    triceps: [[24, 49, 3.3, 8.5]],
    antebrazo: [[27, 75, 3, 10]],
    lumbar: [[4.2, 77, 3.1, 7]],
    'gluteo-medio': [[12.3, 88, 3.6, 3.8]],
    'gluteo-mayor': [[7.8, 97, 7.3, 7]],
    isquiotibiales: [[10, 118, 5, 11]],
    gemelo: [[10.5, 141, 4.3, 9]],
  },
};

function silueta(cx) {
  const col = '#5A6070';
  const p = (x) => f(cx + x);
  let s = `<circle cx="${p(0)}" cy="13" r="8.5" fill="${col}"/>`;
  s += `<line x1="${p(0)}" y1="19" x2="${p(0)}" y2="28" stroke="${col}" stroke-width="7"/>`;
  s += `<path d="M${p(-20)} 28 Q${p(0)} 24 ${p(20)} 28 L${p(16)} 60 L${p(14)} 82 L${p(16)} 95 L${p(-16)} 95 L${p(-14)} 82 L${p(-16)} 60 Z" fill="${col}" stroke="${col}" stroke-width="4" stroke-linejoin="round"/>`;
  for (const k of [-1, 1]) {
    s += linea(cx + k * 21, 32, cx + k * 25.5, 62, col, 8.5);
    s += linea(cx + k * 25.5, 62, cx + k * 28, 89, col, 6.5);
    s += `<circle cx="${p(k * 28.5)}" cy="94" r="3.6" fill="${col}"/>`;
    s += linea(cx + k * 9, 94, cx + k * 10, 130, col, 12);
    s += linea(cx + k * 10, 130, cx + k * 10.5, 158, col, 8.5);
    s += linea(cx + k * 10.5, 161, cx + k * 13, 161, col, 4.5);
  }
  return s;
}

function formaMusculo(cx, forma) {
  if (typeof forma === 'string') {
    return `<path d="${forma}" transform="translate(${f(cx)} 0)"/>`;
  }
  let s = '';
  for (const [dx, cy, rx, ry] of forma) {
    const lados = dx === 0 ? [0] : [-dx, dx];
    for (const x of lados) s += `<ellipse cx="${f(cx + x)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}"/>`;
  }
  return s;
}

export function htmlMapaMusculos(principales = [], secundarios = []) {
  asegurarEstilos();
  const P = new Set(principales || []);
  const Sec = new Set(secundarios || []);
  const vistas = [['frente', 50, 'Frente'], ['espalda', 150, 'Espalda']];
  let s = '';
  for (const [vista, cx, texto] of vistas) {
    s += silueta(cx);
    for (const m of MUSCULOS) {
      const enVista = m.vista === 'ambas'
        || (vista === 'frente' && m.vista === 'frontal')
        || (vista === 'espalda' && m.vista === 'trasera');
      const forma = FORMAS[vista][m.id];
      if (!enVista || !forma) continue;
      let pinta = 'fill="#2E333D"';
      if (P.has(m.id)) pinta = `style="fill:${ACENTO}"`;
      else if (Sec.has(m.id)) pinta = `style="fill:${ACENTO};fill-opacity:0.4;stroke:${ACENTO};stroke-width:1.4"`;
      s += `<g data-musculo="${m.id}" ${pinta}><title>${esc(m.nombre)}</title>${formaMusculo(cx, forma)}</g>`;
    }
    s += `<text x="${cx}" y="176" text-anchor="middle" font-size="10" style="fill:var(--text-muted, #9BA3B1)">${texto}</text>`;
  }
  const nombres = (set) => [...set].map((id) => NOMBRE_MUSCULO.get(id) || id).join(', ');
  let label = 'Mapa de músculos';
  if (P.size) label += `. Principales: ${nombres(P)}`;
  if (Sec.size) label += `. Secundarios: ${nombres(Sec)}`;
  return `<svg class="anim-mapa" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 182" role="img" aria-label="${esc(label)}" focusable="false">${s}</svg>`;
}
