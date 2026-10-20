# MODELER_4C — Modelador libre: estado tras la FASE-4C-B, 4C-C y 4C-D

> **Estado (FASE-4C-B + 4C-C + 4C-D)**: flujo de modelado libre funcional:
> **dibujar rectángulo → cotas exactas → extruir → seleccionar →
> editar → renombrar → eliminar → DESHACER/REHACER** (historial
> visual conectado al `CommandHistory` de `modeler-core`, §10) y
> **clósets inteligentes** (`furniconfig.wardrobe` v1: insertar,
> renderizar, seleccionar por pieza y editar paramétricamente, §11).
> La pantalla existe desde la
> FASE-4A (`ModelerApp`, ruta `/modeler`, enlace de vuelta al
> configurador). **NO es un CAD completo**: las limitaciones están
> enumeradas en §9. Complementa `SCENE_DOCUMENT.md` (contrato del
> documento) y `MIGRATION_STRATEGY.md` §3 (Fase 4C).

## 1. Herramientas disponibles (4C-A + 4C-B)

| Herramienta | Comportamiento | Origen |
|---|---|---|
| **Seleccionar** | Clic sobre un sólido o sobre **cualquier pieza de un clóset** (raycasting) o en su fila de lista; muestra propiedades con cotas editables | 4C-B / 4C-D |
| **Rectángulo** | Arrastre en el plano del suelo con previsualización; el rectángulo queda **pendiente** (UI) hasta pulsar Extruir | 4C-A (gesto) / 4C-B (extrusión) |
| **Cotas en vivo** | Durante el arrastre se muestran ancho × profundidad; el snap cuantiza a la rejilla (100 mm, PROVISIONAL) | 4C-A |
| **Cotas exactas** | Panel del croquis pendiente: campos ancho/profundidad/extrusión editables antes de extruir | 4C-B |
| **Extruir** | Valida y crea el sólido en el `SceneDocument`; la geometría se deriva asíncronamente | 4C-B |
| **Editar cotas** | Los campos del panel de propiedades actualizan el documento y regeneran la malla | 4C-B |
| **Eliminar** | Quita el objeto del documento; la malla y su estado desaparecen | 4C-B |
| **Insertar clóset** | Sección «Añadir»: crea un clóset paramétrico (`furniconfig.wardrobe` v1) junto a los existentes y lo selecciona | 4C-D |
| **Escape** | Cancela el arrastre a mitad de gesto; con el croquis ya finalizado, lo descarta (vuelve a ninguna herramienta) | 4C-A/B |
| **Vistas** | Ajustar, frontal, cenital y 3/4 (mismas convenciones que el configurador) | 4C-A |

## 2. Flujo de dibujo y extrusión

1. **Gesto** (`lib/modeler/drawing.ts`): pointerdown → `beginDrawGesture`,
   movimiento → `updateDrawGesture` (normaliza los cuatro sentidos, snap
   simétrico a la rejilla), pointerup → `finishDrawGesture` (área degenerada
   = `null`; un clic sin arrastre no dibuja).
2. **Croquis pendiente** (UI): el rectángulo vive en estado de
   `ModelerApp` (`pendingSketch` + `pendingExtrusionMm`), NO en el
   documento; se cotiza exactamente antes de comprometer.
3. **Extruir** (`lib/modeler/document-actions.ts`): valida el croquis
   (`rectangleSketchFromCorners`, mm enteros) y aplica
   `applySceneAction(add-solid)` — el modelador NO muta el documento.
4. **Derivación** (`lib/modeler/scene-geometry-coordinator.ts` →
   `lib/modeler/regeneration.ts`): el servicio regenera cada objeto vía
   `GeometryKernel` (Worker) y publica estados por objeto
   (`pending`/`ready`/`error` con reintento).
5. **Render** (`lib/modeler/mesh-to-renderable.ts` → `ModelerScene`):
   la `BufferGeometry` se crea una vez por malla (§8) y la escena
   renderiza solo lo que el motor devuelve.

## 3. Sistema de coordenadas

- **Croquis en planta**: `u` (ancho) → **X** del modelo; `v`
  (profundidad) → **Z**; la **extrusión es la altura** del sólido en
  **+Y** desde `y = 0`.
- Regla 1 intacta: mm enteros, origen en la esquina
  inferior-izquierda-frontal, posiciones = esquina mínima.
- La conversión **mm → m para render** ocurre exclusivamente en
  `lib/modeler/mesh-to-renderable.ts` (repartida por `lib/units.ts`).
