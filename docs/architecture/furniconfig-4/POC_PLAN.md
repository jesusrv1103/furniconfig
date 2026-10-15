# POC_PLAN — Plan de Prueba de Concepto / MVP técnico (FASE-4A)

> **Diseñado, NO implementado.** Ningún paso de este documento se ha
> ejecutado. Cada paso declara criterios de aceptación y las pruebas que
> deberán escriturarse cuando la fase de implementación esté autorizada.

## 0. Presupuesto y supuestos

| Supuesto | Valor |
|----------|-------|
| Alcance | 10 pasos del encargo de Fase 4A |
| Paquetes nuevos | `modeler-core`, `kernel-adapter` (instalación de `manifold-3d` **pendiente de aprobación**) |
| Lo que NO cambia | `geometry-core`, `WardrobeConfig`, diseños locales, suites existentes |
| Dependencias nuevas | Solo la aprobada para el kernel (ADR-001); ninguna más |
| Criterio global | `npm test`, `npm run typecheck`, `npm run build` y `npm run test:visual` **siguen en verde** |

## Etapa 0 — Prueba de viabilidad del kernel (antes de escribir el modelo)

> Se ejecuta **antes** de los 10 pasos. Si falla, se aplica la alternativa
> aprobada `three-bvh-csg` (ver ADR-001). **Manifold está aprobado como
> candidato para esta evaluación, no como motor definitivo**: la elección
> definitiva se toma con los resultados de esta etapa.

| # | Prueba de viabilidad | Criterio de aceptación |
|---|----------------------|------------------------|
| V1 | Carga de `manifold-3d` bajo Vite 8 | El WASM carga con init `async` en dev y en `vite build`; sin errores de resolución de módulo |
| V2 | Tamaño real de descarga | Peso comprimido medido y registrado en `ENGINE_COMPARISON.md` (objetivo hipotético < 1 MB brotli) |
| V3 | Operación básica en < 100 ms | `Extrude` de un rectángulo 1200×600×18 mm y `Cube` se resuelven en el objetivo (medir, no asumir) |
| V4 | Determinismo | Misma entrada → misma malla (comparar buffers en dos ejecuciones) |
| V5 | Sin requisitos de hosting | No se necesitan cabeceras COOP/COEP en el modo elegido |

---

## Los 10 pasos del MVP

### Paso 1 — Abrir un documento vacío

- **Implementación**: `createEmptySceneDocument()` en `modeler-core`;
  `validateSceneDocument` acepta; UI de modelador con escena y rejilla.
- **Criterios de aceptación**:
  1. El documento creado valida (`ok: true`), tiene `documentVersion: 1`,
     `objects: []` y un id determinista (`scene-1` o equivalente).
  2. La escena muestra rejilla y el estado vacío sin errores de consola.
  3. `npm run typecheck` sin errores.
- **Pruebas** (`modeler-core/tests/document.test.ts`):
  - nominal: `createEmptySceneDocument` → documento válido, determinista.
  - límite: dos documentos creados consecutivamente no comparten ids.
  - inválido: `validateSceneDocument({})` → `ok: false` con
    `ERR_SCENE_INVALID_VERSION`.

### Paso 2 — Dibujar un rectángulo sobre un plano

- **Implementación**: Tool `rectangle` sobre plano de trabajo; preview con
  `SnapEngine`; pointer capture + clickGuard reutilizados.
- **Criterios de aceptación**:
  1. Un arrastre crea un `Sketch2D` cerrado con 4 puntos **mm enteros**
     sobre el plano activo (invariantes I1/I2 de `SCENE_DOCUMENT.md`).
  2. Un arrastre degenerado (área 0) **no** crea objeto y no lanza excepción.
  3. Un clic de órbita (drift > 5 px) **no** dibuja (clickGuard).
  4. Escape cancela el gesto sin dejar estado parcial.
- **Pruebas**:
  - Unitarias: croquis válido; área 0 → `ERR_SCENE_DEGENERATE_SKETCH`;
    puntos no enteros → rechazo; determinismo.
  - Unitarias de snapping: `snap()` a rejilla con tolerancia, sin candidatos
    → punto crudo, prioridad de `vertex` sobre `grid`.
  - Visual (Playwright, checks nuevos): el arrastre deja la silueta del
    rectángulo en el canvas.

### Paso 3 — Introducir ancho y alto numéricamente

- **Implementación**: campos de entrada con validación mientras se dibuja y
  después (patrón de teclado accesible como
  `SeparatorKeyboardControls.tsx`).
