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
  title?: string,            // opcional (ver §8/changelog sesión 9) — tareas creadas antes no lo tienen
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
  status: 'free' | 'busy' | 'esperando_tokens',   // tercer valor: ver §8/changelog sesión 10
  activeTaskId: string | null,   // siempre null cuando status es 'free' o 'esperando_tokens'
  waitReactivation?: string,     // datetime-local opcional, solo relevante si status === 'esperando_tokens'
  waitNote?: string,             // nota corta opcional, solo relevante si status === 'esperando_tokens'
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

### 2026-07-08 (sesión 15)
- Qué cambió: arranque de **Fase 3 · Funciones nuevas** del plan de cambios — ticket **Q4** completo, y la mitad de **Q5** que no dependía de ninguna decisión pendiente (color de cuentas). La otra mitad de Q5 (color de quests) quedó **explícitamente pendiente**, ver más abajo.
  - **Q4** (`index.html`, `app.js`, `style.css`): sistema de categorías configurables para quests, reemplazando por completo al de etiquetas (`tags[]`), tal como fija la sección "Decisiones → Resuelta" del plan. Incluye el cierre de **Q1** (el buscador de tags no filtraba bien) por la vía que el propio plan preveía: no se "arregló" el bug, se retiró el código que lo tenía.
    - Antes de tocar código: el helper de tags (`initTagInput`/`renderTagsDisplay`/`getTags`/`setTags`/`getActiveTagFilters`/`renderTagFilterBar`) resultó estar **compartido entre 3 features distintas** — tags de quest (a retirar), tags de notas globales y tags de notas de quest (ninguna de las dos mencionada en el plan, fuera de alcance). Se retiró únicamente el cableado específico de quests (`quest-tags-input`/`quest-tags-display`/`quest-tag-filters`, el `initTagInput('quest-tags-input', ...)` puntual, y el `tags` dentro de `saveQuest()`/`editQuest()`/`renderQuests()`); los helpers en sí y los otros 2 usos quedaron intactos — un test de regresión confirma que agregar un tag a una nota global todavía funciona.
    - Modelo: `Quest.tags[]` (multi) pasa a `Quest.categoryId` (single, nullable) — una quest tiene a lo sumo una categoría, no varias. Nueva colección `DB.categories` (`ait_categories`, `{id, name, createdAt}`), con CRUD en Settings calcado 1:1 del patrón ya existente para Plataformas (`renderCategoriesSettingsList`/`addCategory`/`removeCategory`, misma clase `.platform-item`/`.tag-list-edit`, cero CSS nuevo). Sumadas a `exportData()`/`importData()`.
    - Borrar una categoría en uso **no borra las quests**: las desvincula (`categoryId: null`), mismo criterio que `deleteQuest()` ya usa con las cuentas que quedan apuntando a una tarea borrada (hallazgo §8.1) — confirmar antes de borrar cuántas quests se ven afectadas, y avisar en el `confirm()`.
    - Filtro de categoría en la lista de Quests (`renderQuestCategoryFilter()`): reemplaza a `getActiveTagFilters`/`renderTagFilterBar` de antes, pero como single-select (pills, mismo patrón que `renderQuestStatusFilter()`) en vez de multi-select como era el de tags — una quest ya no puede tener 2 categorías a la vez, no tiene sentido filtrar por intersección. Si todavía no hay ninguna categoría creada, la barra se deja vacía en vez de mostrar un solo pill "Todas" sin nada para comparar (mismo comportamiento que ya tenía la barra vieja con `allTags=[]`).
    - Precarga del select de categoría al abrir "+ Nueva Quest": mismo patrón exacto (selector `[onclick="openModal('modal-new-quest')"]`, exact-match y no substring) que ya usan el modal de tarea y el de cuenta, por la misma razón ya documentada ahí (un selector por substring también engancha los botones de cerrar/cancelar del modal).
  - **Q5 — cuentas** (`index.html`, `app.js`, `style.css`): color libre por cuenta vía `<input type="color">`, sin depender de categorías (a diferencia de Q5-quests). Se muestra como un punto de color aparte, en el header de la card — **no** se tocó el `border-left` de `.account-card` (ese sigue comunicando status: libre/ocupada/esperando, es información distinta y ya funcionaba bien). Un `<input type="color">` no soporta `value=""` (el navegador lo interpreta como negro), así que no entra en el array genérico de `resetForms()` — se resetea aparte, a mano, al mismo violeta neutro (`#7b5ea7`) que trae por defecto el HTML, para que cancelar la edición de una cuenta roja no deje ese rojo pisado la próxima vez que se abre "+ Nueva Cuenta".