- La rejilla de suelo y las cotas viven en **metros de trabajo** (2,15 m
  de lado, paso 0,1 m) — es la rejilla de dibujo, no el documento.

## 4. Adaptación de orientación geométrica (`ground-sketch-kernel.ts`)

El kernel `ManifoldGeometryKernel.fromSketch` extruye en **su** plano XY
hacia +w, pero el producto exige planta XZ + altura +Y. El adaptador de
la capa de aplicación intercambia y↔z del resultado:

```
kernel (u, v, w)  →  escena (x = u, y = w, z = v)
```

El intercambio es **impropio** (determinante −1): invierte la
orientación de la malla, por lo que el adaptador **revierte el
winding** de cada triángulo (índices [1]↔[2]) para conservar normales
hacia fuera. Verificado por volumen firmado (positivo antes y después).

Ámbito honesto: **solo** los refs creados por `fromSketch` se
transforman. `box`/CSG quedan en coordenadas del kernel y esta
adaptación debe **revisarse** cuando el modelador use esas operaciones
(fases de booleanos). El resto del flujo (`dispose`, `disposeAll`,
cancelación) se delega sin cambios.

Garantías del adaptador (tests de la suite `ground-sketch-kernel`):
puro (sin mutar los buffers de entrada), sin redondeos (solo permuta
componentes), delegación completa de recursos.

## 5. Política de precisión

- **Documento**: mm enteros (`validateSceneDocument`); las cotas
  exactas de 4C-B se escriben como enteros en el `SceneDocument`.
- **Snap de dibujo**: cuantiza a la rejilla de100 mm con redondeo
  simétrico en `.5` (`snapMm`) — paso **PROVISIONAL** sujeto a
  confirmación de carpintería.
- **Frontera del kernel**: las entradas se validan en `kernel-adapter`
  (mm enteros); la cuantización de la **salida** del kernel sigue
  abierta (`SCENE_DOCUMENT.md` §8.1) — el modelador no depende de ella
  porque sus croquises son ortogonales.
- **Render**: las posiciones de las mallas viajan en `Float32Array`
  (precisión de representación de Three.js); la capa de aplicación no
  redondea nada.

## 6. Inicialización diferida del Worker

El kernel WASM (Manifold, monohilo) vive en un **Web Worker** que se
crea **bajo demanda**: `ensureKernel` solo se invoca cuando hay sólidos
que derivar; una escena vacía nunca lo toca. Mientras inicializa
(~1–2 s la primera vez), los objetos quedan en estado `pending` honesto
y las acciones del usuario se acumulan sobre el documento: al estar
listo el motor se deriva **una sola vez la última revisión** (sin
trabajo duplicado). Verificado en tests (`ensureKernel` diferido) y en
los checks visuales 7a–7g (incluye el estado de motor "Inicializando…").

## 7. Concurrencia (reglas vigentes)

- **Revisión lockstep**: cada envío incrementa la revisión del
  servicio y la local en el coordinador; un resultado se aplica solo si
  sigue siendo de la revisión vigente del objeto.
- **Supersede por clave**: regenerar un objeto cancela la petición
  anterior del mismo objeto; eliminarlo cancela la suya.
- **Cancelaciones no son fallos** (`OperationCancelledError`): no
  dejan estado `error`.
- **Sin respuestas antiguas**: los resultados obsoletos se descartan en
  el servicio (`droppedStale`) y, como defensa, en el coordinador.
- **Cero KernelRef huérfanas**: cada ref se libera en `finally` tras
  `toMesh` (o por cancelación); verificado por `liveRefs`/`disposedRefs`
  en los tests del coordinador.

## 8. Ciclo de vida de geometrías de render

`useSolidGeometry` (`components/modeler/use-solid-geometry.ts`) retiene
**UNA** `BufferGeometry` por malla (identidad estable entre renders) y
la libera al **sustituirla** o al **desmontar** (`dispose` de
Three.js). La lógica `retainSolidGeometry` (adopt/release idempotentes,
invariante `disposed === created`) está testada en node; la celosía de
React se verifica en navegador real con el check visual **7l**. Los
contadores miden la adopción del effect, no la construcción: el doble
render de `StrictMode` en dev no los infla.

## 9. Limitaciones conocidas (no es un CAD completo)

- **Rectángulos ortogonales** dibujados en el suelo (sin
  polígonos libres, sin ángulos arbitrarios).
- **Sin operaciones booleanas** (unión/resta/intersección) — los
  comandos `box`/CSG del kernel no están cableados a la UI y su
  orientación requiere revisión (§4).
