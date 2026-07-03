# Contexto del proyecto — AI Tracker (ai-account-manager)

**Repositorio:** https://github.com/Ren-reno/ai-account-manager
**Stack actual:** HTML + CSS + JavaScript vanilla (sin frameworks, sin build step), persistencia en `localStorage`, sin backend
**Commit analizado:** `d6fb7fa` — "primera aproximación" (2026-07-02)
**Ubicación en el repo:** raíz, como `CONTEXT.md` — es el documento de referencia técnica; el `README.md` (cuando exista) debe apuntar acá para el detalle de arquitectura y decisiones.
**Propósito de este documento:** dar contexto de arranque a quien (persona o IA) continúe el desarrollo, sin tener que re-derivar el diseño desde cero.

> Este documento no reemplaza al código — resume el *por qué* y el *cómo está organizado*. Para el detalle línea por línea, revisa directamente `index.html`, `app.js` y `style.css` en el repo.

**En una frase:** app local (sin backend) para registrar en qué cuenta gratuita de qué IA quedó cada sesión de trabajo, agrupadas por objetivo (*quest*), para poder retomarlas cuando se liberan los tokens — y, en paralelo, una pieza de portafolio.

---

## 1. Qué es y por qué existe

El autor trabaja con varias cuentas gratuitas de asistentes de IA (Claude, ChatGPT, Gemini, etc.), que tienen límites de uso que se agotan y obligan a pausar y esperar. Sin un registro externo, es fácil perder de vista en qué cuenta quedó cada tarea, qué faltaba resolver, y cuándo conviene volver.

La app organiza el trabajo en dos niveles:

- **Quest** — el objetivo grande (p. ej. "construir tal app").
- **Tarea** — una sesión de trabajo concreta dentro de una quest, ejecutada en una cuenta/plataforma específica, con su propio estado y ciclo de vida.

Sobre eso se apoyan **Cuentas** (para no escribir el email a mano cada vez y ver de un vistazo cuáles están libres) y **Notas** (globales y por quest, con autoguardado) para capturar contexto que no cabe en los campos estructurados.

El proyecto tiene además un propósito declarado de portafolio: el autor quiere presentarlo como muestra de capacidad de resolver un problema real y estructurar una solución — no solo de escribir código, que considera cada vez más "commodity" en la era de la IA.

## 2. Cómo correr el proyecto

Sin dependencias ni build step. Los 3 archivos (`index.html`, `app.js`, `style.css`) van en la misma carpeta — se abre `index.html` en cualquier navegador (o se sirve con cualquier servidor estático). Todo el estado vive en `localStorage`.

## 3. Modelo de datos (estado real del código)

| Colección | Clave en `localStorage` |
|---|---|
| Quests | `ait_quests` |
| Tareas | `ait_tasks` |
| Cuentas | `ait_accounts` |
| Notas globales | `ait_global_notes` |
| Notas de quest | `ait_quest_notes` |
| Plataformas custom | `ait_platforms` |

**Quest**
```
{
  id: string,
  name: string,            // requerido
  desc: string,
  status: 'activa' | 'pausada' | 'completada',
  tags: string[],           // cada uno con prefijo '#'
  createdAt: string,        // ISO
  updatedAt?: string
}
```

**Tarea**
```
{
  id: string,
  questId: string,          // FK → Quest
  accountId: string,        // FK → Cuenta
  desc: string,              // requerido
  status: 'en_progreso' | 'esperando_tokens' | 'completada',
  reactivation: string,      // datetime-local: cuándo vuelve la cuenta
  notesClosure: string,      // qué quedó pendiente al pausar
  taskNumber: number,        // correlativo dentro de la quest (ver §8)
  createdAt: string,
  updatedAt?: string,
  completedAt: string | null
}
```

**Cuenta**
```
{
  id: string,
  platform: string,          // 'Claude' | 'ChatGPT' | 'Gemini' | custom
  email: string,              // requerido
  alias?: string,
  status: 'free' | 'busy',
  activeTaskId: string | null,
  createdAt: string,
  updatedAt?: string
}
```