- **Criterios de aceptación**:
  1. Escribir ancho/alto actualiza el croquis con **mm enteros**.
  2. Valores inválidos (0, negativos, no numéricos, > rango PROVISIONAL) se
     rechazan con mensaje y **conservan** el último valor válido.
  3. El cambio genera **una** entrada de historial (no una por tecla).
- **Pruebas**:
  - Unitarias: `setSketchDimension(sketch, 'widthMm', 1200)` devuelve nuevo
    croquis; entradas límite (1, 0, -1, 1e9, '12a'); sin mutación de la
    entrada (Object.freeze).
  - Visual: escribir en el campo refleja la silueta; el foco de teclado no
    rompe la navegación existente.

### Paso 4 — Extruirlo para generar un sólido

- **Implementación**: `Command('set-extrusion')` +
  `kernel.fromSketch(points, height)`; cache de `MeshData`.
- **Criterios de aceptación**:
  1. El croquis se convierte en sólido con altura en mm enteros.
  2. La malla resultante es **cerrada (2-manifold)** según la garantía del
     kernel (comprobar `status` sin error) y sus bounds coinciden con
     `sketch × extrusión` ± 1 mm.
  3. La carga del WASM es **diferida**: la app no espera al kernel para
     mostrar el configurador existente.
  4. Se libera la caché (`dispose`) al borrar el objeto (sin fugas).
- **Pruebas**:
  - Unitarias (con stub de `GeometryKernel`, sin WASM en CI):
    `fromSketch` recibe mm enteros y devuelve `MeshData` con `indices`
    dentro de rango.
  - Integración (solo si se autoriza WASM en CI): V3/V4 de la etapa 0.
  - Visual: aparece el sólido con sombra en el canvas.

### Paso 5 — Seleccionarlo

- **Implementación**: `SelectionManager` (nivel `object`), reutilizando
  `clickGuard` y el patrón de `resolveSelection`.
- **Criterios de aceptación**:
  1. Clic sobre el sólido lo selecciona; resaltado visible (patrón
     `emissive` existente).
  2. Clic en el vacío lo deselecciona (mismo fallback que
     `WardrobeViewer.tsx`).
  3. Arrastrar para orbitar **nunca** selecciona.
  4. La selección es un estado serializable (lista de ids).
- **Pruebas**:
  - Unitarias: `resolveObjectSelection(document, pick)` con objeto válido,
    id inexistente → `null`, documento vacío → `null`.
  - Visual: checks nuevos de selección (anclajes `data-*` como los
    existentes `data-selected-module`).

### Paso 6 — Modificar sus dimensiones

- **Implementación**: `Command('set-extrusion')` / `set-sketch` desde panel
  de propiedades (patrón numérico de la Fase 3D con anchos).
- **Criterios de aceptación**:
  1. Cambiar ancho/alto/profundidad regenera la malla y actualiza cotas.
  2. El cambio es **una** entrada de historial y es reversible con Ctrl+Z.
  3. Límites fuera de rango → mensaje con el máximo permitido (mismo molde
     que "se informa el máximo (1.728 mm)" de la Fase 3D) y valor
     **descartado**.
  4. Tras regenerar, la selección y el encuadre se conservan.
- **Pruebas**:
  - Unitarias: `apply`/`revert` de `set-extrusion` son inversos; idempotencia
    (`apply(apply(d))` no cambia si el valor es el mismo); determinismo.
  - Unitarias de límites: 0, negativos, máximo +1, valores no enteros.
  - Visual: la silueta cambia (píxeles distintos) y el undo la restaura
    (0,0000 % de diferencia, patrón de estabilidad existente).

### Paso 7 — Guardarlo en un formato propio versionado

- **Implementación**: `serializeScene`/`parseSceneExport` +
  `PersistenceAdapter` (patrón `transfer.ts`).
- **Criterios de aceptación**:
  1. El archivo contiene `format: 'furniconfig-scene'` y `version: 1`.
  2. JSON hostil (sin marcador, versión desconocida, objeto corrupto) →
     error **sin escribir** nada (misma semántica que
     `DesignStorageError('incompatible-version')`).
  3. Round-trip: `parse(serialize(doc))` es **estructuralmente igual** al
     original (mm enteros intactos).
  4. No se modifica el formato `furniconfig-design` existente.
- **Pruebas**:
  - Unitarias: round-trip, versión desconocida, marcador ausente,
    `documentVersion` desconocido, ids duplicados → `ERR_SCENE_DUPLICATE_ID`.

