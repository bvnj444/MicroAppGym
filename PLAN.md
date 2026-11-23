# MicroApp Gym — Plan de implementación

> Estado: **Fases 1, 2 y 3 terminadas y revisadas por qa-movil. Publicada en https://bvnj444.github.io/MicroAppGym/. Siguiente: Fase 4 (animaciones SVG).**
> Última actualización: 23/11/2026 (revisión 2: correcciones de los subagentes experto-ejercicios, logica-entrenamiento y qa-movil)

---

## 0. Objetivo

Microapp para móvil para planificar y seguir una rutina de gimnasio en casa adaptada al equipo que tiene el usuario. Debe:

- Generar la rutina según el equipo disponible (más ejercicios con el peso corporal).
- Mostrar cada ejercicio con **animación** (preferente) y texto: técnica, **para qué sirve** y **qué músculos trabaja**.
- Incluir un **cronómetro de descanso** entre series que avise solo (sin tener que mirar el móvil).
- Permitir marcar cada serie como **"✓ Serie hecha"**.
- Tener un diseño cuidado (lo decide el desarrollador).

---

## 1. Perfil y equipo del usuario

| Dato | Valor |
|---|---|
| Objetivo | Ganar músculo (hipertrofia). **Fijo**: no se pregunta en la configuración. |
| Días disponibles | 4–5 por semana → **rutina predeterminada de 4 días** (la de 5 días se elige en la configuración) |
| Móvil | **Android** (Chrome) |
| Banco | No |
| Barra de dominadas | No |

**Equipo:** set de mancuernas ajustables 2 en 1 (30 kg en total, discos de plástico). Se usa como **2 mancuernas** o, uniéndolas con el conector, como **una barra recta**.

- 2 mangos de mancuerna
- 1 conector de barra
- 4 tuercas de fijación
- 8 discos de 1,25 kg
- 4 discos de 2 kg
- 4 discos de 2,5 kg
- **28 kg en discos** (10 + 8 + 10)

**Peso de las piezas sin discos: desconocido.** Las piezas que no son discos suman 2 kg (30 − 28), así que se usan estos valores estimados, ajustables en la configuración. Se pueden afinar pesando cada pieza con una báscula de cocina.

| Pieza | Estimación |
|---|---|
| Mango | 0,5 kg |
| Conector | 0,5 kg |
| Tuerca | 0,125 kg |

### Fórmulas de peso

- **Mancuerna** = mango + 2 tuercas + discos → vacía ≈ **0,75 kg**.
- **Barra** = 2 mangos + conector + 2 tuercas (las de los extremos) + discos → vacía ≈ **1,75 kg**.
  - El número de tuercas que lleva cada montaje es configurable, por si el modelo usa las 4 en la barra.
- La app siempre muestra el **peso total**, que es el que se registra: por mancuerna en los ejercicios de mancuernas y total en los de barra.

---

## 2. Consecuencias del equipo en la rutina

| Dato | Consecuencia en la app |
|---|---|
| Se usa como mancuernas **o** como barra, no las dos a la vez | Cada día de la rutina está **escrito ya agrupado por montaje**: primero el bloque de barra, después el de mancuernas y al final el peso corporal. Antes de cada bloque, y cuando cambia el peso dentro de un bloque, aparece un aviso de montaje ("Monta la barra: 10,75 kg → por lado: 2,5 + 2"). |
| Discos repartidos por igual en cada lado | **Par de mancuernas:** hasta 14 kg de discos por mancuerna (7 por lado) → **≈14,75 kg por mancuerna**. **Barra:** hasta 28 kg de discos (14 por lado) → **≈29,75 kg**. |
| Una sola mancuerna (goblet, remo a una mano, curl concentrado, pullover) | Puede llevar más discos que cada mancuerna del par, hasta lo que quepa en el mango. Ese tope es desconocido y se configura como "**kg máximos de discos por lado del mango**" (por defecto 7 kg). |
| Pesos que se pueden montar | **Par de mancuernas** (discos por mancuerna, sin contar la mancuerna vacía): 0 · 2,5 · 4 · 5 · 6,5 · 7,5 · 9 · 10 · 11,5 · 14 kg. **Barra** (discos en total): 27 pesos posibles entre 0 y 28 kg, con saltos de entre 0,5 y 2,5 kg. Los saltos **no son fijos**: dependen de los discos de 2 kg. |
| Sin barra de dominadas | Fuera las dominadas. La espalda se trabaja con remos (mancuerna y barra) y pullover en el suelo. |
| Sin banco | Variantes en el suelo: press de suelo, aperturas en suelo, hip thrust con los hombros en el sofá. La sentadilla búlgara usa una silla o el sofá. |
| Discos redondos de plástico | Las mancuernas ruedan, así que el **remo renegado** (apoyado sobre las mancuernas) es inestable. Queda en el catálogo solo como variante opcional y con aviso de seguridad. No aparece en las rutinas. |
| El peso máximo es moderado para ganar músculo | Rangos de 8 a 20 repeticiones, ejercicios a una pierna o a un brazo, bajadas lentas (3 s) y pausas para que siga costando sin más peso. Cada ejercicio tiene su **escalera de variantes** (sección 7). Importante sobre todo en pierna. |

