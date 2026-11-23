/*
 * MicroApp Gym — app.js
 * Arranque, registro del service worker y navegación por pestañas sin recargar.
 *
 * Navegación: cada pantalla es un <section class="screen" data-pantalla="...">.
 * La activa lleva .is-active; el resto lleva el atributo inert. La ruta va en el
 * hash (#hoy, #rutina, #ejercicios, #historial, #ajustes), así que el botón
 * "atrás" de Android vuelve a la pantalla anterior.
 *
 * Cada vista exporta render(contenedor, ctx). ctx = {
 *   storage,               // módulo js/storage.js
 *   navegar(ruta),         // cambia de pantalla ('hoy', 'ajustes'...)
 *   volver(),              // atrás (o a Hoy si no hay historial dentro de la app)
 *   toast(mensaje),        // aviso breve
 *   kg(gramos)             // '10,75 kg'
 * }
 */

import * as storage from './storage.js';
import { kg } from './data/equipment.js';
import * as hoy from './views/hoy.js';
import * as rutina from './views/rutina.js';
import * as ejercicios from './views/ejercicios.js';
import * as historial from './views/historial.js';
import * as config from './views/config.js';

const VISTAS = { hoy, rutina, ejercicios, historial, ajustes: config };
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
};

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
    if (activa) destino = pantalla;
  }

  // La pestaña de Ajustes no existe: se resalta Hoy, desde donde se abre.
  const pestana = PESTANAS.includes(ruta) ? ruta : 'hoy';
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

async function arrancar() {
  try {
    const estado = await storage.init();
    if (!estado.disponible) {
      mostrarToast('No se puede guardar en este navegador: los datos se perderán al cerrar.', 5000);
    }
  } catch (e) {
    console.error('[app] Error al iniciar el guardado', e);
  }

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

  const ruta = rutaDesdeHash();
  if (location.hash !== '#' + ruta) history.replaceState(null, '', '#' + ruta);
  mostrar(ruta);
}

registrarServiceWorker();
arrancar();