- Qué se dejó explícitamente pendiente: **Q5 — quests** (heredar color de categoría vs. color libre por quest, igual que cuentas). El propio plan marca esto como una **decisión de producto sin resolver** ("Decisiones → Pendiente"), no como un detalle de implementación a criterio de la sesión — a diferencia de otras decisiones técnicas de esta misma sesión (ej. reusar `.platform-item` para categorías, o single-select vs. multi-select en el filtro) que sí se resolvieron acá porque son de implementación, no de producto. No se adivinó una respuesta: queda listo para la próxima sesión en cuanto se defina.
- Cómo se verificó: mismo arnés `jsdom` + `http.server` local de las sesiones anteriores. 21 checks para Q4 (sin restos de UI de tags de quest en el DOM, Settings lista/agrega/rechaza duplicados de categorías, filtro por categoría en Quests, el select del modal se puebla y preselecciona bien, guardar persiste `categoryId`, borrar una categoría en uso desvincula sin borrar quests, y — control de regresión — el tag-input de notas globales sigue funcionando) + 7 checks para Q5-cuentas (dot por cuenta, color exacto guardado, fallback para cuentas viejas sin color, precarga al editar, reset a default al cerrar el modal, persistencia al guardar, `border-left` de status sin tocar) + smoke test de las 7 vistas. 46 checks, todos correctos.
- Hallazgo de §8 resuelto: ninguno directamente, pero el cuidado de no tocar los otros 2 usos del helper de tags (notas) es la misma disciplina de fondo que motiva los hallazgos de §8 — un cambio con alcance claro no debería tener efectos secundarios en código que comparte función/helper pero no comparte propósito.
- Qué quedó pendiente: Q5-quests (bloqueado por la decisión de producto de arriba). Fase 4 (T1, D2) sigue sin empezar. Sigue abierto todo lo de sesiones anteriores (§8.7, autosave de notas de sesión 7/8, tooling/portafolio §8.8-10, concurrencia de auto-release de sesión 12).

### 2026-07-08 (sesión 14)
- Qué cambió: segundo lote del plan de cambios (**Fase 2 · UX sobre datos ya corregidos**) — tickets **Q2** y **T2**, agrupados por el propio plan porque comparten componente (`renderQuestTasks`, tab "Tareas" del detalle de quest).
  - **Q2** (`index.html`, `app.js`): el tab "Tareas" de una quest no tenía filtro — completadas mezcladas con las activas/esperando. Se agregó una barra de 2 pills ("Pendientes" / "Todas") con el mismo lenguaje visual que `renderQuestStatusFilter()` de la lista de Quests (`.filter-tags` / `.tag.active`), pero como acá el pedido no era un filtro de 4 estados sino ocultar completadas por defecto con un escape hatch a ver todo, se armó una función nueva (`renderQuestTaskFilter()`) en vez de reusar la de Quests tal cual. Estado en `currentQuestTaskFilter` (default `'pendientes'` = `en_progreso` + `esperando_tokens`), y se resetea a ese default cada vez que `showView('quest-detail', questId)` cambia de quest — mismo mecanismo que ya existía para `currentQuestNoteId`, para no arrastrar el filtro de una quest a otra (incluso volviendo a una quest ya vista antes).
  - **T2** (`app.js`, dentro de `renderQuestTasks`): cuando la tarea tiene título, ese título pasa a ser el dato principal (`card-title`) y "Tarea #N" baja a dato secundario dentro de `card-sub` (ya venía en `font-size:12px`, no hizo falta CSS nuevo). Sin título, se mantiene el comportamiento original (`card-title` = "Tarea #N"). Se resolvió sólo en este componente (tab Tareas de quest-detail) — el plan agrupa T2 con Q2 explícitamente por "comparte componente: la lista de tareas", y las otras 3 vistas que también muestran "Tarea #N" (dashboard, vista global de Tareas, Cuentas) son componentes distintos, fuera del alcance de este ticket tal como está escrito en el plan.
- Cómo se verificó: mismo arnés `jsdom` + `http.server` local de las sesiones anteriores, contra `index.html`/`app.js` reales. 18 checks para Q2+T2: filtro por defecto oculta la completada, click en "Todas" muestra las 3 tareas de la quest, el filtro se resetea al cambiar de quest incluso volviendo a una ya vista, el empty-state distingue "sin tareas en la quest" de "hay tareas pero el filtro no matchea ninguna", título real queda como dato principal cuando existe y "Tarea #N" baja a secundario, y el fallback a "Tarea #N" como principal se mantiene intacto cuando no hay título. Sumado: smoke test de las otras 4 vistas (Dashboard/Quests/Tareas global/Cuentas) para confirmar que no se rompió nada fuera del componente tocado, y grep de control confirmando que los fixes de C1/D1 (sesión 13) siguen intactos. 18 checks, todos correctos.
- Hallazgo de §8 resuelto: ninguno directamente, pero el reset de `currentQuestTaskFilter` en `showView()` sigue la misma disciplina que ya regía para `currentQuestNoteId`: estado que vive por-quest se re-arma explícitamente al cambiar de quest en vez de dejarlo pegado de la anterior.
- Qué quedó pendiente: el resto del plan de cambios (Fases 3 y 4) sigue sin empezar. Q1 (buscador de tags) sigue sin resolver, a la espera de que se planifique Q4. La decisión pendiente del plan (si el color de Q5 depende de la categoría de Q4) tampoco se tocó — no bloqueaba esta fase. Sigue abierto todo lo de sesiones anteriores (§8.7, autosave de notas de sesión 7/8, tooling/portafolio §8.8-10, concurrencia de auto-release de sesión 12).