**Nota** (misma forma para globales y de quest; las de quest agregan `questId`)
```
{
  id: string,
  questId?: string,          // solo en notas de quest, FK → Quest
  title: string,
  body: string,
  tags: string[],
  createdAt: string,
  updatedAt: string
}
```

**Plataformas**: array plano de strings. Default si está vacío: `['Claude', 'ChatGPT', 'Gemini']`. Claude y ChatGPT están hardcodeados como no-eliminables en Settings; el resto se puede quitar.

**Relaciones:** Quest 1—N Tarea, Quest 1—N Nota de quest, Cuenta 1—N Tarea. Por diseño una cuenta debería tener una sola tarea activa a la vez (ver §7), aunque la implementación actual no lo garantiza del todo (ver §8).

## 4. Arquitectura del código

- **`index.html`** (371 líneas): todas las vistas están precargadas en el DOM y se muestran/ocultan con la clase `.view`/`.active` — es un SPA de una sola página, sin router de URL (ni hash ni History API). Los 4 modales (nueva quest, nueva tarea, nueva cuenta, nota global rápida) también están precargados.
- **`app.js`** (1230 líneas): toda la lógica en un solo archivo, sin módulos ES. Las funciones que usan los `onclick` inline del HTML se exponen explícitamente en `window` al final del archivo.
- **`style.css`** (760 líneas): variables CSS para el sistema de diseño (§6), layout de sidebar fija + contenido con scroll propio, una sola media query para mobile.

**Patrones internos:**

- **Capa de datos (`DB`)** — objeto único con getters que leen de `localStorage` en cada acceso (sin cache en memoria) y métodos `saveX()` que escriben. Cada `render*()` vuelve a leer el arreglo completo correspondiente; no es problema al volumen actual (uso personal), pero sería lo primero a optimizar si el dataset creciera mucho.
- **Router de vistas** — `showView(name, questId?)` alterna `.active` entre los `<div class="view">` y llama a un `render*()` mapeado en un objeto `renders`. `quest-detail` es un caso especial: recibe `questId` y dispara los 3 render de sus tabs (tareas, notas, stats).
- **Modales** — genéricos por `id` (`openModal`/`closeModal`), con `resetForms()` limpiando una lista fija de ids. Cada entidad reutiliza el mismo modal para crear y editar (un input oculto `*-edit-id` decide el modo).
- **CRUD** — mismo patrón en las 4 entidades con modal: leer inputs → validar solo los campos requeridos (sin validación de formato) → `push` o actualizar por id → persistir → cerrar modal → re-renderizar la vista activa.
- **Notas con autosave** — patrón duplicado (no compartido) entre notas globales y de quest: cada una con su propio `currentXNoteId`, su propio timer de debounce (1.5s) y sus propias funciones render/select/autosave/delete. Buen candidato a unificar en una futura refactorización.
- **Tags** — mini-componente reutilizable (`initTagInput`, `renderTagsDisplay`, `getTags`, `setTags`) enganchado a un par inputId/displayId. El filtro por tags (`renderTagFilterBar`) guarda callbacks en `window['callback_' + barId]`, funcional pero algo frágil.
- **Stats** — se calculan al vuelo en cada render (filter/reduce sobre los arrays completos), nada queda cacheado ni persistido.
- **Import/Export** — `exportData()` arma un único JSON con las 6 colecciones + `version` + `exportedAt` y dispara la descarga vía Blob URL. `importData()` reemplaza todo el estado tras un `confirm()`.

## 5. Vistas y funcionalidades

| Vista | Contenido |
|---|---|
| Dashboard | Cuentas ocupadas (con tarea y hora de reactivación), quests activas, tareas esperando tokens, accesos rápidos |
| Quests | Lista con búsqueda + filtro por tags, CRUD completo |
| Detalle de Quest | 3 tabs: Tareas (CRUD acotado a la quest), Notas (mismo editor con autosave), Stats de esa quest |
| Tareas | Lista con búsqueda + filtros por quest/plataforma/estado, CRUD completo |
| Cuentas | Tarjetas libre/ocupada con la tarea activa y botón "Liberar" |
| Notas globales | Editor de dos columnas, búsqueda, filtro por tags, autosave |
| Stats | Métricas globales: tiempo total, tareas por estado/plataforma, cuentas libres/ocupadas |
| Settings | Gestión de plataformas custom, export/import JSON, borrado total |