---

## 3. Enfoque técnico

- **PWA** (aplicación web instalable) en **HTML, CSS y JavaScript sin framework**, con módulos ES y sin compilación.
  - Se instala desde Chrome para Android ("Instalar aplicación") y se abre a pantalla completa (`display: standalone`).
  - Funciona **sin internet** (service worker con caché versionada).
  - Rutas relativas en todos los archivos para que funcione igual en local y en GitHub Pages.
- **HTTPS obligatorio en el móvil.** El service worker y la instalación solo funcionan en un origen seguro. Una dirección `http://192.168.x.x` de la Wi-Fi de casa **no** lo es.
  - **Uso diario:** publicación gratuita en **GitHub Pages** (HTTPS), desde la Fase 1.
  - **Durante el desarrollo:** depuración USB de Chrome con **reenvío de puertos** (`chrome://inspect` en el PC). El móvil abre `http://localhost:8080`, que sí cuenta como origen seguro, y se ven los errores de la consola del móvil en el PC.
- **Datos:** se guardan en el móvil con `localStorage`.
  - Esquema con número de versión y migraciones.
  - Al arrancar se pide `navigator.storage.persist()` para que el navegador no borre los datos.
  - Si los datos están corruptos, se recuperan sin romper la app.
  - Se pueden **exportar e importar en JSON**, como copia de seguridad.
- **Fuentes alojadas en el proyecto** (`fonts/`, formato woff2), no en Google Fonts, para que funcionen sin conexión.
- **Animaciones:** figuras humanas propias en **SVG animadas con CSS**. Cada ejercicio tiene 2–3 posturas clave (inicio → medio → fin) en bucle, con el equipo dibujado y los **músculos trabajados resaltados en color**. Ligeras, sin conexión y nítidas en cualquier pantalla.
- **Cronómetro (Android/Chrome):**
  - **Vibración** (Vibration API, disponible en Android).
  - **Pitido** (Web Audio). El `AudioContext` se desbloquea con el primer toque en "✓ Serie hecha" y suena con el volumen multimedia.
  - **Pantalla siempre encendida** (Wake Lock API). Se vuelve a pedir en `visibilitychange` cada vez que se vuelve a la app.
  - El tiempo se calcula con **marcas de hora** (`Date.now()`), no sumando intervalos, para que no se desfase si Chrome frena la página.
  - Si al volver a la app el descanso ya terminó, se muestra "Descanso terminado hace X s".
  - Además del sonido y la vibración, siempre hay un **aviso visual** (destello a pantalla completa).
- **Notificaciones de racha (Android/Chrome, app instalada)** — ver sección 9.8:
  - Se muestran con `ServiceWorkerRegistration.showNotification()` y se pide permiso solo cuando el usuario activa "Avisos de racha" en Ajustes.
  - **Al terminar una sesión** (fiable): se muestran al momento.
  - **Recordatorio en los días de entrenamiento** (sin servidor):
    - Usa **Periodic Background Sync**, que está disponible en Chrome para Android con la app instalada.
    - Es Chrome quien decide cuándo ejecutarlo (como mucho, más o menos una vez al día, según el uso de la app), así que **no llega a una hora exacta**.
    - Como respaldo, el aviso también aparece al abrir la app ese día.
  - **Mejora opcional futura (hora exacta):** Web Push con claves VAPID y un envío programado (por ejemplo, un flujo programado de GitHub Actions). Necesita guardar la suscripción del móvil fuera de él, por eso no entra en la primera versión.