### 2026-07-06 (sesión 13)
- Qué cambió: primer lote del documento externo "Plan de cambios" (Fase 1 · Bugs rápidos) — tickets **C1**, **Q3** y **D1**. **Q1 se dejó afuera a propósito** (ver más abajo).
  - **C1** (`style.css`): "ocupada" compartía color con acciones destructivas (`--danger`), leyéndose como alerta en vez de estado normal. `.badge-busy` y `.account-card.busy` pasan al mismo tono neutro que ya usa "pausada" (`--muted`, `rgba(107,122,153,.15)`), sin tocar la lógica de bloqueo de reuso de la cuenta (eso queda igual a propósito, es decisión de diseño, no bug).
  - **Q3** (`app.js`): una tarea que pasó por `esperando_tokens` y después se marcaba `completada` (o volvía a `en_progreso`) seguía mostrando la fecha de reactivación y la nota de cierre viejas en las tarjetas. Causa real: `saveTask()` persistía lo que hubiera en esos dos inputs sin importar el status elegido, aunque el wrap quedara oculto por `toggleReactivationField()` — el input no se limpia solo por ocultarse. Fix en dos capas: (1) `saveTask()` sólo guarda `reactivation`/`notesClosure` mientras el status sea `esperando_tokens`, y los deja vacíos en cualquier otro caso; (2) por si ya había datos viejos guardados de antes de este fix, las vistas que muestran esos campos (`renderDashboard` en cuentas ocupadas, `renderQuestTasks`, `renderTasks`, `renderAccounts`) ahora también chequean `status === 'esperando_tokens'` antes de mostrarlos, no sólo que el valor exista.
  - **D1** (`app.js`, `renderDashboard`): las tarjetas de "cuentas ocupadas", "tareas esperando tokens" y "cuentas esperando tokens (sin tarea)" no navegaban al clickear — sólo "quests activas" lo hacía. Las tres navegan ahora a `quest-detail` de la tarea/cuenta correspondiente (o a Cuentas si no hay tarea asociada), y se sumó `cursor:pointer` a las cuatro tarjetas del dashboard (incluida la de quests activas, que ya navegaba) para que las cuatro se vean clickeables por igual. Se resolvió ahora en vez de dejarlo para la Fase 4 (el propio ticket lo daba como opción) porque terminó siendo un cambio chico, acotado a `renderDashboard()`.
- Qué se dejó afuera a propósito: **Q1** (buscador por etiquetas no filtra) no se tocó. El propio plan lo marca como "probablemente ya no valga la pena" dado que tags se retira en Q4 (Fase 3, todavía no hecha) y deja la decisión final para cuando se planifique ese ticket — no tiene sentido arreglar el buscador de un sistema que va a retirarse pronto.
- Cómo se verificó: arnés `jsdom` (mismo enfoque de la sesión 12: `http.server` local + `index.html`/`app.js` reales, ya que `localStorage` no está disponible para el origen `file://`). Para Q3: se creó una tarea real vía `populateTaskModal()` + `saveTask()` como esperando_tokens (confirma que se sigue guardando normalmente), se la editó a completada sin tocar los inputs de reactivación/notas (replica el bug tal cual ocurre) y se confirmó que quedan vacíos; por separado, se sembraron datos ya "viejos" (tarea en_progreso con reactivation/notesClosure de antes de este fix) y se confirmó que ninguna de las vistas los muestra, más un caso de control (tarea genuinamente esperando_tokens) para confirmar que su badge/nota siguen apareciendo sin falsos negativos. Para D1: se simuló `.click()` en cada una de las 3 tarjetas antes rotas y se verificó la vista activa resultante (clase `.active` + `qd-title` renderizado) — no se pudo leer `currentView`/`currentQuestId` directamente porque son `let` de scope de módulo y no quedan expuestas en `window` en un script clásico (a diferencia de las `function`, que sí quedan), así que hay que verificar por el DOM, igual que lo haría un usuario real. 16 checks, todos correctos.
- Hallazgo de §8 resuelto: ninguno directamente (estos tres tickets vinieron del plan externo, no de este listado), pero Q3 es de la misma familia que el hallazgo de sesión 8: un campo que se oculta condicionalmente pero se sigue leyendo/guardando igual. Ahí era autosave de notas: acá es un input tapado por CSS. La lección se repite — si dos campos se muestran juntos bajo una condición, hay que gobernar la lectura *y* la escritura por esa misma condición, no sólo la visibilidad.
- Qué quedó pendiente: **Q1** sigue sin resolver, a la espera de que se decida el destino de tags al planificar Q4. El resto del plan de cambios (Fases 2, 3 y 4) sigue sin empezar. Sigue abierto todo lo de sesiones anteriores (§8.7, autosave de notas de sesión 7/8, tooling/portafolio §8.8-10) y el pendiente anotado en la sesión 12 (edición concurrente justo en el instante de un auto-release).