## 6. Sistema de diseño

Tema oscuro, acento cyan-mint, `JetBrains Mono` (vía Google Fonts) para elementos de marca y `system-ui` para texto de cuerpo.

| Variable | Valor | Uso |
|---|---|---|
| `--bg` | `#0d0f14` | Fondo general |
| `--surface` / `--surface2` | `#141720` / `#1c2030` | Tarjetas / elementos elevados |
| `--accent` | `#00e5c0` | Color de marca |
| `--accent2` | `#7b5ea7` | Secundario |
| `--success` / `--warn` / `--danger` | `#3ecf8e` / `#f0a045` / `#e05a6a` | Libre-completada / esperando / ocupada-eliminar |

Layout: sidebar fija de 210px + contenido principal con scroll propio. Responsive parcial — ver hallazgo en §8.

## 7. Decisiones de diseño deliberadas (no reabrir sin motivo)

Se tomaron explícitamente durante el diseño y están reflejadas en el código:

- Una cuenta "esperando tokens" cuenta como **ocupada**, no libre — queda reservada para esa tarea hasta liberarla o completarla.
- Una cuenta debería sostener **una sola tarea activa a la vez** (implementación parcial, ver §8).
- El número de tarea (`taskNumber`) es correlativo **por quest**, no global.
- La duración se **calcula al vuelo** (`createdAt` → `completedAt`), no se guarda como campo.
- Notas globales y de quest comparten la misma mecánica: autosave a 1.5s, indicador de guardado, navegación entre notas sin perder la anterior, etiquetas con `#`.
- Claude y ChatGPT son plataformas base no eliminables; Gemini viene de tercera por defecto; el resto se agrega a mano.

## 8. Hallazgos del análisis estático

**Integridad de datos**
1. ~~`deleteQuest()` borra la quest, sus tareas y sus notas, pero **no libera las cuentas** que tenían tareas activas de esa quest — quedan en `status:'busy'` apuntando (`activeTaskId`) a una tarea que ya no existe.~~ **Resuelto 2026-07-02** — ver changelog.
2. ~~`deleteAccount()` no valida si la cuenta está en uso ni limpia las tareas que la referencian — quedan con un `accountId` huérfano (el render defensivo evita errores, pero la info de esa cuenta desaparece en silencio).~~ **Resuelto 2026-07-02** — ver changelog.
3. ~~El modal de nueva tarea permite elegir una cuenta ya **ocupada** (aparece marcada en rojo bajo "Ocupadas", pero no está bloqueada). Al guardar, la cuenta pasa a apuntar a la tarea nueva y pierde la referencia a la anterior — contradice la decisión del §7 de "una cuenta, una tarea activa".~~ **Resuelto 2026-07-02** — ver changelog.
4. ~~`taskNumber` puede **repetirse** dentro de una quest: se calcula como `(tareas actuales de la quest) + 1` en el momento de creación, así que borrar una tarea intermedia y crear una nueva puede reusar un número ya existente.~~ **Resuelto 2026-07-02** — ver changelog.

**UI**
5. ~~**Navegación rota en mobile**: la media query a 768px oculta el sidebar completo (`translateX(-100%)`) pero no hay ningún botón para volver a mostrarlo — en pantallas chicas no queda forma de cambiar de vista.~~ **Resuelto 2026-07-02** — ver changelog.

**Seguridad / higiene de código**
6. ~~`escHtml()` existe y se usa en varios lugares, pero de forma **inconsistente**: `email`, `alias`, `platform` y el `name` de quest se insertan sin escapar en varios templates (selects de tareas, tarjetas de dashboard y de cuentas). Riesgo real bajo mientras los datos sean locales y de un solo usuario, pero conviene unificar antes de pensar en backend o multiusuario.~~ **Resuelto 2026-07-02** — ver changelog.
7. Se usa el evento `DOMSubtreeModified` (obsoleto, no estándar) para reaccionar a cambios en las etiquetas de una nota global. Conviene reemplazarlo por una llamada directa a la función correspondiente al agregar/quitar un tag.