---

## 4. Estructura de archivos

```
MicroAppGym/
├── index.html              # Contenedor de la app
├── manifest.json           # Datos para instalarla como app
├── sw.js                   # Service worker (sin conexión, caché versionada)
├── css/styles.css          # Colores, tipografía y componentes
├── fonts/                  # Inter y Barlow Condensed (woff2)
├── icons/                  # 192 px, 512 px, 512 px maskable y favicon
├── js/
│   ├── app.js              # Arranque, navegación entre pantallas y estado
│   ├── storage.js          # Guardado local, esquema versionado, exportar/importar
│   ├── data/exercises.js   # Catálogo de ejercicios y lista de músculos
│   ├── data/routines.js    # Plantillas de rutina (3, 4 y 5 días)
│   ├── data/equipment.js   # Inventario de discos y calculadora
│   ├── planner.js          # Genera la rutina, sustituciones y progresión
│   ├── animations.js       # Construye y anima las figuras SVG
│   ├── timer.js            # Cronómetro de descanso y cronómetro libre
│   ├── workout.js          # Sesión activa y botón "Serie hecha"
│   └── views/
│       ├── config.js       # Configuración inicial y ajustes
│       ├── hoy.js          # Pantalla Hoy
│       ├── rutina.js       # Rutina del día
│       ├── ejercicios.js   # Catálogo y detalle del ejercicio
│       └── historial.js    # Historial y progresión
```

---

## 5. Modelo de datos

Todos los pesos se guardan **en gramos enteros** (1,25 kg = 1250) para evitar errores de redondeo. Se muestran en kg con coma decimal.

**Ejercicio** (`exercises.js`):
- `id`, `nombre`, `grupo` (pecho, espalda, hombro, pierna, brazos, core)
- `equipo`: `barra` | `mancuernas` | `peso corporal`
- `numMancuernas`: 1 | 2 (solo si `equipo` es `mancuernas`)
- `tipo`: `repeticiones` | `tiempo`
- `unilateral`: `true` si las series se hacen por pierna o por brazo
- `musculosPrincipales`, `musculosSecundarios` (de la lista de músculos válidos)
- `paraQueSirve`, `pasos` (técnica), `erroresComunes`
- `aviso` opcional (seguridad)
- `apoyo` opcional (silla, sofá, mesa)
- `animacion` (id de la animación SVG)
- `variantes`: escalera de progresión, de más fácil a más difícil (ids de ejercicio o modificadores de tempo y pausa)
- `sustitutos`: ids de ejercicios del mismo grupo para cambiarlo

**Ejercicio dentro de un día de rutina** (`routines.js`):
- `ejercicioId`, `series`, `repeticiones` (rango `[min, max]`), o `segundos` si es de tiempo, o `casiFallo: true`
- `descanso` (segundos)
- `tempo` opcional (por ejemplo `3-1-1`) y `pausa` opcional (segundos)
- `superserieCon` opcional (id del ejercicio con el que se alterna sin descanso entre medias)
- `montaje`: `barra` | `mancuernas` | `ninguno` (el día ya viene ordenado por montaje)

**Configuración del usuario:**
- Equipo disponible (más adelante se podrá añadir barra de dominadas o banco).
- Inventario de discos, peso del mango, del conector y de cada tuerca, tuercas por montaje y kg máximos de discos por lado del mango.
- Días por semana (3, 4 o 5; por defecto 4) y días de la semana asignados.
- Nivel:
  - **Principiante:** 1 serie menos por ejercicio durante las 2 primeras semanas y 30 s más de descanso.
  - **Intermedio:** la rutina tal cual.

**Registro de sesión** (se define en la Fase 2 y lo usan las Fases 6 y 7):
- `version`, `id`, `fecha`, `diaId`, `terminada`
- Por ejercicio:
  - `ejercicioId` y `variante` usada.
  - Cada serie con `peso` (total por mancuerna o de la barra, en gramos), `repeticiones` o `segundos`, y `hecha`.
- Una sesión a medias se guarda tras cada serie para poder retomarla.

---

