/*
 * Pantalla Ajustes / configuración inicial (#ajustes, se abre desde Hoy).
 * Edita la configuración del contrato de storage.js (pesos en gramos enteros)
 * e incluye exportar e importar datos en JSON.
 * Al guardar mantiene la rutina al día (planner.js):
 *  - cambia el número de días -> rutina nueva (con confirmación si ya había una);
 *  - cambian solo los días o el nivel -> planner.reasignarDias, sin preguntar.
 * En la configuración inicial, tras guardar, navega a Hoy.
 * "Aviso del descanso" y "Avisos de racha" se guardan al momento (evento 'mag:config').
 * Avisos de racha (js/notificaciones.js): al activarlos se pide el permiso; si se deniega el
 * interruptor queda apagado y se explica cómo permitirlo en Chrome.
 * Exporta descargarCopia(storage) -> boolean (también la usa el aviso de memoria llena de app.js).
 * Si storage.almacenamientoLleno(), la tarjeta "Copia de seguridad" lo avisa.
 */

import * as planner from '../planner.js';
import * as timer from '../timer.js';
import * as notif from '../notificaciones.js';

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

      <section class="card stack" aria-label="Aviso del descanso">
        <h2 class="card__title">Aviso del descanso</h2>
        <p class="card__meta">Se guarda al momento. El destello en pantalla sale siempre.</p>
        ${segmentado({ id: 'cfg-aviso-modo', etiqueta: 'Al terminar el descanso', opciones: [
          { valor: 'ambos', texto: 'Ambos', titulo: 'Sonido y vibración', elegida: c.avisos.modo === 'ambos' },
          { valor: 'sonido', texto: 'Sonido', titulo: 'Solo sonido', elegida: c.avisos.modo === 'sonido' },
          { valor: 'vibracion', texto: 'Vibración', titulo: 'Solo vibración', elegida: c.avisos.modo === 'vibracion' },
        ] })}
        <label class="row">
          <input type="checkbox" data-accion="pitar-bloqueado"${c.avisos.pitarBloqueado ? ' checked' : ''}${c.avisos.modo === 'vibracion' ? ' disabled' : ''}>
          <span>Pitar aunque el móvil esté bloqueado</span>
        </label>
        <p class="muted">${c.avisos.modo === 'vibracion'
          ? 'Con «Solo vibración» no hay pitido. Con el móvil bloqueado Chrome no deja vibrar: verás el aviso al desbloquearlo.'
          : 'Mantiene el sonido de la app activo durante el descanso. Verás un control de reproducción en las notificaciones mientras dura. La vibración no funciona con el móvil bloqueado.'}</p>
        <button type="button" class="btn btn--secondary btn--block" data-accion="probar-aviso">Probar aviso</button>
      </section>

      ${inicial ? '' : tarjetaRacha(c)}

      <button type="submit" class="btn btn--primary btn--block">${inicial ? 'Crear mi rutina' : 'Guardar ajustes'}</button>
      <button type="button" class="btn btn--ghost btn--block" data-accion="restablecer">Volver a los valores estimados</button>

      <section class="card stack" aria-label="Copia de seguridad">
        <h2 class="card__title">Copia de seguridad</h2>
        <p class="card__meta">Guarda tus datos en un archivo JSON o recupéralos desde uno.</p>
        ${ctx.storage.almacenamientoLleno && ctx.storage.almacenamientoLleno()
          ? '<p role="alert"><strong style="color: var(--accent-2)">Memoria llena.</strong> El navegador no deja guardar más y algo no se ha guardado. Exporta tus datos ahora para no perderlos.</p>'
          : ''}
        <button type="button" class="btn btn--secondary btn--block" data-accion="exportar">Exportar datos</button>
        <button type="button" class="btn btn--secondary btn--block" data-accion="importar">Importar datos</button>
        <input type="file" class="visually-hidden" accept="application/json,.json" data-accion="archivo" tabindex="-1" aria-hidden="true">
      </section>
    </form>
  `;

  conectar(contenedor, ctx);
}

const TEXTO_BLOQUEADO = 'Las notificaciones están bloqueadas para esta app. Para permitirlas: mantén pulsado el icono de MicroApp Gym → Información de la app → Notificaciones → Permitir (en Chrome sin instalar: candado junto a la dirección → Permisos → Notificaciones). Después vuelve a activar este interruptor.';

function tarjetaRacha(c) {
  const p = notif.permiso();
  const activo = c.notificaciones.racha === true && p === 'granted';
  let estado = '';
  if (p === 'no-disponible') estado = 'Este navegador no permite notificaciones (hace falta Chrome con HTTPS o localhost).';
  else if (p === 'denied') estado = TEXTO_BLOQUEADO;
  return `
      <section class="card stack" aria-label="Avisos de racha">
        <h2 class="card__title">Avisos de racha</h2>
        <p class="card__meta">Al terminar una sesión, al llegar a un hito y, en tus días de entrenamiento, un recordatorio si aún no has entrenado.</p>
        <label class="row cfg-switch">
          <input type="checkbox" role="switch" data-accion="avisos-racha"${activo ? ' checked' : ''}${p === 'no-disponible' ? ' disabled' : ''}>
          <span>Avisos de racha</span>
        </label>
        <p class="muted" data-racha-estado${estado ? '' : ' hidden'}>${estado}</p>
        <p class="muted" data-racha-periodico${activo ? '' : ' hidden'}>Comprobando el recordatorio…</p>
        <p class="muted">El recordatorio de los días de entrenamiento llega a una hora aproximada (lo decide Chrome). La hora exacta llegará con la app para Android (Fase 9).</p>
        <button type="button" class="btn btn--secondary btn--block" data-accion="probar-notificacion"${p === 'no-disponible' ? ' disabled' : ''}>Probar notificación</button>
      </section>`;
}

const TEXTO_PERIODICO = {
  registrado: 'Recordatorio de los días de entrenamiento: activado.',
  'sin-registrar': 'Recordatorio de los días de entrenamiento: activado.',
  'sin-permiso': 'Chrome aún no permite el recordatorio en segundo plano (suele hacerlo con la app instalada y usada a menudo). Mientras tanto, el aviso sale al abrir la app ese día.',
  'no-disponible': 'El recordatorio en segundo plano no está disponible en este navegador. El aviso sale al abrir la app ese día.',
};

async function pintarEstadoPeriodico(contenedor, estadoYa = null) {
  const p = contenedor.querySelector('[data-racha-periodico]');
  if (!p || p.hidden) return;
  const estado = estadoYa || await notif.estadoPeriodico();
  if (p.isConnected) p.textContent = TEXTO_PERIODICO[estado] || TEXTO_PERIODICO['no-disponible'];
}

function conectarRacha(contenedor, ctx) {
  const interruptor = contenedor.querySelector('[data-accion="avisos-racha"]');
  if (!interruptor) return;
  pintarEstadoPeriodico(contenedor);

  interruptor.addEventListener('change', async () => {
    interruptor.disabled = true;
    let periodico = null;
    if (interruptor.checked) {
      const p = await notif.pedirPermiso();
      if (p !== 'granted') {
        guardarNotificaciones(ctx, { racha: false });
        ctx.toast(p === 'denied' ? 'Permiso denegado: los avisos siguen apagados.' : 'Sin permiso: los avisos siguen apagados.', 4000);
      } else {
        guardarNotificaciones(ctx, { racha: true });
        periodico = await notif.registrarPeriodico();
        ctx.toast('Avisos de racha activados.');
      }
    } else {
      guardarNotificaciones(ctx, { racha: false });
      await notif.desregistrarPeriodico();
      ctx.toast('Avisos de racha desactivados.');
    }
    notif.actualizarDatos(ctx.storage, ctx.hoy());
    if (!contenedor.contains(interruptor)) return;
    pintar(contenedor, ctx);
    if (periodico) pintarEstadoPeriodico(contenedor, periodico);
    contenedor.querySelector('[data-accion="avisos-racha"]')?.focus();
  });

  contenedor.querySelector('[data-accion="probar-notificacion"]').addEventListener('click', async () => {
    const p = await notif.pedirPermiso();
    if (p !== 'granted') {
      ctx.toast(p === 'denied' ? 'Las notificaciones están bloqueadas: mira cómo permitirlas en esta tarjeta.' : 'Sin permiso para notificar.', 4500);
      pintar(contenedor, ctx);
      return;
    }
    const ok = await notif.mostrar('🔥 Así se verán tus avisos de racha', {
      body: 'Tócala para abrir la pantalla Hoy.',
      tag: 'mag-prueba',
    });
    if (!ok) ctx.toast('No se ha podido mostrar la notificación.');
  });
}

function conectar(contenedor, ctx) {
  const { storage } = ctx;
  const form = contenedor.querySelector('form');
  conectarRacha(contenedor, ctx);

  contenedor.querySelector('[data-accion="volver"]')?.addEventListener('click', () => ctx.volver());

  contenedor.querySelector('[data-accion="pitar-bloqueado"]').addEventListener('change', (evento) => {
    guardarAvisos(ctx, { ...borrador.avisos, pitarBloqueado: evento.target.checked });
    pintar(contenedor, ctx);
    contenedor.querySelector('[data-accion="pitar-bloqueado"]')?.focus();
  });
  contenedor.querySelector('[data-accion="probar-aviso"]').addEventListener('click', () => {
    if (typeof timer.probarAviso === 'function') timer.probarAviso();
  });

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
    } else if (grupo === 'cfg-aviso-modo') {
      guardarAvisos(ctx, { ...borrador.avisos, modo: valor });
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
    window.dispatchEvent(new CustomEvent('mag:config'));
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
    // Los avisos se guardan al momento y no son "valores estimados": se conservan.
    borrador = {
      ...base, configurado: borrador.configurado, fechaInicio: borrador.fechaInicio,
      avisos: borrador.avisos, notificaciones: borrador.notificaciones,
    };
    pintar(contenedor, ctx);
    ctx.toast('Valores estimados puestos. Pulsa Guardar para aplicarlos.');
  });

  contenedor.querySelector('[data-accion="exportar"]').addEventListener('click', () => {
    ctx.toast(descargarCopia(storage) ? 'Copia exportada.' : 'No se ha podido exportar.');
  });

  const archivo = contenedor.querySelector('[data-accion="archivo"]');
  contenedor.querySelector('[data-accion="importar"]').addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', async () => {
    const fichero = archivo.files && archivo.files[0];
    if (!fichero) return;
    try {
      const texto = await fichero.text();
      // Primero se comprueba la copia sin tocar nada y se enseña lo que trae.
      const analisis = storage.analizarCopia(texto);
      if (!analisis.ok) {
        ctx.toast(analisis.error, 4500);
        return;
      }
      if (!(await confirmarImportacion(contenedor, analisis.resumen, storage))) return;
      const resultado = storage.importar(texto);
      if (resultado.ok) {
        borrador = storage.getConfig();
        pintar(contenedor, ctx);
        // Rehace los datos del recordatorio (mag-datos) y el registro periódico con lo importado.
        window.dispatchEvent(new CustomEvent('mag:config'));
        const n = resultado.resumen.descartadas;
        ctx.toast(n ? `Datos importados. Se ${n === 1 ? 'ha descartado 1 sesión no válida' : `han descartado ${n} sesiones no válidas`}.` : 'Datos importados.', n ? 4500 : undefined);
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

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Panel propio (<dialog class="sheet">) que enseña lo que trae la copia y avisa de que
 * reemplazará lo actual. -> Promise<boolean> (true = importar).
 */
function confirmarImportacion(contenedor, resumen, storage) {
  const trae = [];
  const reemplaza = [];
  const conserva = [];
  if (resumen.sesiones !== null) {
    trae.push(plural(resumen.sesiones, 'sesión en el historial', 'sesiones en el historial')
      + (resumen.descartadas ? ` (se ${resumen.descartadas === 1 ? 'descarta 1 no válida' : `descartan ${resumen.descartadas} no válidas`})` : ''));
    const actuales = storage.get(storage.CLAVES.sesiones, []);
    reemplaza.push(`tu historial (${plural(Array.isArray(actuales) ? actuales.length : 0, 'sesión', 'sesiones')})`);
  } else conserva.push('tu historial');
  if (resumen.diasRutina !== null) {
    trae.push(resumen.diasRutina ? `Rutina de ${plural(resumen.diasRutina, 'día', 'días')}` : 'Sin rutina');
    reemplaza.push('tu rutina');
  } else conserva.push('tu rutina');
  if (resumen.config) {
    trae.push('Configuración y ajustes');
    reemplaza.push('tus ajustes');
  } else conserva.push('tus ajustes');
  if (resumen.sesionActiva) trae.push('Una sesión a medias');
  if (resumen.exportadoEn) {
    const fecha = new Date(resumen.exportadoEn).toLocaleString('es-ES', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    trae.push(`Exportada el ${fecha}`);
  }
  const lista = (items) => items.join(', ').replace(/, ([^,]*)$/, ' y $1');

  const panel = document.createElement('dialog');
  panel.className = 'sheet';
  panel.setAttribute('aria-labelledby', 'cfg-importar-titulo');
  panel.innerHTML = `
    <div class="sheet__handle" aria-hidden="true"></div>
    <header class="sheet__header">
      <h2 class="sheet__title" id="cfg-importar-titulo">¿Importar esta copia?</h2>
    </header>
    <div class="sheet__body">
      <div class="stack">
        <p>La copia trae:</p>
        <ul data-trae style="padding-left: 1.25rem; list-style: disc"></ul>
      </div>
      <p data-reemplaza></p>
      <p class="muted" data-conserva></p>
    </div>
    <footer class="sheet__footer">
      <button type="button" class="btn btn--danger btn--block" data-respuesta="si">Importar y reemplazar</button>
      <button type="button" class="btn btn--ghost btn--block" data-respuesta="no">Cancelar</button>
    </footer>`;
  const ul = panel.querySelector('[data-trae]');
  for (const t of trae) {
    const li = document.createElement('li');
    li.textContent = t;
    ul.append(li);
  }
  const pReemplaza = panel.querySelector('[data-reemplaza]');
  const fuerte = document.createElement('strong');
  fuerte.textContent = 'Reemplazará lo que tienes ahora: ';
  pReemplaza.append(fuerte, `${lista(reemplaza) || 'solo datos internos'}. No se puede deshacer; si dudas, exporta antes tus datos.`);
  const pConserva = panel.querySelector('[data-conserva]');
  const varios = conserva.length > 1 || conserva[0] === 'tus ajustes';
  if (conserva.length) pConserva.textContent = `Se conserva${varios ? 'n' : ''} ${lista(conserva)}: la copia no ${varios ? 'los' : 'lo'} trae.`;
  else pConserva.remove();

  return new Promise((resolver) => {
    let hecho = false;
    const cerrar = (respuesta) => {
      if (hecho) return;
      hecho = true;
      if (panel.open) panel.close();
      panel.remove();
      resolver(respuesta);
    };
    panel.addEventListener('click', (e) => {
      if (e.target === panel) { cerrar(false); return; }
      const boton = e.target.closest('[data-respuesta]');
      if (boton) cerrar(boton.dataset.respuesta === 'si');
    });
    // Botón atrás de Android / Escape.
    panel.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(false); });
    // Si app.js lo cierra al cambiar de pantalla, cuenta como cancelar.
    panel.addEventListener('close', () => cerrar(false));
    contenedor.append(panel);
    if (typeof panel.showModal === 'function') panel.showModal();
    else panel.setAttribute('open', '');
    panel.querySelector('[data-respuesta="no"]').focus();
  });
}

/** Los avisos del descanso se guardan al momento (sin pasar por "Guardar ajustes"). */
function guardarAvisos(ctx, avisos) {
  borrador.avisos = avisos;
  const guardada = ctx.storage.getConfig();
  if (!ctx.storage.setConfig({ ...guardada, avisos })) {
    ctx.toast('No se ha podido guardar el aviso.');
    return;
  }
  window.dispatchEvent(new CustomEvent('mag:config'));
}

/** Los avisos de racha también se guardan al momento. */
function guardarNotificaciones(ctx, notificaciones) {
  borrador.notificaciones = notificaciones;
  const guardada = ctx.storage.getConfig();
  if (!ctx.storage.setConfig({ ...guardada, notificaciones })) {
    ctx.toast('No se ha podido guardar el ajuste de avisos.');
    return;
  }
  window.dispatchEvent(new CustomEvent('mag:config'));
}

function fechaLocal(fecha) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
}

/** Descarga todos los datos en un archivo JSON. No escribe en localStorage (funciona aunque esté lleno). */
export function descargarCopia(storage) {
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
    return true;
  } catch (e) {
    console.error('[config] Error al exportar', e);
    return false;
  }
}

export function render(contenedor, ctx) {
  // Cada vez que se abre Ajustes se parte de lo guardado.
  borrador = ctx.storage.getConfig();
  pintar(contenedor, ctx);
}
