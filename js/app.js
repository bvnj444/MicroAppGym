/*
 * MicroApp Gym — app.js
 * Arranque, registro del service worker y navegación por pestañas sin recargar.
 *
 * Navegación: cada pantalla es un <section class="screen" data-pantalla="...">.
 * La activa lleva .is-active; el resto lleva el atributo inert. La ruta va en el
 * hash (#hoy, #rutina, #ejercicios, #historial, #ajustes), así que el botón
 * "atrás" de Android vuelve a la pantalla anterior.
 *
 * Cada vista exporta render(contenedor, ctx). render se vuelve a llamar CADA VEZ que
 * se muestra la pantalla, así que debe leer los datos frescos (storage, ctx.config()...).
 * ctx = {
 *   storage,               // módulo js/storage.js
 *   navegar(ruta),         // cambia de pantalla ('hoy', 'ajustes'...)
 *   volver(),              // atrás (o a Hoy si no hay historial dentro de la app)
 *   toast(mensaje, ms?),   // aviso breve
 *   kg(gramos),            // '10,75 kg'
 *   hoy(),                 // 'AAAA-MM-DD' de hoy en hora local
 *   config(),              // storage.getConfig()
 *   obtenerRutina(),       // rutina guardada (CLAVES.rutina) lista para usar, o null:
 *                          //  - configurado === false -> null
 *                          //  - sin rutina o planner.necesitaRegenerar(rutina, config)
 *                          //    -> planner.generarRutina(config), se guarda y se devuelve
 *                          //  - días de la rutina distintos de config.diasSemana
 *                          //    -> planner.reasignarDias(rutina, config), se guarda y se devuelve
 *   guardarRutina(rutina), // la guarda en CLAVES.rutina; true | false
 *   abrirEjercicio(id)     // va a Ejercicios y abre el detalle de ese ejercicio
 *   ejercicioPendiente     // (interno) id que Ejercicios abre al pintarse; lo pone a null
 * }
 *
 * Arranque: si la configuración no está terminada (configurado === false) se abre
 * Ajustes en modo "Configuración inicial"; la barra de pestañas sigue visible.
 */

import * as storage from './storage.js';
import { kg } from './data/equipment.js';
import * as planner from './planner.js';
import * as hoy from './views/hoy.js';
import * as rutina from './views/rutina.js';
import * as ejercicios from './views/ejercicios.js';
import * as historial from './views/historial.js';
import * as config from './views/config.js';
// Se importa al arrancar también para que registre su oyente del cronómetro
// (la plancha se apunta aunque se esté en otra pantalla).
import * as sesion from './views/sesion.js';

const VISTAS = { hoy, rutina, ejercicios, historial, ajustes: config, sesion };
const PESTANAS = ['hoy', 'rutina', 'ejercicios', 'historial'];
const RUTA_INICIAL = 'hoy';

let rutaActual = null;

const ctx = {
  storage,
  navegar(ruta) {
    if (ruta === rutaActual) return;
    // Entrada nueva en el historial, marcada como interna para que volver() sepa
    // que puede usar history.back() sin salir de la app.
    history.pushState({ interna: true }, '', '#' + ruta);
    mostrar(ruta);
  },
  volver() {
    if (history.state && history.state.interna) history.back();
    else {
      history.replaceState(null, '', '#' + RUTA_INICIAL);
      mostrar(RUTA_INICIAL);
    }
  },
  toast: mostrarToast,
  kg, // un único formato de kg para toda la app (js/data/equipment.js)
  hoy: fechaLocalHoy,
  config: () => storage.getConfig(),
  obtenerRutina,
  guardarRutina,
  ejercicioPendiente: null,
  abrirEjercicio(id) {
    ctx.ejercicioPendiente = id;
    if (rutaActual === 'ejercicios') mostrar('ejercicios');
    else ctx.navegar('ejercicios');
  },
};

/* ---------- Fecha y rutina ---------- */

function fechaLocalHoy() {
  const f = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
}

function guardarRutina(rutina) {
  return storage.set(storage.CLAVES.rutina, rutina);
}

/** Días de la semana (ISO, ordenados) en los que cae la rutina. */
function diasDeRutina(rutina) {
  const dias = rutina.plantillaId === '3-dias'
    ? (Array.isArray(rutina.huecos) ? rutina.huecos : [])
    : rutina.dias.map((d) => d.diaSemana);
  return [...dias].sort((a, b) => a - b);
}

function obtenerRutina() {
  const config = storage.getConfig();
  if (config.configurado !== true) return null;
  let rutina = storage.get(storage.CLAVES.rutina, null);
  try {
    if (!rutina || planner.necesitaRegenerar(rutina, config)) {
      rutina = planner.generarRutina(config);
      guardarRutina(rutina);
    } else {
      const esperados = [...config.diasSemana].sort((a, b) => a - b).join();
      if (diasDeRutina(rutina).join() !== esperados) {
        rutina = planner.reasignarDias(rutina, config);
        guardarRutina(rutina);
      }
    }
  } catch (e) {
    console.error('[app] No se ha podido preparar la rutina', e);
    return null;
  }
  return rutina;
}

