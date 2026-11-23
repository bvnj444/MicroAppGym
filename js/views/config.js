/*
 * Pantalla Ajustes / configuración inicial (#ajustes, se abre desde Hoy).
 * Edita la configuración del contrato de storage.js (pesos en gramos enteros)
 * e incluye exportar e importar datos en JSON.
 */

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

let borrador = null; // copia de trabajo de la configuración mientras se edita

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
      <button type="button" class="screen__action btn btn--icon btn--ghost" data-accion="volver" aria-label="Cerrar ajustes">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </header>

    <form class="stack" novalidate>
      <section class="card stack" aria-label="Semana">
        <h2 class="card__title">Semana</h2>
        ${segmentado({ id: 'cfg-dias-semana-n', etiqueta: 'Días por semana', opciones:
          [3, 4, 5].map((n) => ({ valor: n, texto: String(n), elegida: c.diasPorSemana === n })) })}
        ${segmentado({ id: 'cfg-dias', etiqueta: `Qué días (elige ${c.diasPorSemana})`, multiple: true, opciones:
          DIAS.map(([n, letra, nombre]) => ({ valor: n, texto: letra, titulo: nombre, elegida: c.diasSemana.includes(n) })) })}
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

      <button type="submit" class="btn btn--primary btn--block">Guardar ajustes</button>
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

  contenedor.querySelector('[data-accion="volver"]').addEventListener('click', () => ctx.volver());

  // Segmentados
  form.addEventListener('click', (evento) => {
    const opcion = evento.target.closest('.segmented__option');
    if (!opcion) return;
    const grupo = opcion.closest('[data-grupo]').dataset.grupo;
    const valor = opcion.dataset.valor;
    if (grupo === 'cfg-dias-semana-n') {
      borrador.diasPorSemana = Number(valor);
    } else if (grupo === 'cfg-dias') {
      const n = Number(valor);
      const dias = new Set(borrador.diasSemana);
      if (dias.has(n)) dias.delete(n); else dias.add(n);
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
      ctx.toast(`Elige exactamente ${borrador.diasPorSemana} días de la semana.`);
      return;
    }
    const aGuardar = { ...borrador, configurado: true };
    if (!aGuardar.fechaInicio) aGuardar.fechaInicio = fechaLocal(new Date());
    if (storage.setConfig(aGuardar)) {
      borrador = storage.getConfig();
      ctx.toast('Ajustes guardados.');
      pintar(contenedor, ctx);
    } else {
      ctx.toast('No se han podido guardar los ajustes.');
    }
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