### Paso 8 — Cerrar y restaurar el documento

- **Implementación**: `SceneRepository` (localStorage) + `SceneLibrary`
  (molde de `DesignLibrary`).
- **Criterios de aceptación**:
  1. Cerrar y reabrir restaura **exactamente** el documento (comparación
     estructural).
  2. Almacenamiento no disponible → error `storage-unavailable` sin pérdida
     (mismo patrón de degradación que `local-storage.ts`).
  3. Cuota llena → mensaje legible y los cambios siguen en memoria
     (patrón de la prueba "una escritura fallida (cuota llena) se comunica
     sin perder los cambios").
  4. Los diseños de clóset existentes siguen intactos tras guardar/restaurar
     un documento de escena.
- **Pruebas**:
  - Unitarias con `memory-storage.ts` (helper existente): restauración
    exacta, cuarentena de registros corruptos, coexistencia de claves
    `furniconfig.designs` y la nueva.
  - Visual: guardar → recargar → el documento vuelve igual.

### Paso 9 — Deshacer y rehacer operaciones

- **Implementación**: `CommandHistory` (comandos con `apply`/`revert`).
- **Criterios de aceptación**:
  1. Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y funcionan **solo** en el
     modo modelador y no interfieren con el historial del configurador
     (guardas `isEditableTarget` existentes).
  2. Undo/redo recorren los 10 pasos sin corromper el documento (validación
     en cada estado).
  3. Una nueva operación tras undo descarta el `future` (mismo comportamiento
     que `commitEditorHistory`).
  4. Límite de historial respetado (p. ej. 100) sin crecimiento ilimitado.
- **Pruebas**:
  - Unitarias: secuencia apply/revert/apply; descarte de `future`; límite;
    determinismo; inverso exacto (`revert(apply(d))` estructuralmente igual).
  - Visual: deshacer restaura la silueta (0,0000 % de píxeles distintos).

### Paso 10 — Convertir el sólido en un componente paramétrico básico

- **Implementación**: `ParametricComponentDef` con `paramsSchema`
  (p. ej. `ancho`, `alto`, `fondo`, `espesor`) y `build()` que regenera el
  `SceneGeometryRef`.
- **Criterios de aceptación**:
  1. El sólido seleccionado se convierte a `ComponentInstance` con
     `params` explícitos y **misma geometría visual** (silueta idéntica).
  2. Cambiar un parámetro fuera de rango → `ERR_SCENE_PARAMS_OUT_OF_RANGE`
     y valor descartado.
  3. El componente es persistible (sobrevive al paso 8) y sus parámetros se
     editan en panel.
  4. **Bonus de integración**: registrar `furniconfig.wardrobe` delegando en
     `geometry-core` inserta un clóset dentro del documento **sin modificar**
     `packages/geometry-core`.
- **Pruebas**:
  - Unitarias: `build(params)` determinista; schema valida rangos; round-trip
    del componente por serialización.
  - Unitarias de integración: `ComponentInstance` con `params: WardrobeConfig`
    → `calculateGeometry` produce los mismos `Panel[]` que hoy (179 tests del
    motor intactos como referencia).
  - Visual: insertar clóset + sólido en la misma escena renderiza ambos.

## Resumen de aceptación global

| # | Paso | Prueba principal |
|---|------|------------------|
| 1 | Documento vacío | `validateSceneDocument` + determinismo |
| 2 | Rectángulo en plano | croquis entero + clickGuard + snapping |
| 3 | Entrada numérica | límites + una entrada de historial |
| 4 | Extrusión | manifold + bounds ±1 mm + WASM diferido |
| 5 | Selección | clic/vacío/orbita + resaltado |
| 6 | Modificar dimensiones | inverso apply/revert + límites + undo |
| 7 | Guardar versionado | round-trip + JSON hostil |
| 8 | Restaurar | restauración exacta + degradación |
| 9 | Undo/Redo | inversos + descarte de future + límite |
| 10 | Componente paramétrico | misma silueta + schema + delegación a geometry-core |

## Criterio de "hecho" de la PoC completa

1. Los 10 pasos con sus criterios verificados por pruebas **reales**
   (unitarias nuevas + visuales nuevas).
2. Las suites existentes (179 + 343 + 200 visuales) **sin cambios**.
3. `npm run typecheck`, `npm test`, `npm run build` en verde.
4. Resultados de la etapa 0 (V1–V5) registrados en
   `ENGINE_COMPARISON.md` y `RISKS.md`, **sin presentar hipótesis como
   resultados**.
