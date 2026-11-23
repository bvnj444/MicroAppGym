# MicroApp Gym

App web instalable (PWA) para planificar y seguir una rutina de gimnasio en casa con un set de mancuernas ajustables 2 en 1. Funciona sin conexión y guarda los datos en el móvil. Está hecha con HTML, CSS y JavaScript sin framework ni compilación. El plan completo está en [PLAN.md](PLAN.md).

## Probarla en el ordenador

Desde la carpeta del proyecto, levanta un servidor local (abrir `index.html` con doble clic no sirve, porque los módulos y el service worker necesitan un servidor):

```bash
npx serve -l 8080
# o bien
python -m http.server 8080
```

Abre `http://localhost:8080`. Para simular un móvil: F12 → icono de dispositivo (360 px de ancho).

## Probarla en el Android durante el desarrollo (USB)

La IP de la Wi-Fi (`http://192.168.x.x`) **no** sirve: el service worker y la instalación necesitan HTTPS o `localhost`.

1. En el móvil: Ajustes → Información del teléfono → pulsa 7 veces "Número de compilación". Después, en Opciones de desarrollador, activa **Depuración USB**.
2. Conecta el móvil por USB al PC y acepta el aviso de depuración.
3. Con el servidor del apartado anterior en marcha, abre `chrome://inspect` en Chrome del PC.
4. Pulsa **Port forwarding…**, añade `8080` → `localhost:8080` y marca "Enable port forwarding".
5. En Chrome del móvil abre `http://localhost:8080`. En `chrome://inspect` → **inspect** verás la consola del móvil.

## Publicarla en GitHub Pages (uso diario)

1. Crea un repositorio en GitHub (por ejemplo `microapp-gym`) y sube el contenido de esta carpeta a la rama `main`.
2. En el repositorio: Settings → Pages → Source: **Deploy from a branch** → `main` / `(root)` → Save.
3. En un par de minutos estará en `https://<tu-usuario>.github.io/microapp-gym/`.
4. Ábrela en Chrome del Android → menú ⋮ → **Instalar aplicación**.

Todas las rutas son relativas, así que funciona igual dentro de `/microapp-gym/`.

**Al publicar cambios:** sube la versión de la caché en `sw.js` (`gym-v1` → `gym-v2`) y añade a su lista los archivos nuevos. Si no, el móvil seguirá usando los archivos antiguos.

## Copia de seguridad

En Hoy → Ajustes (rueda dentada) → **Exportar datos** descarga un JSON con todo. **Importar datos** lo recupera.
