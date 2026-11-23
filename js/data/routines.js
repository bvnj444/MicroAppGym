/*
 * MicroApp Gym — data/routines.js
 * Plantillas de rutina de 3, 4 y 5 días (PLAN.md, sección 7). Solo datos.
 *
 * - Cada elemento de `ejercicios` tiene la forma de la RUTINA GENERADA de storage.js,
 *   sin `variante` ni `pesoSugerido` (los añade planner.js).
 * - Cada día ya va ordenado por montaje: barra -> mancuernas -> ninguno.
 * - Superserie: dos elementos consecutivos que se apuntan con `superserieCon` y comparten
 *   `descanso` (se descansa tras cada pareja).
 * - 3 días: `rotacion` dice qué día toca en cada hueco de la semana (A/B/A y luego B/A/B).
 *   El `diaSemanaSugerido` de cuerpo-a y cuerpo-b es orientativo: los huecos son lunes,
 *   miércoles y viernes (1, 3, 5).
 * - La elevación de piernas se alterna cada semana con el crunch (está en sus sustitutos).
 */

const TORSO_A = {
  id: 'torso-a',
  nombre: 'Torso A',
  diaSemanaSugerido: 1,
  ejercicios: [
    { ejercicioId: 'press-suelo-barra', montaje: 'barra', numMancuernas: null, series: 4, repeticiones: [8, 12], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'remo-barra', montaje: 'barra', numMancuernas: null, series: 4, repeticiones: [8, 12], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'press-militar-barra', montaje: 'barra', numMancuernas: null, series: 3, repeticiones: [8, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'press-frances-suelo', montaje: 'barra', numMancuernas: null, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'curl-barra', montaje: 'barra', numMancuernas: null, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'pullover-suelo', montaje: 'mancuernas', numMancuernas: 1, series: 3, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'aperturas-suelo', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: null },
  ],
};

const PIERNA_A = {
  id: 'pierna-a',
  nombre: 'Pierna A',
  diaSemanaSugerido: 2,
  ejercicios: [
    { ejercicioId: 'peso-muerto-rumano-barra', montaje: 'barra', numMancuernas: null, series: 4, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'sentadilla-goblet', montaje: 'mancuernas', numMancuernas: 1, series: 4, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'zancadas-atras', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'puente-gluteo-una-pierna', montaje: 'ninguno', numMancuernas: null, series: 3, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'elevacion-talones-una-pierna', montaje: 'ninguno', numMancuernas: null, series: 4, repeticiones: [15, 20], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'plancha', montaje: 'ninguno', numMancuernas: null, series: 3, repeticiones: null, segundos: [30, 45], casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
  ],
};

const TORSO_B = {
  id: 'torso-b',
  nombre: 'Torso B',
  diaSemanaSugerido: 4,
  ejercicios: [
    { ejercicioId: 'press-suelo-mancuernas', montaje: 'mancuernas', numMancuernas: 2, series: 4, repeticiones: [10, 15], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'remo-mancuerna-una-mano', montaje: 'mancuernas', numMancuernas: 1, series: 4, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'remo-inclinado-mancuernas', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'elevaciones-laterales', montaje: 'mancuernas', numMancuernas: 2, series: 4, repeticiones: [12, 20], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'pajaros', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [15, 20], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'curl-martillo', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: 'fondos-silla' },
    { ejercicioId: 'fondos-silla', montaje: 'ninguno', numMancuernas: null, series: 3, repeticiones: [10, 15], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: 'curl-martillo' },
    { ejercicioId: 'flexiones-declinadas', montaje: 'ninguno', numMancuernas: null, series: 2, repeticiones: null, segundos: null, casiFallo: true, descanso: 90, tempo: null, pausa: null, superserieCon: null },
  ],
};

const PIERNA_B = {
  id: 'pierna-b',
  nombre: 'Pierna B',
  diaSemanaSugerido: 5,
  ejercicios: [
    { ejercicioId: 'hip-thrust-barra', montaje: 'barra', numMancuernas: null, series: 4, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'sentadilla-bulgara', montaje: 'mancuernas', numMancuernas: 2, series: 4, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'peso-muerto-una-pierna', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'sentadilla-goblet', montaje: 'mancuernas', numMancuernas: 1, series: 3, repeticiones: [12, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: 2, superserieCon: null },
    { ejercicioId: 'elevacion-talones-una-pierna', montaje: 'ninguno', numMancuernas: null, series: 4, repeticiones: [15, 20], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'elevacion-piernas', montaje: 'ninguno', numMancuernas: null, series: 3, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
  ],
};

const HOMBRO_BRAZOS = {
  id: 'hombro-brazos',
  nombre: 'Hombro y brazos',
  diaSemanaSugerido: 6,
  ejercicios: [
    { ejercicioId: 'press-militar-mancuernas', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'elevaciones-laterales', montaje: 'mancuernas', numMancuernas: 2, series: 4, repeticiones: [15, 20], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'pajaros', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [15, 20], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'pullover-suelo', montaje: 'mancuernas', numMancuernas: 1, series: 3, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'curl-concentrado', montaje: 'mancuernas', numMancuernas: 1, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'extension-triceps-cabeza', montaje: 'mancuernas', numMancuernas: 1, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
  ],
};

const CUERPO_A = {
  id: 'cuerpo-a',
  nombre: 'Cuerpo completo A',
  diaSemanaSugerido: 1,
  ejercicios: [
    // Bloque de barra del más pesado al más ligero: solo hay que ir quitando discos.
    { ejercicioId: 'peso-muerto-rumano-barra', montaje: 'barra', numMancuernas: null, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'press-suelo-barra', montaje: 'barra', numMancuernas: null, series: 3, repeticiones: [8, 12], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'remo-barra', montaje: 'barra', numMancuernas: null, series: 3, repeticiones: [8, 12], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'sentadilla-goblet', montaje: 'mancuernas', numMancuernas: 1, series: 3, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'elevaciones-laterales', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [12, 20], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'plancha', montaje: 'ninguno', numMancuernas: null, series: 3, repeticiones: null, segundos: [30, 45], casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
  ],
};

const CUERPO_B = {
  id: 'cuerpo-b',
  nombre: 'Cuerpo completo B',
  diaSemanaSugerido: 3,
  ejercicios: [
    { ejercicioId: 'hip-thrust-barra', montaje: 'barra', numMancuernas: null, series: 3, repeticiones: [12, 15], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'press-suelo-mancuernas', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [10, 15], segundos: null, casiFallo: false, descanso: 120, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'remo-mancuerna-una-mano', montaje: 'mancuernas', numMancuernas: 1, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'sentadilla-bulgara', montaje: 'mancuernas', numMancuernas: 2, series: 3, repeticiones: [10, 12], segundos: null, casiFallo: false, descanso: 90, tempo: null, pausa: null, superserieCon: null },
    { ejercicioId: 'curl-martillo', montaje: 'mancuernas', numMancuernas: 2, series: 2, repeticiones: [12, 12], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: 'fondos-silla' },
    { ejercicioId: 'fondos-silla', montaje: 'ninguno', numMancuernas: null, series: 2, repeticiones: [12, 12], segundos: null, casiFallo: false, descanso: 75, tempo: null, pausa: null, superserieCon: 'curl-martillo' },
    { ejercicioId: 'elevacion-talones-una-pierna', montaje: 'ninguno', numMancuernas: null, series: 3, repeticiones: [15, 20], segundos: null, casiFallo: false, descanso: 60, tempo: null, pausa: null, superserieCon: null },
  ],
};

export const PLANTILLAS = {
  '3-dias': {
    id: '3-dias',
    nombre: 'Cuerpo completo (3 días)',
    diasPorSemana: 3,
    rotacion: {
      semanaImpar: ['cuerpo-a', 'cuerpo-b', 'cuerpo-a'],
      semanaPar: ['cuerpo-b', 'cuerpo-a', 'cuerpo-b'],
    },
    dias: [CUERPO_A, CUERPO_B],
  },
  '4-dias': {
    id: '4-dias',
    nombre: 'Torso / pierna (4 días)',
    diasPorSemana: 4,
    rotacion: null,
    dias: [TORSO_A, PIERNA_A, TORSO_B, PIERNA_B],
  },
  '5-dias': {
    id: '5-dias',
    nombre: 'Torso / pierna + hombro y brazos (5 días)',
    diasPorSemana: 5,
    rotacion: null,
    dias: [TORSO_A, PIERNA_A, TORSO_B, PIERNA_B, HOMBRO_BRAZOS],
  },
};