### 2026-07-06 (sesión 12)
- Qué cambió: pedido del usuario — las cuentas/tareas "esperando tokens" no se liberaban solas al cumplirse la hora de reactivación; había que revisar el reloj y liberarlas (o reeditar la tarea) a mano. Se agregó `checkAutoReleases()` en `app.js`, sin cambios en `index.html` ni `style.css`:
  - Corre al cargar la app (catch-up inmediato por si algo venció con la app cerrada), cada 30s mientras sigue abierta (`autoReleaseCheckMs`), y de nuevo apenas la pestaña recupera foco o visibilidad (`visibilitychange`/`focus`) — un timer de una pestaña en segundo plano puede frenarse varios minutos, así que sin este último chequeo la detección podría demorar.
  - Caso 1 (tarea con cuenta): tarea `esperando_tokens` cuya `reactivation` ya pasó → vuelve a `en_progreso` (no a `completada`; eso sigue siendo decisión manual, a diferencia de lo que hace `freeAccount()`) y se limpia su `reactivation` (evita un badge "⟳ [hora pasada]" en una tarea ya reanudada). La cuenta asociada no se toca: ya estaba `busy` desde que se creó la tarea sin importar si esta estaba en_progreso o esperando_tokens (§7).
  - Caso 2 (cuenta sin tarea): cuenta `esperando_tokens` cuya `waitReactivation` ya pasó → mismo resultado que apretar "✓ Ya tengo tokens" (vuelve a `free`, limpia `waitReactivation`/`waitNote`).
  - Notificaciones: reutiliza el `showToast()` existente (no se agregó Web Notifications API — el pedido era notificar "si tengo la app abierta", que un toast ya cumple sin pedir permisos). Como el toast es un único elemento y una misma pasada puede liberar varias cuentas/tareas a la vez (típico al reabrir después de varias horas), se agregó una cola (`queueReleaseToast`/`drainReleaseToastQueue`) que las muestra una por una en vez de perder todas menos la última; si hay más de 3 en una pasada, se resumen como "+N más" para no encadenar una docena de toasts seguidos.
  - El refresco de vista tras un auto-release evita a propósito `renderQuestDetail()` (llama a `renderQuestTasks`/`renderQuestStats` directo): `renderQuestDetail()` también dispara `renderQuestNotes()`, que recarga el editor de notas desde `DB` y pisaría una edición sin guardar todavía si el usuario está escribiendo una nota de quest en ese momento — mismo riesgo que el hallazgo de la sesión 8, evitado acá por no tocar notas para nada.
- Cómo se verificó: arnés con `jsdom` (servido vía `http.server` local, ya que `localStorage` no está disponible para el origen `file://` que usa jsdom por defecto) cargando `index.html`+`app.js` reales. Dataset: una tarea con cuenta y `reactivation` vencida, una con `reactivation` futura, una cuenta `esperando_tokens` sin tarea vencida, una sin tarea futura. Confirmado: la vencida con tarea pasa a en_progreso y limpia su reactivation sin tocar la cuenta (que sigue busy apuntando a la misma tarea), la vencida sin tarea pasa a free y limpia sus campos, ninguna de las dos futuras se toca antes de tiempo, y la tarea liberada nunca queda `completada`. Un segundo escenario con 5 liberaciones simultáneas confirmó que la cola encola y muestra cada mensaje (no sólo el último) y que el resumen "+N más" aparece al superar el máximo de toasts individuales. 16 checks, todos correctos.
- Hallazgo de §8 resuelto: ninguno (feature nueva pedida por el usuario).
- Qué quedó pendiente: si se edita una tarea/cuenta justo en el instante en que el auto-release la procesa (ventana de segundos), el modal abierto no se entera del cambio y un "Guardar" posterior podría pisarlo con los valores viejos del formulario — mismo riesgo general de concurrencia que ya existe hoy entre dos pestañas editando lo mismo (no es nuevo de esta feature, sólo un gatillo adicional para él); no se abordó por estar fuera del alcance pedido. También queda abierto, si se quiere a futuro, sumar Web Notifications API (aviso incluso con la pestaña en segundo plano, no sólo abierta) — no se agregó porque el pedido explícito era "si tengo la app abierta", que el toast ya cubre sin pedir permisos de por medio. Sigue abierto todo lo de siempre: §8.7 (evento `DOMSubtreeModified` obsoleto), autosave por cambio de tags en notas de quest (sesión 7), mismo riesgo de autosave en notas globales (sesión 8), y los pendientes de tooling/portafolio (§8.8-10).