## 6. Catálogo de ejercicios

| Grupo | Mancuernas | Barra | Peso corporal |
|---|---|---|---|
| Pecho | Press de suelo, aperturas en suelo, press squeeze | Press de suelo con barra | Flexiones, flexiones declinadas (pies en silla) |
| Espalda | Remo a una mano, remo inclinado con dos mancuernas, pullover en suelo, remo renegado *(opcional, con aviso: las mancuernas redondas ruedan)* | Remo con barra | Remo invertido bajo mesa *(opcional, con aviso de seguridad)* |
| Hombro | Press militar, elevaciones laterales, pájaros | Press militar de pie | Flexiones pike |
| Pierna | Sentadilla goblet, zancadas hacia atrás, sentadilla búlgara, peso muerto a una pierna, hip thrust a una pierna | Peso muerto rumano, hip thrust (hombros en el sofá) | Elevación de talones a una pierna, puente de glúteo, puente de glúteo a una pierna |
| Brazos | Curl martillo, curl concentrado, extensión de tríceps sobre la cabeza | Curl con barra, press francés en suelo | Fondos en silla |
| Core | — | — | Plancha, elevación de piernas, crunch |

- **"Con pausa" y "con bajada lenta"** no son ejercicios aparte: son modificadores (`tempo` y `pausa`) de un ejercicio del catálogo. Por ejemplo, la "sentadilla goblet con pausa" es la sentadilla goblet con `pausa: 2`.
- **Sustitutos y regresiones:** el press squeeze, las flexiones, las flexiones pike, el crunch, el puente de glúteo y el remo invertido no están en la rutina por defecto. Aparecen como alternativas al cambiar un ejercicio, y el crunch se alterna con la elevación de piernas.
- **Excluidos por el equipo actual:** dominadas y fondos en paralelas. Se activarán si en la configuración se marca "barra de dominadas".

---

## 7. Rutina propuesta

**Semana tipo:**

| Lunes | Martes | Miércoles | Jueves | Viernes | Sábado | Domingo |
|---|---|---|---|---|---|---|
| Torso A | Pierna A | Descanso | Torso B | Pierna B | Hombro y brazos *(solo con 5 días)* | Descanso |

Cada día va **ordenado por montaje**. Dentro del bloque de barra, los ejercicios van del más pesado al más ligero, para que solo haya que ir quitando discos.

### 4 días: torso / pierna × 2 (predeterminada)

**Torso A** (barra → mancuernas)

| # | Montaje | Ejercicio | Series × repeticiones | Descanso |
|---|---|---|---|---|
| 1 | Barra | Press de suelo con barra | 4 × 8-12 | 120 s |
| 2 | Barra | Remo con barra | 4 × 8-12 | 120 s |
| 3 | Barra | Press militar de pie con barra | 3 × 8-12 | 90 s |
| 4 | Barra | Press francés en suelo | 3 × 10-12 | 75 s |
| 5 | Barra | Curl con barra | 3 × 10-12 | 75 s |
| 6 | 1 mancuerna | Pullover en suelo | 3 × 12-15 | 75 s |
| 7 | 2 mancuernas | Aperturas en suelo | 3 × 12-15 | 75 s |

**Pierna A** (barra → mancuernas → peso corporal)

| # | Montaje | Ejercicio | Series × repeticiones | Descanso |
|---|---|---|---|---|
| 1 | Barra | Peso muerto rumano con barra | 4 × 10-12 | 120 s |
| 2 | 1 mancuerna | Sentadilla goblet | 4 × 12-15 | 120 s |
| 3 | 2 mancuernas | Zancadas hacia atrás | 3 × 10-12 por pierna | 90 s |
| 4 | — | Puente de glúteo a una pierna | 3 × 12-15 por pierna | 60 s |
| 5 | — | Elevación de talones a una pierna | 4 × 15-20 por pierna | 60 s |
| 6 | — | Plancha | 3 × 30-45 s | 60 s |

**Torso B** (mancuernas → peso corporal, sin cambiar a barra)