- **Sin extracción al configurador**: no se puede abrir en el
  configurador un diseño creado en el modelador (Fase 4D). La
  inserción y edición de clósets llegó en 4C-D (§11), pero **todavía
  no se pueden mover ni rotar** los clósets (solo la posición de
  inserción, calculada por `nextWardrobePosition`).
- **Sin persistencia** del modelador (el `SceneDocument` no se guarda
  ni carga).
- Croquis pendiente **solo en UI**: si se recarga la página se pierde.
- La extrusión parte de `y = 0` (sólidos apoyados en el suelo): no hay
  operaciones de desplazamiento vertical.
- Sin snap a ángulos, guías ni construcción asistida.

## 10. Historial visual y edición consistente (4C-C)

- **Fuente única de verdad**: el documento visible es
  `history.present` del `CommandHistory` de `modeler-core`
  (`use-modeler-history.ts`); no existe un `SceneDocument` paralelo
  ni un `setDocument` en la pantalla. Límite PROVISIONAL de **100**
  operaciones conservado.
- **Toda edición pasa por comandos existentes** (`add-object`,
  `set-sketch`, `set-extrusion`, `remove-object`, `rename`); la
  semilla incluye ya el material por defecto para que `add-object`
  valide contra `history.present`. No-op → `executeCommand` devuelve
  la MISMA referencia (sin entrada); conflicto de precondición
  (`SceneError`) → capturado, historial intacto. Un comando nuevo
  tras undo descarta el futuro (§C2).
- **Edición con confirmación** (`CommitField`): borrador local en el
  campo; toda interacción manual se confirma en **Enter** y **blur**
  (y en el evento nativo `change` que el navegador dispara al salir
  con el valor modificado). El tecleo (un carácter por evento), el
  **pegado** (`insertFromPaste`) y el **autocompletado**
  (`insertReplacementText`) son borrador: nunca una entrada por tecla
  ni confirmaciones fuera de Enter/blur. Única excepción: un RELLENO
  COMPLETO de golpe (`insertText` con `data` multicaracter — dictado,
  `setValue`, `fill()` de las herramientas de tests) se confirma de
  inmediato por ser una edición completa. Enter seguido de blur
  deduplica por no-op → UNA entrada por edición (sondas de la
  auditoría en `/tmp/opencode/4c-c/audit-commitfield.mjs`).
- **Undo/Redo visual**: botones en la barra superior (estado
  habilitado/deshabilitado, etiqueta de lo que harían y feedback
  `aria-live`), atajos `Ctrl/Cmd+Z` y `Ctrl/Cmd+Shift+Z` (sin
  `event.repeat`, guardado dentro de INPUT/TEXTAREA/SELECT/
  contentEditable: el campo conserva su deshacer nativo). Los
  botones NO se bloquean mientras el Worker calcula.
- **Selección consistente** (C4): se reconcilia con
  `resolveObjectSelection` en cada cambio de documento; eliminar
  deselecciona, el undo de una eliminación restaura la selección
  previa (stash), renombrar y editar cotas la conservan. Sin
  referencias a objetos inexistentes.
- **Regeneración** (C5): `history.present` alimenta el coordinador
  existente (sin cambios en `regeneration.ts` ni en el kernel-adapter);
  los deshaceres/rehaceres rapidos publican solo la revisión vigente
  (gating por revisión/huella) y liberan la geometría sustituida.
  En dev con `StrictMode` la evidencia honesta de cero fugas es
  **escena vacía → `created === disposed`** (checks 7l y 7v).
- Historiales **independientes** por módulo: el modelador usa
  `use-modeler-history`; el configurador sigue con
  `use-editor-history` (sin estado compartido).

## 11. Clósets inteligentes (4C-D)

- **Inserción (D1)**: botón «Insertar clóset» (sección «Añadir») →
  `buildWardrobeAddCommand` (`document-actions.ts`) con
  `DEFAULT_CONFIG` de `lib/config.ts`, `materialId` del material de
  la semilla y `nextComponentId` determinista (`component-1`…, sin
  colisiones). `nextWardrobePosition` coloca el nuevo a **+200 mm**
  del máximo derecho de los clósets existentes, redondeado a rejilla
  de 10 mm (los sólidos no condicionan la posición). Los `params`
  guardados son la config **normalizada** de la validación
  (`validation.config`, cast a `SceneParams` con el precedente de
  `open-design.ts`). Insertar selecciona el objeto; es reversible con
  Undo/Redo y no altera diseños existentes; dos clósets son
  independientes.