### 2026-07-05 (sesión 11)
- Qué cambió: ajuste visual/UX pedido por el usuario — las notas (de quest y globales) se leían muy anchas en pantallas grandes: `.note-title-input`, `.note-body-input` y `.note-meta` heredaban el 100% del ancho de `.notes-editor`, que a su vez ocupa toda la columna `1fr` del grid `.notes-layout` sin ningún tope. Se agregó la variable `--note-max-width: 720px` en `:root` (mismo patrón que `--sidebar-width`) y se aplicó como `max-width` a esas 3 clases en `style.css`. El valor busca una medida de lectura cómoda para el cuerpo (`system-ui` 14px) sin recortar de forma agresiva contenido técnico (rutas, nombres de función, URLs) frecuente en estas notas.
- Por qué así (decisiones de diseño): no se tocó el ancho de la card `.notes-editor` en sí — sigue ocupando toda la columna con el mismo fondo `--surface`, así que no aparece un color de fondo distinto al costado del texto. El bloque de texto quedó alineado a la izquierda (sin `margin:auto` para centrarlo) para no tener que re-alinear también `.note-delete-btn` (que sigue con `align-self:flex-start`, sin cambios): centrar solo el texto y dejar el botón de eliminar pegado al borde izquierdo del panel se hubiera visto desalineado. Mantiene el diff acotado a 4 líneas de CSS. Sin impacto esperado en mobile: la media query a 768px ya cambia `.notes-layout` a una sola columna angosta, muy por debajo del nuevo máximo.
- Hallazgo de §8 resuelto: ninguno (mejora de UX pedida directamente por el usuario, no un bug del análisis original — mismo criterio que sesión 6).
- Qué quedó pendiente: nada identificado como pendiente de este cambio en sí. Sigue abierto lo de siempre: §8.7 (evento `DOMSubtreeModified` obsoleto), autosave por cambio de tags en notas de quest (sesión 7), mismo riesgo de autosave en notas globales (sesión 8), y los pendientes de tooling/portafolio (§8.8-10).

### 2026-07-04 (sesión 10)
- Qué cambió: pedido del usuario — "se acaban los tokens y no tengo tareas pendientes, quiero poder poner una cuenta en espera desde Cuentas sin necesidad de una tarea". Se agregó un tercer valor de `status` para Cuenta: `'esperando_tokens'`, independiente de cualquier tarea (a diferencia del estado "esperando tokens" que ya existía a nivel de tarea). Cambios:
  - `Cuenta` gana 2 campos opcionales: `waitReactivation` (datetime, opcional) y `waitNote` (texto corto, opcional) — ambos solo relevantes cuando `status === 'esperando_tokens'`.
  - Se reusó deliberadamente el mismo string `'esperando_tokens'` que ya usan las tareas (en vez de inventar un nombre nuevo), para heredar gratis el badge/color ya existente (`.badge-esperando_tokens`, ámbar) y el label ("esperando") de `statusLabel()`. `statusLabel()` se extendió con `free: 'libre', busy: 'ocupada'` para poder usarlo también en cuentas.
  - `index.html`: nuevo modal `modal-account-wait` (fecha de reactivación opcional + nota opcional) y nueva sección en el Dashboard "Cuentas esperando tokens (sin tarea)".
  - `markAccountWaiting(id)` (nueva, solo aplica a cuentas `free`) y `saveAccountWait()` (nueva): guardan el estado + los 2 campos opcionales.
  - `freeAccount(id)`: ahora también limpia `waitReactivation`/`waitNote` al volver a `free` — la misma función sirve tanto para "Liberar" (cuenta busy con tarea real, comportamiento sin cambios) como para "✓ Ya tengo tokens" (cuenta esperando sin tarea), el label del botón cambia según el estado actual pero la función es la misma.
  - `renderAccounts()`: reemplaza el binario `isFree` por manejo de los 3 estados — badge/borde según `a.status`, bloque de info de espera (nota + fecha) cuando corresponde, y el botón "⏳ Esperando tokens" solo aparece en cuentas libres.
  - Dos puntos que dependían de `status === 'busy'` de forma exacta se extendieron a `status !== 'free'`, para que una cuenta esperando tokens sin tarea se trate igual de "no disponible" que una ocupada: el selector de cuenta en el modal de tarea (`populateTaskModal`, ahora agrupa ambos casos bajo un optgroup renombrado "No disponibles", con label distinto según cuál sea) y la validación de `saveTask()` que bloquea asignar una cuenta no disponible.
  - `resetForms()`: se sumaron los 3 inputs nuevos del modal de espera.