| # | Montaje | Ejercicio | Series × repeticiones | Descanso |
|---|---|---|---|---|
| 1 | 2 mancuernas | Press de suelo con mancuernas | 4 × 10-15 | 120 s |
| 2 | 1 mancuerna | Remo con mancuerna a una mano | 4 × 10-12 por brazo | 90 s |
| 3 | 2 mancuernas | Remo inclinado con dos mancuernas | 3 × 10-12 | 90 s |
| 4 | 2 mancuernas | Elevaciones laterales | 4 × 12-20 | 60 s |
| 5 | 2 mancuernas | Pájaros (deltoide posterior) | 3 × 15-20 | 60 s |
| 6 | 2 mancuernas + — | Superserie: curl martillo 3 × 10-12 + fondos en silla 3 × 10-15 | — | 75 s tras cada pareja |
| 7 | — | Flexiones declinadas (pies en silla) | 2 × casi al fallo | 90 s |

**Pierna B** (barra → mancuernas → peso corporal)

| # | Montaje | Ejercicio | Series × repeticiones | Descanso |
|---|---|---|---|---|
| 1 | Barra | Hip thrust con barra (hombros en el sofá) | 4 × 12-15 | 120 s |
| 2 | 2 mancuernas | Sentadilla búlgara | 4 × 10-12 por pierna | 90 s |
| 3 | 2 mancuernas | Peso muerto a una pierna | 3 × 10-12 por pierna | 90 s |
| 4 | 1 mancuerna | Sentadilla goblet con pausa de 2 s abajo | 3 × 12 | 90 s |
| 5 | — | Elevación de talones a una pierna | 4 × 15-20 por pierna | 60 s |
| 6 | — | Elevación de piernas (alterna con crunch cada semana) | 3 × 12-15 | 60 s |

**Series semanales por grupo muscular (4 días):**

| Grupo | Series |
|---|---|
| Pecho | 13 |
| Espalda | 14 (remos y pullover) |
| Hombro | 10 directas, más el trabajo de los press |
| Bíceps | 6 |
| Tríceps | 6 directas, más los press |
| Cuádriceps | 14 |
| Isquios y glúteo | 14, más el trabajo de zancadas y búlgara |
| Gemelo | 8 |
| Core | 6 |

### 5 días

Los 4 días anteriores más **Hombro y brazos** (sábado), todo con mancuernas:

| # | Montaje | Ejercicio | Series × repeticiones | Descanso |
|---|---|---|---|---|
| 1 | 2 mancuernas | Press militar con mancuernas | 3 × 10-12 | 90 s |
| 2 | 2 mancuernas | Elevaciones laterales | 4 × 15-20 | 60 s |
| 3 | 2 mancuernas | Pájaros | 3 × 15-20 | 60 s |
| 4 | 1 mancuerna | Pullover en suelo | 3 × 12-15 | 75 s |
| 5 | 1 mancuerna | Curl concentrado | 3 × 10-12 por brazo | 60 s |
| 6 | 1 mancuerna | Extensión de tríceps sobre la cabeza | 3 × 10-12 | 60 s |

### 3 días: cuerpo completo A / B / A (la semana siguiente B / A / B)

Se entrena **lunes, miércoles y viernes**. Los descansos son los mismos que en la rutina de 4 días para cada ejercicio (120 s en los básicos, 90 s en los unilaterales y 60-75 s en el aislamiento y el core).

| Cuerpo completo A | Cuerpo completo B |
|---|---|
| **Barra:** peso muerto rumano 3×10-12, press de suelo 3×8-12, remo 3×8-12 | **Barra:** hip thrust 3×12-15 |
| **Mancuernas:** sentadilla goblet 3×12-15, elevaciones laterales 3×12-20 | **Mancuernas:** press de suelo 3×10-15, remo a una mano 3×10-12, sentadilla búlgara 3×10-12, superserie curl martillo + fondos en silla 2×12 |
| **Peso corporal:** plancha 3×30-45 s | **Peso corporal:** elevación de talones a una pierna 3×15-20 |

### Progresión automática (doble progresión)

1. Se trabaja dentro de un rango de repeticiones (por ejemplo 8-12).
2. Cuando se completan **todas las series en el máximo del rango**, la app sugiere el **siguiente peso que se pueda montar** según la calculadora. Suele ser entre 0,5 y 2,5 kg más (sección 2).
3. Si en **2 sesiones seguidas** no se llega al mínimo del rango, sugiere volver al peso montable anterior.
4. Si el equipo ya está al máximo, sugiere el siguiente escalón de la **escalera de variantes** del ejercicio:

