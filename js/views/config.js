/*
 * Pantalla Ajustes / configuración inicial (#ajustes, se abre desde Hoy).
 * Edita la configuración del contrato de storage.js (pesos en gramos enteros)
 * e incluye exportar e importar datos en JSON.
 * Al guardar mantiene la rutina al día (planner.js):
 *  - cambia el número de días -> rutina nueva (con confirmación si ya había una);
 *  - cambian solo los días o el nivel -> planner.reasignarDias, sin preguntar.
 * En la configuración inicial, tras guardar, navega a Hoy.
 */

import * as planner from '../planner.js';

const DIAS = [
  [1, 'L', 'lunes'], [2, 'M', 'martes'], [3, 'X', 'miércoles'], [4, 'J', 'jueves'],
  [5, 'V', 'viernes'], [6, 'S', 'sábado'], [7, 'D', 'domingo'],
];

// Campos numéricos con stepper. `ruta` apunta dentro del objeto de configuración.
const PASOS = [
  { grupo: 'Discos (unidades en total)', campos: [
    { ruta: ['inventario', '1250'], etiqueta: 'Discos de 1,25 kg', min: 0, max: 20, paso: 2, tipo: 'unidades' },
    { ruta: ['inventario', '2000'], etiqueta: 'Discos de 2 kg', min: 0, max: 20, paso: 2, tipo: 'unidades' },
    { ruta: ['inventario', '2500'], etiqueta: 'Discos de 2,5 kg', min: 0, max: 20, paso: 2, tipo: 'unidades' },
  ] },
  { grupo: 'Peso de las piezas (estimado)', campos: [
    { ruta: ['piezas', 'mango'], etiqueta: 'Mango', min: 0, max: 3000, paso: 25, tipo: 'kg' },
    { ruta: ['piezas', 'conector'], etiqueta: 'Conector de barra', min: 0, max: 3000, paso: 25, tipo: 'kg' },
    { ruta: ['piezas', 'tuerca'], etiqueta: 'Tuerca', min: 0, max: 1000, paso: 5, tipo: 'kg' },
  ] },
  { grupo: 'Montaje', campos: [
    { ruta: ['tuercas', 'porMancuerna'], etiqueta: 'Tuercas por mancuerna', min: 0, max: 2, paso: 1, tipo: 'unidades' },
    { ruta: ['tuercas', 'barra'], etiqueta: 'Tuercas en la barra', min: 0, max: 4, paso: 1, tipo: 'unidades' },
    { ruta: ['maxDiscosPorLadoMango'], etiqueta: 'Máximo de discos por lado del mango', min: 0, max: 14000, paso: 250, tipo: 'kg' },
  ] },
];

// Días recomendados para cada número de días por semana (1 = lunes … 7 = domingo).
// Coinciden con la semana tipo del PLAN (sección 7).
const DIAS_RECOMENDADOS = { 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 4, 5, 6] };

let borrador = null; // copia de trabajo de la configuración mientras se edita

/**
 * Ajusta la selección de días a `n` días: conserva los que ya estaban marcados
 * (por orden de la semana), quita los que sobran y completa con los días
 * recomendados y, si hace falta, con el resto de la semana.
 */
function ajustarDias(dias, n) {
  const elegidos = [...new Set(dias)].sort((a, b) => a - b).slice(0, n);
  const candidatos = [...DIAS_RECOMENDADOS[n], 1, 2, 3, 4, 5, 6, 7];
  for (const d of candidatos) {
    if (elegidos.length >= n) break;
    if (!elegidos.includes(d)) elegidos.push(d);
  }
  return elegidos.sort((a, b) => a - b);
}

function textoEleccionDias(c) {
  const faltan = c.diasPorSemana - c.diasSemana.length;
  if (faltan > 0) return `Qué días (elige ${faltan} más)`;
  return `Qué días (${c.diasPorSemana} de ${c.diasPorSemana} elegidos)`;
}