- **Render (D2)**: `ComponentPartsView` adapta `ComponentPart[]` del
  motor (`buildComponent` de geometry-core, **sin Manifold**) a cajas
  y cilindros exactos en mm en `parts-to-mesh.ts` (conversión
  `mm→m` solo en `units.ts`, frontera de unidades). Conserva
  `moduleId`, `doorId`, `hingeSide`, `leafIndex`/`leafCount`
  (**1-based** en el motor) y `assemblyId`/`assemblyIndex`; color
  determinista por rol. Los cilindros usan **24 segmentos radiales
  como aproximación visual de presentación**: radio (= diámetro/2),
  longitud, eje y esquina mínima se conservan EXACTOS (verificado
  pieza a pieza contra el motor en `parts-to-mesh.test.ts`,
  incluido el medio milímetro que el motor emite legítimamente).
  Recursos: `partsGeometryLifecycle` con `adopt`/`release`
  idempotentes (`use-component-parts.ts`, patrón de
  `use-solid-geometry`): toda geometría sustituida o eliminada se
  libera (paridad escena vacía). El montaje doble de `StrictMode`
  (dev) **rearma** la retención (`adopt → release → adopt`): el
  release de sustitución o desmontaje dispone de verdad la
  geometría que el renderer ha vuelto a subir (auditoría 4C-D §3,
  verificado con eventos `dispose` reales de Three.js).
- **Fuente de verdad**: la **geometría paramétrica y los metadatos
  del motor** (`ComponentPart`). El adaptador no inventa
  identificadores (los copia verbatim: `partId` namespaced
  `objeto::pieza`; `doorId`/`assemblyId` locales del motor) ni
  altera cotas, posiciones u orientaciones.
- **Selección (D3)**: el picking resuelve **cualquier pieza** al
  objeto completo (misma `onPickObject` que los sólidos). Las filas
  de la lista llevan chip de tipo («Clóset»/«Sólido») y
  `componentStates` vive **separado** de `solidStates`. Eliminar
  deselecciona; el Undo de una eliminación restaura objeto, piezas y
  selección (reconciliación C4 existente, sin cambios).
- **Edición (D4)**: panel contextual con ancho/alto/profundidad,
  nº y configuración de módulos (etiquetas `MODULE_KIND_LABELS`
  importadas de `lib/config.ts`, sin duplicar), puertas on/off,
  hojas/bisagra (visibles **solo** con puertas activas) y panel
  trasero. Se usan los updaters **puros** de `lib/config.ts`
  (`setDimension`, `setModuleCount`, `setModuleKind`,
  `setModuleShelves`, `setModuleDrawers`, `setDoorsEnabled`,
  `clearDoors`, `setDoorLeaves`, `setDoorHingeSide`,
  `setBackPanelEnabled`) sin modificarlos ni duplicar
  `WARDROBE_LIMITS`. Una operación por confirmación:
  `validateWardrobeConfig` → `createSetParamsCommand` → regeneración
  → selección mantenida → Undo/Redo exacto. Entrada inválida →
  `wardrobeEditError` visible **sin mutar documento ni historial**.
- **Derivación sin Worker (D5)**: los componentes se derivan
  **síncronamente** en el coordinador
  (`scene-geometry-coordinator.ts`, `#componentStates` con gating por
  `objectFingerprint`); `SceneGeometryService` sigue creándose solo
  cuando hay sólidos (**solo clósets → motor «en reposo»**, sin
  Worker ni Manifold) y sus resultados `component-parts` se ignoran
  (fuente única = coordinador). `onChange` conserva su firma
  `(solids)`; `use-scene-geometry` añade el parámetro `components` y
  expone `componentStates` como copia inmutable.
- **Debug/verificación**: `window.__modeler.getComponentStates()`
  (estado/piezas por id) y `getPartsGeometryStats()` (ciclo de vida
  de las piezas), además de `getStates`/`getGeometryStats` de 4C-B/C.
- **Fuera de 4C-D**: **mover o rotar** clósets (solo existe la
  posición de inserción automática), extracción clóset →
  configurador (Fase 4D) y persistencia de escenas.

## 12. Verificación