- Por qué no rompe con datos existentes: toda cuenta ya guardada tiene `status: 'free'` o `'busy'` — ninguna se migra ni cambia sola. `waitReactivation`/`waitNote` son puramente aditivos y solo se leen cuando `status === 'esperando_tokens'`, que ninguna cuenta vieja tiene.
- Cómo se verificó: dataset con una cuenta libre, una cuenta busy vieja con una tarea real asociada (sin tocar en todo el test), y una segunda cuenta libre. Se recorrió: vista de Cuentas antes y después de marcar una cuenta en espera (badge, borde, nota, botón), el Dashboard (la sección nueva muestra la cuenta en espera, la sección de tareas esperando y la de cuentas ocupadas no se ven afectadas), el selector de cuentas al crear una tarea (la cuenta en espera aparece deshabilitada bajo "No disponibles"), el bloqueo de `saveTask()` si se fuerza igual la asignación, "✓ Ya tengo tokens" devolviendo la cuenta a libre y limpiando los campos, que la cuenta busy real quedó intacta durante todo el proceso, y `resetForms()`. 25 checks, todos correctos.
- Hallazgo de §8 resuelto: ninguno (feature nueva pedida por el usuario).
- Qué quedó pendiente: nada identificado como pendiente de esta feature en sí. Sigue abierto todo lo ya anotado en sesiones anteriores (§8.7, autosave de tags en notas de quest, notas globales con el mismo riesgo de sesión 8).

### 2026-07-04 (sesión 9)
- Qué cambió: las tareas ahora tienen un campo `title` **opcional** (pedido por el usuario, con el requisito explícito de no romper las tareas ya guardadas sin ese campo). Cambios:
  - `index.html`: nuevo input "Título (opcional)" en el modal de tarea, entre "Cuenta" y "Descripción".
  - `saveTask()`: lee `task-title`, lo guarda en `create` y en `edit`; **no** se agregó a la validación de campos obligatorios (sigue bloqueando solo por quest/cuenta/descripción, igual que antes).
  - `editTask()`: precarga el input con `t.title || ''`, así que una tarea vieja sin `title` simplemente abre el campo vacío en vez de mostrar `undefined`.
  - `resetForms()`: se sumó `task-title` a la lista de campos que limpia al abrir el modal.
  - Las 5 vistas que muestran una tarea (dashboard "cuentas ocupadas", dashboard "esperando tokens", tab Tareas del detalle de quest, vista general de Tareas, vista de Cuentas) ahora muestran el título si existe, siguiendo el mismo patrón `Tarea #N — {título}` que ya se usaba en el dashboard para el nombre de quest — cuando `title` no existe, el string queda exactamente igual que antes (ningún cambio visual para datos viejos).
  - Buscador de la vista Tareas: ahora también matchea contra `title`, con `(t.title || '')` para no romper con tareas que no lo tienen.
  - No hizo falta tocar `exportData()`/`importData()`: no validan un esquema fijo, así que el campo nuevo viaja solo.
- Por qué no rompe con datos existentes: `title` es puramente aditivo — ninguna tarea existente se reescribe ni se migra. Cada punto de lectura usa `t.title || ''` (o el operador ternario `t.title ? ... : ''` en los templates) en vez de asumir que el campo existe, así que una tarea sin `title` en `localStorage` nunca produce `undefined` en pantalla ni rompe un `.toLowerCase()`.
- Cómo se verificó: se armó un dataset de prueba con una tarea "vieja" (sin `title`, simulando data pre-existente) y una tarea "nueva" (con `title`) en la misma quest y misma DB, y se recorrieron las 5 vistas, el buscador, `editTask()` en ambas tareas, guardar una edición de título, crear una tarea nueva sin completar el título, y `resetForms()`. 17 checks, todos correctos — ninguna vista muestra `undefined`, la tarea vieja se sigue viendo y buscando igual que antes, y la nueva expone el título donde corresponde.
- Hallazgo de §8 resuelto: ninguno (feature nueva pedida por el usuario, no un bug del análisis original).
- Qué quedó pendiente: el título no es obligatorio ni siquiera para tareas nuevas (decisión explícita, confirmada con el usuario antes de implementar). Si en el futuro se quiere hacer obligatorio solo para tareas nuevas, el cambio es puntual en la validación de `saveTask()`.