**Tooling / portafolio**
8. No hay tests, linter ni bundler — código plano sin build step (razonable al alcance actual, limitante si se migra a React).
9. Todavía no hay `README.md`, `LICENSE` ni `package.json` en el repo.
10. La tipografía de marca depende de Google Fonts vía CDN — los datos funcionan 100% offline, el look visual completo no.

## 9. Roadmap declarado por el usuario (conversado, aún no iniciado)

- Agregar backend — alcance todavía sin definir, a conversar en una sesión futura.
- Posible migración del frontend a React — tampoco definida todavía.
- Preparar el repo para portafolio (`README.md`, `LICENSE`, estructura prolija): el argumento del autor es que en la era de la IA el código se volvió "commodity", pero resolver problemas reales sigue siendo una habilidad valorada por reclutadores, y este proyecto busca demostrarlo.

Ninguno de estos tres puntos está implementado todavía — es intención declarada, no trabajo en curso. No asumas alcance ni tecnología específica (framework de backend, patrón de state management en React, etc.) sin confirmarlo primero.

## 10. Notas de trabajo para quien continúe

- El autor desarrolla usando cuentas gratuitas de distintos asistentes de IA, que se quedan sin cuota con cierta frecuencia — es, literalmente, el problema que esta misma app está diseñada para rastrear. Por eso tiende a dividir el trabajo en partes chicas y autocontenidas, retomables entre sesiones (y a veces entre cuentas o plataformas distintas). Si estás retomando el proyecto sin haber participado en sesiones previas, usa este documento como fuente de verdad en vez de reconstruir el contexto desde cero.
- Prioriza avances chicos y verificables por sobre reescrituras grandes. Antes de refactorizar algo no trivial (p. ej. unificar el patrón de notas globales/de quest del §4), confirma el alcance si no es obvio.
- Al tocar código existente, sigue los patrones ya establecidos en `app.js` (mismos nombres, mismo patrón CRUD, mismo manejo de `DB`) en vez de introducir uno nuevo en paralelo — minimiza el diff y facilita la revisión.
- Evita procesamiento en tareas no solicitadas: no re-audites archivos que no cambiaron, no repitas exploración ya cubierta acá, y confirma el alcance antes de emprender trabajo grande (backend, migración a React) en lugar de asumirlo.
- Este documento refleja el commit `d6fb7fa` ("primera aproximación", 2026-07-02). Si el repo avanzó desde entonces, el código manda por sobre lo escrito acá.

## 11. Cómo mantener este documento

Dos velocidades, no una sola:

- **Regeneración completa** — solo en checkpoints grandes (se agrega backend, se migra a React, cambia el modelo de datos). Ahí la mayor parte del doc queda obsoleta de todos modos, así que conviene rehacerlo entero.
- **Entrada de changelog** — al cierre de cada sesión de trabajo, agregar una entrada corta (3-5 líneas) en la sección de abajo: qué cambió, qué hallazgo del §8 se resolvió (tacharlo ahí también), qué quedó pendiente. No requiere releer ni reanalizar todo el código, solo anotar la diferencia.

Si en algún momento las entradas del changelog empiezan a contradecir las secciones 3-8, es la señal de que toca una regeneración completa.

## Historial de cambios