| Ejercicio | Escalera de variantes |
|---|---|
| Sentadilla goblet | Bajada en 3 s → pausa de 2 s abajo → sentadilla búlgara |
| Hip thrust con barra | Pausa de 2 s arriba → hip thrust a una pierna con mancuerna |
| Peso muerto rumano con barra | Bajada en 3 s → peso muerto a una pierna |
| Remo con barra o con mancuerna | Pausa de 2 s arriba → bajada en 3 s |
| Press de suelo | Bajada en 3 s → pausa de 1 s con los codos en el suelo |
| Flexiones | Declinadas → declinadas con pausa abajo |
| Elevación de talones a una pierna | Con una mancuerna en la mano → pausa de 2 s abajo |
| Curl y aperturas | Bajada en 3 s → subir el rango a 15-20 |
| Elevaciones laterales y pájaros (ya trabajan a 12-20) | Bajada en 3 s → subir el rango a 20-25 |
| Plancha | Subir a 45-60 s → con un disco sobre la espalda |

---

## 8. Calculadora de discos

- El usuario pone un peso objetivo **total** (por mancuerna o para la barra).
- La app resta el peso vacío (fórmulas de la sección 1) y calcula **qué discos colocar en cada lado**, iguales en los dos lados, según el inventario real:
  - **Par de mancuernas:** el inventario se reparte entre las dos.
  - **Una mancuerna:** puede usar más discos, hasta el máximo configurado por lado del mango.
  - **Barra:** todo el inventario.
- Si hay varias combinaciones para el mismo peso, elige la de **menos discos**.
- Si ese peso no se puede montar, avisa y propone el **más cercano por debajo y por encima**.
- En la sesión activa, al cambiar de ejercicio dentro del mismo montaje, indica **solo los cambios** respecto a lo que ya está montado ("Quita 1,25 por lado").

---

## 9. Pantallas

1. **Configuración inicial (primera vez)** (`views/config.js`):
   - Días por semana y qué días.
   - Nivel.
   - Inventario de discos y peso de las piezas, con valores estimados ya puestos.
   - Equipo extra (desactivado por ahora).
   - Luego se puede cambiar todo desde Ajustes, que incluye **exportar e importar datos**.
2. **Hoy (inicio)** (`views/hoy.js`): entrenamiento del día, la semana en tarjetas, racha de días entrenados y botón para retomar una sesión a medias.
3. **Rutina del día** (`views/rutina.js`):
   - Lista de ejercicios agrupados por montaje, con miniatura animada, series × repeticiones, peso sugerido y botón "Empezar".
   - Se puede cambiar un ejercicio por uno de sus sustitutos y ajustar series, repeticiones y peso.
4. **Ejercicios** (`views/ejercicios.js`): catálogo filtrable por grupo muscular y por equipo. Al tocar un ejercicio se abre el **detalle**:
   - Animación grande en bucle.
   - Mapa de los músculos trabajados.
   - Para qué sirve, técnica paso a paso, errores comunes y avisos.
   - Escalera de variantes.
5. **Sesión activa** (`workout.js`):
   - Animación del ejercicio actual arriba.
   - Series en "pastillas" (● ● ○ ○), cada una con su peso y repeticiones editables.
   - **Botón grande "✓ Serie hecha"** en la mitad inferior, que marca la serie y **arranca el descanso automáticamente**.
   - En las superseries alterna los dos ejercicios y descansa tras cada pareja.
   - Al terminar la última serie pasa al siguiente ejercicio.
   - Avisos de montaje con los discos por lado.
   - Al terminar, muestra un resumen con confeti suave y la sugerencia de progresión.
6. **Cronómetro de descanso** (`timer.js`):
   - Franja inferior con anillo de cuenta atrás, que se puede ampliar a pantalla completa.
   - Botones de −15 s, +15 s y "Saltar".
   - Al terminar: **vibración, pitido y destello**.
   - La pantalla se mantiene encendida.
   - **Cronómetro libre** con cuenta atrás para los ejercicios de tiempo (plancha).
7. **Historial** (`views/historial.js`):
   - Sesiones completadas con fecha, volumen total y pesos usados.
   - Gráfica sencilla de progresión por ejercicio.
   - Mejores marcas.