function rutaDesdeHash() {
  const ruta = decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim();
  return Object.hasOwn(VISTAS, ruta) ? ruta : RUTA_INICIAL;
}

function mostrar(ruta) {
  const pantallas = document.querySelectorAll('.screen[data-pantalla]');
  let destino = null;
  for (const pantalla of pantallas) {
    const activa = pantalla.dataset.pantalla === ruta;
    pantalla.classList.toggle('is-active', activa);
    pantalla.toggleAttribute('inert', !activa);
    // Un panel (<dialog>) abierto no se queda encima al cambiar de pantalla.
    if (!activa) for (const d of pantalla.querySelectorAll('dialog[open]')) d.close();
    if (activa) destino = pantalla;
  }

  // Ajustes y Sesión no tienen pestaña: se resalta desde donde se abren.
  const pestana = PESTANAS.includes(ruta) ? ruta : (ruta === 'sesion' ? 'rutina' : 'hoy');
  for (const item of document.querySelectorAll('.tabbar__item[data-tab]')) {
    const activa = item.dataset.tab === pestana;
    item.classList.toggle('is-active', activa);
    if (activa) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }

  if (!destino) return;
  try {
    VISTAS[ruta].render(destino, ctx);
  } catch (e) {
    console.error(`[app] Error al pintar la vista "${ruta}"`, e);
    destino.innerHTML = '<div class="empty-state"><p>No se ha podido mostrar esta pantalla.</p></div>';
  }

  const previa = rutaActual;
  rutaActual = ruta;
  document.title = ruta === RUTA_INICIAL ? 'MicroApp Gym' : `${tituloDe(destino)} · MicroApp Gym`;
  if (previa !== null && previa !== ruta) {
    window.scrollTo(0, 0);
    const titulo = destino.querySelector('.screen__title');
    if (titulo) {
      titulo.setAttribute('tabindex', '-1');
      titulo.focus({ preventScroll: true });
    }
  }
}

function tituloDe(pantalla) {
  return pantalla.querySelector('.screen__title')?.textContent.trim() || pantalla.getAttribute('aria-label') || '';
}

/* ---------- Aviso breve ---------- */

let temporizadorToast = 0;
function mostrarToast(mensaje, ms = 2800) {
  const toast = document.querySelector('.toast');
  if (!toast) return;
  toast.textContent = mensaje;
  toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { toast.hidden = true; }, ms);
}

/* ---------- Service worker ---------- */

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    console.info('[app] Service worker no disponible (hace falta HTTPS o localhost).');
    return;
  }
  // Si ya había un SW controlando la página, un SW nuevo es una actualización.
  const habiaControlador = Boolean(navigator.serviceWorker.controller);
  const registrar = async () => {
    try {
      const registro = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      registro.addEventListener('updatefound', () => {
        const nuevo = registro.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'activated' && habiaControlador) {
            mostrarToast('Hay una versión nueva. Cierra y vuelve a abrir la app para usarla.', 5000);
          }
        });
      });
    } catch (e) {
      console.error('[app] No se pudo registrar el service worker', e);
    }
  };
  // Se registra tras la carga para no competir con la primera pintura.
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar, { once: true });
}

/* ---------- Arranque ---------- */

/** Cuenta las aperturas de la app en CLAVES.meta (aperturas, ultimaApertura). */
function registrarApertura() {
  const meta = storage.get(storage.CLAVES.meta, {}) || {};
  storage.set(storage.CLAVES.meta, {
    ...meta,
    ultimaApertura: new Date().toISOString(),
    aperturas: (Number(meta.aperturas) || 0) + 1,
  });
}

async function arrancar() {
  try {
    const estado = await storage.init();
    if (!estado.disponible) {
      mostrarToast('No se puede guardar en este navegador: los datos se perderán al cerrar.', 5000);
    }
  } catch (e) {
    console.error('[app] Error al iniciar el guardado', e);
  }
  registrarApertura();

  // Los enlaces de la barra navegan con pushState (sin recargar).
  document.querySelector('.tabbar')?.addEventListener('click', (evento) => {
    const item = evento.target.closest('.tabbar__item[data-tab]');
    if (!item) return;
    evento.preventDefault();
    if (item.dataset.tab === rutaActual) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    ctx.navegar(item.dataset.tab);
  });

  // Atrás/adelante de Android y cambios manuales del hash.
  const alCambiarHistorial = () => {
    const ruta = rutaDesdeHash();
    if (ruta !== rutaActual) mostrar(ruta);
  };
  window.addEventListener('popstate', alCambiarHistorial);
  window.addEventListener('hashchange', alCambiarHistorial);

  // Primera vez: se abre Ajustes en modo "Configuración inicial".
  const ruta = storage.getConfig().configurado === true ? rutaDesdeHash() : 'ajustes';
  if (location.hash !== '#' + ruta) history.replaceState(null, '', '#' + ruta);
  mostrar(ruta);
}

registrarServiceWorker();
arrancar();