### 2026-07-04 (sesión 8)
- Contexto: el usuario aplicó el fix de la sesión 7 y confirmó que el problema seguía ocurriendo con este repro puntual: entrar a una quest, escribir una nota, salir de la quest, volver a la misma quest, y la nota aparecía sin guardar. Esto significaba que había una segunda causa distinta, no cubierta por el fix anterior.
- Qué cambió (root cause real): `autosaveQuestNote()` usa un debounce de 1.5s antes de escribir a `localStorage`. Si el usuario navega fuera de la quest-detail (a otra vista, a otra nota, o a otra quest) *antes* de que se cumplan esos 1.5s, el temporizador pendiente sigue corriendo en segundo plano con el `currentQuestNoteId` y los valores de `document.getElementById('qd-note-title'|'qd-note-body')` que existan en ese momento. Dos casos:
  - Si se vuelve a entrar a la **misma** quest dentro de esa ventana de 1.5s, `renderQuestNotes()` → `loadQuestNoteEditor()` recarga el título/cuerpo desde `DB.questNotes` — que todavía tiene el valor **viejo**, porque el guardado real no había ocurrido — y pisa lo que el usuario acababa de escribir en el input visible. Cuando el timer finalmente corre, guarda ese valor ya revertido: la edición se pierde en silencio (reproducido y confirmado con un test automatizado antes de tocar el código).
  - Si se navega a **otra** quest, `currentQuestNoteId` se resetea a `null` antes de que el timer corra; el timer entonces aborta (`if (!currentQuestNoteId) return`) y la nota nunca llega a guardarse.
  - Fix: se separó la escritura real a `DB` en `commitQuestNoteSave()` (reutilizada tanto por el debounce como por el flush), y se agregó `flushQuestNoteAutosave()`, que cancela el timer pendiente y guarda de inmediato. Se la invoca al principio de `showView()` (cubre salir de la quest-detail a cualquier otra vista, y cambiar de una quest a otra), en `selectQuestNote()` y en `newQuestNote()` (cambiar de nota dentro de la misma quest). En `deleteCurrentQuestNote()` se cancela el timer sin guardar (la nota se va a borrar, no tiene sentido escribirla). Como red de seguridad adicional se agregó un flush en `beforeunload` para el caso de cerrar/refrescar la pestaña dentro de la ventana del debounce.
- Cómo se verificó: se armó un arnés de pruebas con `jsdom` que carga `index.html`+`app.js` reales y simula la secuencia exacta reportada (escribir → esperar 400ms → salir → esperar 500ms → volver a la misma quest → esperar a que corra cualquier timer restante), confirmando primero que el bug se reproducía tal cual con el código de la sesión 7, y después que quedaba resuelto con el fix. Se probaron además los escenarios hermanos: guardado normal sin navegar (sigue mostrando "Guardando..." → "✓ Guardado" correctamente), cambiar de nota dentro de la misma quest a mitad del debounce, cambiar de quest a mitad del debounce, y borrar una nota a mitad del debounce (no debe "resucitarla"). Los 5 casos pasan. (Nota metodológica: el primer intento de este arnés daba un falso FAIL en el caso de guardado normal porque disparaba `DOMContentLoaded` manualmente además del que `jsdom` ya dispara solo de forma nativa/asíncrona, duplicando la inicialización de la app a mitad de la prueba. Se corrigió esperando el evento nativo en vez de duplicarlo.)
- Hallazgo de §8 resuelto: no listado explícitamente en §8 (bug reportado directamente por el usuario, no detectado en el análisis estático original).
- Qué quedó pendiente: las notas **globales** (`autosaveGlobalNote`, `currentGlobalNoteId`, `renderGlobalNotes()`) tienen la misma arquitectura y muy probablemente el mismo bug — `showView('notes')` llama a `renderGlobalNotes()` completo, así que salir de la vista de notas y volver dentro de la ventana de 1.5s debería revertir una edición pendiente de la misma forma. No se tocó porque no fue lo reportado y para no exceder el alcance pedido; el mismo patrón (`commitGlobalNoteSave` + `flushGlobalNoteAutosave`, invocado desde `showView()` y `selectGlobalNote()`) aplicaría casi sin cambios si se confirma que se quiere corregir también ahí. Sigue abierto también §8.7 (evento `DOMSubtreeModified` obsoleto) y la falta de autosave por cambio de tags en notas de quest (anotada en la sesión 7).