- **Unitaria** (`npm test`): **1044 tests** (base 1003 + 33 de la fase
  + 8 de la auditoría final) — geometry-core 179, kernel-adapter 87,
  modeler-core 217, web 561.
  Suites de modelador — `drawing`, `sketch-dimension`,
  `mesh-to-renderable`, `document-actions`,
  `scene-geometry-coordinator` (concurrencia + historial §7.13–15),
  `ground-sketch-kernel` (orientación/volumen firmado),
  `use-solid-geometry` (recursos), `use-modeler-history` (semántica
  del historial), `history-shortcuts` (guard de atajos),
  `modeler-shell` (26: chrome + historial + **4C-D**),
  **`wardrobe-components` (18: D1–D5)**,
  **`scene-component-coordinator` (9: componentes sin Worker, mapas
  separados, retry, purge, dispose y conservación de metadatos a lo
  largo del ciclo insertar → editar → undo → redo →
  eliminar/restaurar)** y
  **`parts-to-mesh` (7: auditoría §1 — cajas/cilindros exactos,
  orientación por eje, 24 segmentos de presentación, mm→m único y
  correspondencia 1:1; y auditoría §3 — ciclo de vida con eventos
  `dispose` REALES de Three.js, rearme en StrictMode e
  independencia entre clósets)**.
- **Visuales modelador** (`npm run test:visual:modeler`): **64
  checks** — sección 1 (chrome 4C-A), **7a–7l** (flujo libre, 4C-B),
  **7m–7v** (historial visual 4C-C) y **9a–9p** (4C-D: inserción con
  derivación **síncrona** — 25 piezas listas en ~1,1 s —, render por
  diff de píxeles 10,3 %, posición/material v1, deselección +
  selección desde pieza proyectada, edición con una entrada de
  historial — ~0,7 s —, entrada inválida sin mutar, puertas y
  módulos regenerando piezas, undo/redo de params, eliminar/restaurar,
  segundo clóset con hueco 200 mm, mezcla sólido+clósets, deselección
  y paridad total de ciclos de vida al vaciar la escena:
  **327/327 piezas y 11/11 sólidos**).
- **Visuales configurador** (`npm run test:visual`): **200 checks**
  intactos (no se modifica el configurador en 4C-D; una reejecución
  por un flake no reproducible en la zona 3F.2 del suite base).
- **Flujo manual en Chromium** (14 verificaciones, evidencia en
  `/tmp/opencode/4c-d/manual/`): inserción con motor «en reposo»,
  nombre + ancho/alto/profundidad, entrada inválida sin mutar,
  puertas (hojas/bisagra), **panel trasero on/off**, módulos y
  cajones, undo/redo, segundo clóset independiente, selección desde
  cualquier pieza, sólido junto a los clósets, eliminar/restaurar,
  ráfaga deshacer/rehacer idéntica, escena vacía con paridad
  (829/829 piezas, 2/2 sólidos) y **cero errores de consola**.

## 13. Qué queda (fuera de 4C-D)

- Booleanos (y con ellos, revisar la adaptación de orientación de §4).
- **Mover o rotar clósets** (hoy solo existe la posición de inserción
  automática; el `transform` del componente es `[0,0,0]` + desplazamiento
  en X).
- La vuelta modelador → configurador (`MIGRATION_STRATEGY.md` §3,
  Fase 4D).
- Persistencia del SceneDocument (**hoy las escenas no se guardan**:
  recargar la página vacía el modelador).
- Definitivar el snap de dibujo (100 mm provisional) con carpintería.

### 13.1 Limitaciones de rendimiento conocidas (medidas reales)

- Coste **lineal en nº de piezas**: un clóset por defecto genera
  **25 piezas**, con puertas 1 hoja **31**, con 2 hojas **37**, y hasta
  **~55** con 4 módulos + cajones (medido en Chromium real). La
  inserción completa (validación + derivación + commit + render) tardó
  **~1,1 s** (25 piezas) y una edición de dimensión **~0,7 s** en
  `test:visual:modeler`; ambas dentro del presupuesto UX pero sin
  margen ilimitado si se apilan muchos clósets.
- **Sin instancing** de mallas de piezas (mismo material/rollo): no se
  implementa porque **no se ha demostrado un problema** (criterio de la
  fase: solo optimizar con evidencia).
- Toda edición paramétrica **rederiva el componente completo**
  (determinista, sin estado incremental): simple y sin geometría
  obsoleta, pero regenera todas las piezas del clóset en cada cambio.
- Los cilindros (barras, tiradores) se **tesselan con 24 segmentos**:
  presentación más barata que un cilindro analítico; no afecta a las
  cotas (§11).
- En dev con `StrictMode` el ciclo de vida cuenta **dos adopciones** por
  montaje (adopt → release → adopt): los contadores `created/disposed`
  se emparejan al final (escena vacía), pero sus valores intermedios no
  son "piezas únicas en pantalla".