function leer(obj, ruta) { return ruta.reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function escribir(obj, ruta, valor) {
  const ultimo = ruta[ruta.length - 1];
  const padre = ruta.slice(0, -1).reduce((o, k) => (o[k] ??= {}), obj);
  padre[ultimo] = valor;
}
const idCampo = (ruta) => 'cfg-' + ruta.join('-');

function segmentado({ id, etiqueta, opciones, multiple }) {
  return `
    <div class="field">
      <span class="field__label" id="${id}-etiqueta">${etiqueta}</span>
      <div class="segmented" ${multiple ? 'role="group"' : 'role="radiogroup"'} aria-labelledby="${id}-etiqueta" data-grupo="${id}">
        ${opciones.map((o) => `
          <button type="button" class="segmented__option${o.elegida ? ' is-selected' : ''}" data-valor="${o.valor}"
            ${multiple ? `aria-pressed="${o.elegida}"` : `role="radio" aria-checked="${o.elegida}"`}
            ${o.bloqueada ? 'aria-disabled="true"' : ''}
            ${o.titulo ? `aria-label="${o.titulo}"` : ''}>${o.texto}</button>`).join('')}
      </div>
    </div>`;
}

function textoValor(campo, valor, ctx) {
  return campo.tipo === 'kg' ? ctx.kg(valor) : String(valor);
}

function pintar(contenedor, ctx) {
  const c = borrador;
  const inicial = !c.configurado;

  const steppers = PASOS.map((g) => `
    <section class="card stack" aria-label="${g.grupo}">
      <h2 class="card__title">${g.grupo}</h2>
      ${g.campos.map((campo) => {
        const id = idCampo(campo.ruta);
        const valor = Number(leer(c, campo.ruta)) || 0;
        return `
        <div class="field">
          <span class="field__label" id="${id}-etiqueta">${campo.etiqueta}</span>
          <div class="stepper" role="group" aria-labelledby="${id}-etiqueta" data-ruta="${campo.ruta.join('.')}">
            <button type="button" class="btn btn--icon btn--secondary" data-paso="-1" aria-label="Menos"${valor <= campo.min ? ' disabled' : ''}>−</button>
            <output id="${id}" aria-live="polite">${textoValor(campo, valor, ctx)}</output>
            <button type="button" class="btn btn--icon btn--secondary" data-paso="1" aria-label="Más"${valor >= campo.max ? ' disabled' : ''}>+</button>
          </div>
        </div>`;
      }).join('')}
    </section>`).join('');

  contenedor.innerHTML = `
    <header class="screen__header">
      <div>
        <p class="screen__subtitle">${inicial ? 'Configuración inicial' : 'Tu equipo y tu semana'}</p>
        <h1 class="screen__title">Ajustes</h1>
      </div>
      ${inicial ? '' : `
      <button type="button" class="screen__action btn btn--icon btn--ghost" data-accion="volver" aria-label="Cerrar ajustes">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>`}
    </header>

    ${inicial ? `
    <section class="card card--highlight stack" aria-label="Bienvenida">
      <h2 class="card__title">Bienvenido a MicroApp Gym</h2>
      <p class="card__meta">Elige cuántos días entrenas y cuáles, tu nivel y revisa tus discos. Al guardar se crea tu rutina.</p>
    </section>` : ''}

    <form class="stack" novalidate>
      <section class="card stack" aria-label="Semana">
        <h2 class="card__title">Semana</h2>
        ${segmentado({ id: 'cfg-dias-semana-n', etiqueta: 'Días por semana', opciones:
          [3, 4, 5].map((n) => ({ valor: n, texto: String(n), elegida: c.diasPorSemana === n })) })}
        ${segmentado({ id: 'cfg-dias', etiqueta: textoEleccionDias(c), multiple: true, opciones:
          DIAS.map(([n, letra, nombre]) => {
            const elegida = c.diasSemana.includes(n);
            // Con todos los días ya elegidos, los demás no se pueden marcar hasta quitar uno.
            const bloqueada = !elegida && c.diasSemana.length >= c.diasPorSemana;
            return { valor: n, texto: letra, titulo: nombre, elegida, bloqueada };
          }) })}
        ${segmentado({ id: 'cfg-nivel', etiqueta: 'Nivel', opciones: [
          { valor: 'principiante', texto: 'Principiante', elegida: c.nivel === 'principiante' },
          { valor: 'intermedio', texto: 'Intermedio', elegida: c.nivel === 'intermedio' },
        ] })}
        <p class="muted">${c.nivel === 'principiante'
          ? 'Principiante: 1 serie menos por ejercicio las 2 primeras semanas y 30 s más de descanso.'
          : 'Intermedio: la rutina tal cual.'}</p>
      </section>

      ${steppers}

      <section class="card stack" aria-label="Equipo extra">
        <h2 class="card__title">Equipo extra</h2>
        <label class="row"><input type="checkbox" disabled> <span>Barra de dominadas <span class="muted">(próximamente)</span></span></label>
        <label class="row"><input type="checkbox" disabled> <span>Banco <span class="muted">(próximamente)</span></span></label>
      </section>

      <button type="submit" class="btn btn--primary btn--block">${inicial ? 'Crear mi rutina' : 'Guardar ajustes'}</button>
      <button type="button" class="btn btn--ghost btn--block" data-accion="restablecer">Volver a los valores estimados</button>

      <section class="card stack" aria-label="Copia de seguridad">
        <h2 class="card__title">Copia de seguridad</h2>
        <p class="card__meta">Guarda tus datos en un archivo JSON o recupéralos desde uno.</p>
        <button type="button" class="btn btn--secondary btn--block" data-accion="exportar">Exportar datos</button>
        <button type="button" class="btn btn--secondary btn--block" data-accion="importar">Importar datos</button>
        <input type="file" class="visually-hidden" accept="application/json,.json" data-accion="archivo" tabindex="-1" aria-hidden="true">
      </section>
    </form>
  `;

  conectar(contenedor, ctx);
}

function conectar(contenedor, ctx) {
  const { storage } = ctx;
  const form = contenedor.querySelector('form');

  contenedor.querySelector('[data-accion="volver"]')?.addEventListener('click', () => ctx.volver());

  // Segmentados
  form.addEventListener('click', (evento) => {
    const opcion = evento.target.closest('.segmented__option');
    if (!opcion) return;
    const grupo = opcion.closest('[data-grupo]').dataset.grupo;
    const valor = opcion.dataset.valor;
    if (grupo === 'cfg-dias-semana-n') {
      const anterior = borrador.diasPorSemana;
      borrador.diasPorSemana = Number(valor);
      // Si se usaban los días recomendados, se pasa a los recomendados del nuevo número
      // (así 3 días queda L-X-V, con descanso entre medias). Si el usuario los había
      // personalizado, se conservan sus días y solo se quitan o añaden los necesarios.
      const eranRecomendados = DIAS_RECOMENDADOS[anterior]?.join() === [...borrador.diasSemana].sort((a, b) => a - b).join();
      borrador.diasSemana = eranRecomendados
        ? [...DIAS_RECOMENDADOS[borrador.diasPorSemana]]
        : ajustarDias(borrador.diasSemana, borrador.diasPorSemana);
    } else if (grupo === 'cfg-dias') {
      const n = Number(valor);
      const dias = new Set(borrador.diasSemana);
      if (dias.has(n)) {
        dias.delete(n);
      } else if (dias.size >= borrador.diasPorSemana) {
        ctx.toast(`Ya tienes ${borrador.diasPorSemana} días. Quita uno antes de elegir otro.`);
        return;
      } else {
        dias.add(n);
      }
      borrador.diasSemana = [...dias].sort((a, b) => a - b);
    } else if (grupo === 'cfg-nivel') {
      borrador.nivel = valor;
    }
    pintar(contenedor, ctx);
    contenedor.querySelector(`[data-grupo="${grupo}"] [data-valor="${valor}"]`)?.focus();
  });

  // Steppers
  form.addEventListener('click', (evento) => {
    const boton = evento.target.closest('.stepper [data-paso]');
    if (!boton) return;
    const ruta = boton.closest('.stepper').dataset.ruta.split('.');
    const campo = PASOS.flatMap((g) => g.campos).find((f) => f.ruta.join('.') === ruta.join('.'));
    const actual = Number(leer(borrador, ruta)) || 0;
    const nuevo = Math.min(campo.max, Math.max(campo.min, actual + Number(boton.dataset.paso) * campo.paso));
    escribir(borrador, ruta, Math.round(nuevo));
    const stepper = boton.closest('.stepper');
    stepper.querySelector('output').textContent = textoValor(campo, nuevo, ctx);
    stepper.querySelector('[data-paso="-1"]').disabled = nuevo <= campo.min;
    stepper.querySelector('[data-paso="1"]').disabled = nuevo >= campo.max;
  });

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (borrador.diasSemana.length !== borrador.diasPorSemana) {
      const faltan = borrador.diasPorSemana - borrador.diasSemana.length;
      ctx.toast(`Te ${faltan === 1 ? 'falta' : 'faltan'} ${faltan} ${faltan === 1 ? 'día' : 'días'} por elegir.`);
      return;
    }
    const anterior = storage.getConfig();
    const eraInicial = anterior.configurado !== true;
    const aGuardar = { ...borrador, configurado: true };
    if (!aGuardar.fechaInicio) aGuardar.fechaInicio = fechaLocal(new Date());
    // Pasar a principiante desde Ajustes empieza un periodo de adaptación nuevo.
    if (aGuardar.nivel === 'principiante' && storage.getConfig().nivel !== 'principiante') {
      aGuardar.fechaInicio = fechaLocal(new Date());
    }

    // ¿Había una rutina válida? Si el número de días cambia, se crea una nueva.
    const rutinaPrevia = storage.get(storage.CLAVES.rutina, null);
    const habiaRutina = Boolean(rutinaPrevia) && !planner.necesitaRegenerar(rutinaPrevia, anterior);
    const regenerar = !habiaRutina || planner.necesitaRegenerar(rutinaPrevia, aGuardar);
    if (habiaRutina && regenerar && !window.confirm(
      'Cambiar el número de días crea una rutina nueva y se perderán los cambios que hiciste en ella. ¿Continuar?')) {
      return;
    }

    if (!storage.setConfig(aGuardar)) {
      ctx.toast('No se han podido guardar los ajustes.');
      return;
    }
    const config = storage.getConfig();
    let rutinaOk = true;
    try {
      if (regenerar) rutinaOk = ctx.guardarRutina(planner.generarRutina(config));
      else rutinaOk = ctx.guardarRutina(planner.reasignarDias(rutinaPrevia, config));
    } catch (e) {
      console.error('[config] No se ha podido preparar la rutina', e);
      rutinaOk = false;
    }
    if (!rutinaOk || !ctx.obtenerRutina()) {
      ctx.toast('Ajustes guardados, pero no se ha podido crear la rutina.');
    } else if (eraInicial) {
      ctx.navegar('hoy');
      ctx.toast('¡Rutina lista!');
      return;
    } else {
      ctx.toast(regenerar && habiaRutina ? 'Ajustes guardados. Rutina nueva creada.' : 'Ajustes guardados.');
    }
    borrador = config;
    pintar(contenedor, ctx);
  });

  contenedor.querySelector('[data-accion="restablecer"]').addEventListener('click', () => {
    const base = storage.configPorDefecto();
    borrador = { ...base, configurado: borrador.configurado, fechaInicio: borrador.fechaInicio };
    pintar(contenedor, ctx);
    ctx.toast('Valores estimados puestos. Pulsa Guardar para aplicarlos.');
  });

  contenedor.querySelector('[data-accion="exportar"]').addEventListener('click', () => {
    try {
      const blob = new Blob([storage.exportar()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `microapp-gym-${fechaLocal(new Date())}.json`;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ctx.toast('Copia exportada.');
    } catch (e) {
      console.error('[config] Error al exportar', e);
      ctx.toast('No se ha podido exportar.');
    }
  });

  const archivo = contenedor.querySelector('[data-accion="archivo"]');
  contenedor.querySelector('[data-accion="importar"]').addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', async () => {
    const fichero = archivo.files && archivo.files[0];
    if (!fichero) return;
    try {
      const resultado = storage.importar(await fichero.text());
      if (resultado.ok) {
        borrador = storage.getConfig();
        pintar(contenedor, ctx);
        ctx.toast('Datos importados.');
      } else {
        ctx.toast(resultado.error, 4500);
      }
    } catch (e) {
      console.error('[config] Error al importar', e);
      ctx.toast('No se ha podido leer el archivo.');
    } finally {
      archivo.value = '';
    }
  });
}

function fechaLocal(fecha) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

export function render(contenedor, ctx) {
  // Cada vez que se abre Ajustes se parte de lo guardado.
  borrador = ctx.storage.getConfig();
  pintar(contenedor, ctx);
}