8. **Racha y notificaciones:**
   - **Qué es la racha:** el número de entrenamientos seguidos que has cumplido en los días que marcaste en Ajustes.
     - Un día marcado con la sesión terminada suma 1.
     - Los días de descanso no suman ni la rompen.
     - Si un día marcado termina sin sesión, la racha vuelve a 0.
     - Entrenar en un día no marcado también suma (recuperar no se castiga).
     - Se guarda también el **récord de racha**.
   - **Dónde se ve:** en la tarjeta de racha de la pantalla Hoy ("🔥 7 entrenamientos seguidos sin fallar"), con el récord debajo.
   - **Notificaciones** (se activan en Ajustes → "Avisos de racha"):
     - Al terminar una sesión: "🔥 ¡Racha de 7! Próximo entrenamiento: jueves, Torso B".
     - Los días de entrenamiento: "Hoy toca Pierna A. Llevas 7 seguidos, ¡no la pierdas! 🔥". Llega una vez a lo sumo y no aparece si ya has entrenado ese día.
     - Al llegar a un hito (5, 10, 25, 50 y 100): una notificación especial.
     - Tocar la notificación abre la app en la pantalla Hoy.

Navegación: barra inferior con las pestañas **Hoy**, **Rutina**, **Ejercicios** e **Historial**. Ajustes se abre desde un icono en la pantalla Hoy.

---

## 10. Diseño visual

- **Tema oscuro** por defecto: fondo `#0F1115`, tarjetas `#1A1D24`.
- **Acento principal** verde lima `#C6F432` (acciones y series hechas).
- **Acento secundario** coral `#FF6B4A` (descanso y músculos resaltados).
- Tipografía (alojada en `fonts/`): *Inter* para el texto, *Barlow Condensed* para los números grandes del cronómetro.
- Botones de al menos **56 px** de alto, pensados para una mano y manos sudadas. Las acciones principales van en la mitad inferior de la pantalla.
- Microanimaciones al marcar una serie (rebote y check) y resumen con confeti suave al terminar la sesión.
- Respeta `prefers-reduced-motion`.
- Diseñado para 360 px de ancho como mínimo, sin desplazamiento horizontal.

---

## 11. Fases de desarrollo

Cada fase termina con una revisión de **qa-movil**. Una fase solo está terminada cuando se cumplen todos sus criterios.

### Fase 1 — Base
1. **Estructura del proyecto:** carpetas y archivos de la sección 4.
2. **Instalación en el móvil:**
   - `manifest.json`: nombre, colores, `display: standalone`, iconos de 192 px, 512 px y maskable.
   - `sw.js`: caché versionada y funcionamiento sin conexión.
3. **Sistema de diseño:** colores, fuentes locales y componentes base (tarjetas, botones grandes, pastillas de serie, iconos).
4. **Navegación:** barra inferior con las cuatro pestañas, transiciones suaves sin recargar y contenido de ejemplo en cada pantalla.
5. **Guardado local:** `storage.js` con esquema versionado, `persist()`, recuperación de datos corruptos y exportar/importar en JSON.
6. **Prueba en el móvil:** reenvío de puertos por USB para desarrollar y publicación en GitHub Pages.

**Terminado cuando:**
- La app se instala en el Android desde GitHub Pages, se abre a pantalla completa y carga **con el modo avión activado**.
- Las 4 pestañas navegan sin recargar.
- Un dato guardado sigue ahí después de cerrar y volver a abrir la app.
- No hay errores en la consola.

### Fase 2 — Datos
- Catálogo de ejercicios completo con textos.
- Plantillas de rutina de 3, 4 y 5 días.
- Inventario de discos y calculadora.
- **Formato definitivo del registro de sesión.**

**Terminado cuando:**
- Cada ejercicio de las plantillas existe en el catálogo.
- Cada músculo usado está en la lista de músculos válidos.
- Las pruebas de la calculadora (en Node) dan como montables exactamente los pesos de la sección 2, y para un peso imposible devuelven el más cercano por debajo y por encima.

### Fase 3 — Planificador
- Pantalla de configuración inicial.
- Generación de la rutina según el equipo y el nivel.
- Cambio de ejercicios por sus sustitutos y ajuste de series, repeticiones y peso.