### 2026-07-02 (sesión 4)
- Qué cambió: se agregó navegación mobile funcional — botón hamburguesa (`#mobile-nav-toggle`) + backdrop (`#sidebar-backdrop`) en `index.html`, estado `.sidebar.open` en la media query de `style.css`, y `toggleSidebar()`/`openSidebar()`/`closeSidebar()` en `app.js` (esta última se llama automáticamente desde `showView()`, así que elegir una vista cierra el menú). Además, se unificó el uso de `escHtml()`: ahora se escapa consistentemente `platform`, `alias`, `email` y el `name` de quest en todos los templates que faltaban (selects del modal de nueva tarea y de nueva cuenta, tarjetas de dashboard/tareas/cuentas, y el desglose "por plataforma" de ambas vistas de stats).
- Hallazgo de §8 resuelto: 5 (UI, navegación rota en mobile) y 6 (seguridad/higiene, uso inconsistente de escHtml).
- Qué quedó pendiente: §8.7 (evento `DOMSubtreeModified` obsoleto) y los pendientes de tooling/portafolio (§8.8-10) siguen abiertos. Nota fuera de alcance: el render de tags (`renderTagsDisplay`, `renderTagFilterBar`) tampoco pasa por `escHtml()` — no estaba en el hallazgo §8.6 original (que solo mencionaba email/alias/platform/quest name) así que no se tocó en esta sesión, pero si se decide seguir unificando el patrón de escapado, es el siguiente candidato obvio.

### 2026-07-02 (sesión 3)
- Qué cambió: se corrigió un bug reportado por el usuario donde el select de cuenta del modal de nueva tarea "se quedaba fijo" y no dejaba elegir otra cuenta. Causa raíz: el listener que precarga el modal (`populateTaskModal`) se adjuntaba con un selector por substring (`[onclick*="modal-new-task"]`) que también matcheaba el overlay del modal y sus botones cerrar/cancelar (comparten el string `'modal-new-task'` en su `onclick`, aunque llaman a `closeModal`/`closeModalOutside`). Como el overlay envuelve todo el modal, cualquier click adentro (incluso abrir el propio `<select>`) burbujeaba y volvía a ejecutar `populateTaskModal()`, que reconstruye el `<select>` desde cero y lo resetea a la primera cuenta. Se cambió a un selector de coincidencia exacta (`[onclick="openModal('modal-new-task')"]`) para que el listener solo se adjunte a los botones reales de "+ Nueva Tarea". Mismo patrón y mismo fix aplicado al modal de nueva cuenta (`populateAccountPlatformSelect`), que tenía el bug idéntico.
- Hallazgo de §8 resuelto: no listado explícitamente en §8 (bug reportado directamente por el usuario, no detectado en el análisis estático original).
- Qué quedó pendiente: §8.5 (navegación rota en mobile), §8.6 (uso inconsistente de escHtml), §8.7 (evento DOMSubtreeModified obsoleto) y los pendientes de tooling/portafolio (§8.8-10) siguen abiertos.

### 2026-07-02 (sesión 2)
- Qué cambió: saveTask() ahora bloquea (con toast de error) asignar una cuenta que ya está ocupada por otra tarea, tanto al crear como al editar; populateTaskModal() deshabilita esas opciones en el select (la cuenta propia de la tarea en edición sigue habilitada); taskNumber ahora se calcula como max(taskNumber existentes en la quest) + 1 en vez de count + 1, así que no se reusa un número tras borrar una tarea intermedia.
- Hallazgo de §8 resuelto: 3 (UI, modal de nueva tarea) y 4 (integridad de datos, taskNumber).
- Qué quedó pendiente: §8.6 (uso inconsistente de escHtml) y §8.7 (evento DOMSubtreeModified obsoleto) siguen abiertos, además de los pendientes de tooling/portafolio (§8.8-10).

### 2026-07-02
- Qué cambió: deleteQuest() ahora libera cuentas cuya activeTaskId apuntaba a una tarea de la quest eliminada; deleteAccount() valida tareas vinculadas (aviso específico en el confirm) y limpia accountId a null en vez de dejarlo huérfano.
- Hallazgo de §8 resuelto: 1 (integridad de datos, deleteQuest) y 2 (integridad de datos, deleteAccount).
- Qué quedó pendiente: §8.3 (modal de nueva tarea permite elegir cuenta ocupada) y §8.4 (taskNumber puede repetirse) siguen abiertos.

<!-- Agregar una entrada nueva arriba de esta línea al cerrar cada sesión de trabajo.
Formato sugerido:
### YYYY-MM-DD
- Qué cambió:
- Hallazgo de §8 resuelto (si aplica):
- Qué quedó pendiente:
-->