### 2026-07-03 (sesión 7)
- Qué cambió: se corrigió un bug reportado por el usuario donde las notas de quest se quedaban indicando "Guardando..." y nunca mostraban confirmación de guardado (el dato sí se persistía en `localStorage`, pero la UI nunca lo confirmaba). Causa raíz: `autosaveQuestNote()`, al terminar de guardar, ponía el texto `'✓ Guardado'` en `qd-note-save-status` y a continuación llamaba a `renderQuestNotes()` — la misma función que recarga el editor completo vía `loadQuestNoteEditor()`, la cual, como parte de su lógica normal (limpiar el status al cambiar de nota), resetea ese mismo campo a `''`. Como ambas líneas corrían en el mismo tick síncrono del `setTimeout`, el navegador nunca llegaba a pintar la confirmación — pasaba directo de "Guardando..." a texto vacío. Fix: se extrajo el renderizado de la lista lateral de notas a una función nueva `renderQuestNotesList()` (mismo patrón que ya existía para notas globales con `renderGlobalNotesList()`, que es justamente por qué las notas globales nunca tuvieron este problema), y `autosaveQuestNote()` ahora llama a esa versión liviana en vez de a `renderQuestNotes()`.
- Hallazgo de §8 resuelto: no listado explícitamente en §8 (bug reportado directamente por el usuario, no detectado en el análisis estático original).
- Qué quedó pendiente: §8.7 (evento `DOMSubtreeModified` obsoleto) y los pendientes de tooling/portafolio (§8.8-10) siguen abiertos. Nota fuera de alcance detectada durante esta sesión: a diferencia de las notas globales, las notas de quest no tienen ningún listener que dispare el autoguardado cuando *solo* cambian las tags (no hay equivalente de `DOMSubtreeModified` para `qd-note-tags-display`) — si se agrega o quita una tag sin tocar título/cuerpo, ese cambio no se autoguarda hasta que otro campo dispare el autosave. No estaba en el alcance de este fix (mismo criterio de §8.7: reemplazar por una llamada directa en vez de depender de un evento obsoleto), pero es candidato para una sesión futura.

### 2026-07-02 (sesión 6)
- Qué cambió: dos ajustes visuales/UX pedidos por el usuario. (1) Pestaña Quests: se agregó un filtro por estado (`#quest-status-filter`, pills "Activas/Pausadas/Completadas/Todas" con el mismo patrón visual que los filtros de tags) mediante la nueva función `renderQuestStatusFilter()` y la variable global `currentQuestStatusFilter` (default `'activa'`, single-select). `renderQuests()` ahora filtra por ese estado antes de calcular los tags disponibles y aplicar búsqueda/tag-filters, así que por defecto la lista solo muestra quests activas (la búsqueda por texto y el filtro por tags ya existían de una sesión anterior y siguen funcionando igual, combinados con el nuevo filtro de estado). También se diferenció el mensaje de lista vacía: "No hay quests que coincidan con el filtro" si hay quests en la DB pero el filtro no matchea nada, vs. el mensaje original solo cuando la DB está realmente vacía. (2) Dashboard, sección "Cuentas ocupadas": las cards con `task.desc` largo crecían sin límite. Se agregó la clase `.card-desc-clamp` (`-webkit-line-clamp:2` + `overflow:hidden`) aplicada solo a esa card del dashboard (no se tocó `.card-desc` global para no afectar las descripciones completas en las vistas de Quests/Tareas, donde sí se quiere ver el texto completo).
- Hallazgo de §8 resuelto: no listado explícitamente en §8 (mejoras de UX pedidas directamente por el usuario, no bugs del análisis estático original).
- Qué quedó pendiente: §8.7 (evento `DOMSubtreeModified` obsoleto) y los pendientes de tooling/portafolio (§8.8-10) siguen abiertos.

### 2026-07-02 (sesión 5)
- Qué cambió: se corrigieron dos bugs reportados por el usuario. (1) Las notas de quest "se filtraban" entre quests: `currentQuestNoteId` es una variable global que no se reseteaba al cambiar de quest desde `showView()`, y `renderQuestNotes()` no limpiaba el editor cuando la nota activa no pertenecía a la quest actual (`notes.find(...)` daba `undefined` y el `if (note)` simplemente no entraba, dejando el texto de la nota anterior en los inputs). Fix: `showView()` resetea `currentQuestNoteId = null` cuando `currentQuestId` cambia, y se agregó `clearQuestNoteEditor()` (mismo patrón que `loadQuestNoteEditor()`) que se llama desde `renderQuestNotes()` cuando no hay nota activa válida para la quest actual. (2) El badge de estado en las tarjetas de la pestaña Cuentas aparecía visualmente fuera de la card: `.account-card-header` es `display:flex` con `justify-content:space-between`, pero el `<div>` izquierdo (platform/alias/email) no tenía `min-width:0`, así que un email largo sin espacios no se podía encoger y empujaba el badge fuera del ancho disponible. Fix en `style.css`: `min-width:0` en el contenedor izquierdo, `overflow-wrap:break-word` en `.account-alias`/`.account-email`, `flex-shrink:0` en el badge y `gap:8px` en el header.
- Hallazgo de §8 resuelto: no listado explícitamente en §8 (ambos bugs reportados directamente por el usuario, no detectados en el análisis estático original).
- Qué quedó pendiente: §8.7 (evento `DOMSubtreeModified` obsoleto) y los pendientes de tooling/portafolio (§8.8-10) siguen abiertos.

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