**Terminado cuando:**
- Elegir 3, 4 o 5 días genera la rutina correspondiente.
- Cada día respeta el orden por montaje.
- Al cambiar un ejercicio solo se ofrecen sustitutos posibles con el equipo.

### Fase 4 — Animaciones SVG
- Figura base reutilizable.
- Posturas de cada ejercicio.
- Resaltado de músculos y mapa de músculos.

**Terminado cuando:**
- Todos los ejercicios de la rutina de 4 días tienen animación completa.
- El resto tienen al menos la figura estática con sus músculos.
- Las animaciones son fluidas en el móvil y se detienen con `prefers-reduced-motion`.

### Fase 5 — Cronómetro
- Anillo de cuenta atrás y ajustes de ±15 s.
- Vibración, pitido y destello.
- Pantalla siempre encendida.
- Cronómetro libre para ejercicios de tiempo.

**Terminado cuando:**
- Tras 3 minutos, incluso bloqueando y desbloqueando el móvil, el aviso llega con **1 s o menos** de desfase.
- La vibración y el pitido funcionan en el Android.
- La pantalla no se apaga durante el descanso.

### Fase 6 — Sesión activa
- Botón "✓ Serie hecha" y progreso.
- Registro de peso y repeticiones.
- Superseries.
- Avisos de montaje con los cambios de discos.
- Retomar una sesión a medias.

**Terminado cuando:**
- Se puede completar Torso A de principio a fin con una mano.
- El descanso arranca solo después de cada serie.
- Al cerrar la app a mitad de la sesión y volver a abrirla, se retoma en la misma serie.

### Fase 7 — Historial, progresión, racha y notificaciones
- Lista de sesiones, volumen y pesos usados.
- Gráfica por ejercicio y mejores marcas.
- Sugerencias de doble progresión y escalera de variantes.
- **Racha real** calculada con las sesiones y los días marcados (sección 9.8), con récord.
- **Notificaciones de racha:** interruptor en Ajustes, aviso al terminar la sesión, recordatorio en los días de entrenamiento con Periodic Background Sync y aviso de hitos.

**Terminado cuando:**
- Con todas las series en el máximo del rango, la sugerencia es el siguiente peso montable.
- Con el peso al máximo, la sugerencia es el siguiente escalón de la escalera.
- El volumen coincide con un cálculo hecho a mano.
- La racha da el resultado correcto en pruebas con semanas inventadas: días cumplidos, un día fallado, días de descanso y entrenar en un día no marcado.
- En el Android, al terminar una sesión llega la notificación de racha, y tocarla abre la app en Hoy.

### Fase 8 — Pruebas y pulido
- Instalación limpia en el Android.
- Uso sin conexión.
- Tamaños de pantalla de 360 a 430 px.
- Accesibilidad y pulido final.

**Terminado cuando:**
- **qa-movil** no informa de ningún problema bloqueante ni importante.
- El usuario completa una semana real de entrenamiento con la app.

---

## 12. Decisiones

- [x] **Rutina predeterminada: 4 días** (torso / pierna × 2). La de 5 días queda disponible en la configuración.
- [x] **Peso de las piezas: desconocido.** Se usan los valores estimados (mango 0,5 kg, conector 0,5 kg y tuerca 0,125 kg), ajustables en la configuración.
- [x] **Móvil: Android** (Chrome). Vibración, Wake Lock e instalación nativa disponibles.
- [x] **Publicación: GitHub Pages** para el uso diario y reenvío de puertos por USB durante el desarrollo.
- [x] **Objetivo fijo: hipertrofia.** No se pregunta en la configuración.
- [x] **Inicio del desarrollo (Fase 1):** hecho en local (23/11/2026). El usuario tiene cuenta de GitHub.
- [x] **Publicación en GitHub Pages:** confirmada. El código está en `github.com/bvnj444/MicroAppGym`, con el correo privado de GitHub en los commits.
- [ ] **Activar GitHub Pages** en los ajustes del repositorio (lo hace el usuario): *Settings → Pages → Deploy from a branch → `main` / `(root)`*.
- [x] **Notificaciones de racha:** sí, sin servidor (al terminar la sesión y recordatorio aproximado con Periodic Background Sync). La hora exacta con Web Push queda como mejora opcional.
