# CURRENT_ARCHITECTURE — Diagnóstico de la arquitectura actual (FASE-4A)

> Auditoría de solo lectura del repositorio real, 15/10/2026.
> Base: `origin/main` @ `1f5a67a`.
> Todas las rutas y nombres son **reales** (verificados leyendo el código).
> Ninguna función fue modificada en esta fase.

## 1. Vista general

```
furniconfig/                      (npm workspaces)
├── packages/geometry-core/       Motor paramétrico puro, sin dependencias
│   └── src/  contract/ engine/ errors.ts index.ts types/
└── apps/web/                     React 19 + Vite 8 + R3F 9 + three 0.186.1
    └── src/  components/ lib/ hooks/
```

Dependencias runtime de `apps/web` (según `apps/web/package.json`):
`@furniconfig/geometry-core`, `@react-three/drei@^10.7.9`,
`@react-three/fiber@^9.8.1`, `react@^19.3.0`, `react-dom@^19.3.0`,
`three@^0.186.1`. **Sin librería de estado global** (sin zustand/redux/
Context): el estado vive en `apps/web/src/App.tsx`.

## 2. Motor geométrico — `packages/geometry-core`

### 2.1 Punto de entrada y contratos

- `packages/geometry-core/src/index.ts` — reexporta todo (`export *`).
- `src/contract/wardrobe-config.ts` — `WardrobeConfig`,
  `WARDROBE_CONFIG_SCHEMA_VERSION = 1`.
- `src/contract/limits.ts` — `WARDROBE_LIMITS` (todo PROVISIONAL).
- `src/contract/validate.ts` — `validateWardrobeConfig(input: unknown):
  ValidationResult` (recopila todos los errores, no lanza).
- `src/errors.ts` — `GeometryError` con `code: GeometryErrorCode` (unión de
  **22 códigos estables**).

### 2.2 Motor

| Función | Archivo | Qué hace |
|---------|---------|----------|
| `calculateGeometry(config): GeometryResult` | `src/engine/geometry.ts` | valida + resuelve + construye todo |
| `resolveWardrobe(config): Wardrobe` | `src/engine/geometry.ts` | materiales con ids deterministas, defaults |
| `distributeModules(input)` / `maxFixedWidthMm` | `src/engine/distribute.ts` | reparto entero de anchos, Fase 3D |
| `buildPanels(wardrobe): Panel[]` | `src/engine/panels.ts` | laterales, superior, inferior, entrepaños, divisiones, trasero |
| `buildRods(wardrobe): HangingRod[]` | `src/engine/rods.ts` | barras de colgado |
| `buildDrawers(wardrobe)` | `src/engine/drawers.ts` | 5 paneles por cajón + `DrawerAssembly` |
| `buildDoors(wardrobe)` / `doorOpeningTransform` | `src/engine/doors.ts` | hojas, tiradores, transform de apertura |

### 2.3 Representación geométrica real (hallazgo clave)

**El motor NO trabaja con mallas, vértices, aristas, caras, triangulación,
extrusión ni booleanas.** Devuelve:

- `Panel { id; role; moduleId; materialId; sizeMm; positionMm }` — **cada
  panel es una caja ortogonal (AABB)** con esquina mínima.
- `HangingRod` / `DoorHandle` — cilindros **descritos paramétricamente**
  (eje, longitud, diámetro, posición), sin discretizar.
- `doorOpeningTransform(door, angle)` — **datos** de transformación (eje de
  bisagra + ángulo firmado) para que la presentación rote sin mutar datos.

Veredicto: `geometry-core` es un **solver/constructor de piezas ortogonales
paramétricas**, no un kernel de geometría general. La única detección de
intersección (SAT 2D con recorte de polígonos) vive como helper de test en
`packages/geometry-core/tests/doors.test.ts`, **no en el motor**.

### 2.4 Pureza

Verificada por auditoría: sin dependencias `dependencies`/`peerDependencies`,
sin imports externos, sin `Math.random`/`Date`/`console`/`process`, sin estado
mutable de módulo; inmutabilidad y determinismo cubiertos por tests
(`Object.freeze`, doble ejecución). **179 pruebas** en 8 suites
(`packages/geometry-core/tests/`).

## 3. Capa de presentación — `apps/web`

### 3.1 Escena

- `src/components/WardrobeViewer.tsx` — `<Canvas>` + toolbar DOM + estado de
  presentación (ángulo de puertas, visibilidad, arrastre, cotas, unidades,
  peticiones de vista). Atributos `data-view`, `data-doors-visible`,
  `data-selected-module` como anclajes de pruebas visuales. Aquí vive el
  **clickGuard** (umbral `CLICK_DRIFT_PX = 5` px entre `onPointerDown` y
  clic, para distinguir órbita de selección).
- `src/components/WardrobeScene.tsx` — construye la escena:
  - `useMemo(() => toRenderablePanels(geometry.panels))`; cada panel es un
    `<mesh>` con `BoxGeometry` **cacheadas** (`boxGeometries: Map` clave
    `sizeM.join('|')`) y `CylinderGeometry` para barras.
  - `handlePick(event, moduleId)` (línea ~489): `clickGuard` →
    `stopPropagation` → `onModulePicked`.
  - Materiales cacheados por `materialId` con resaltado
    (`emissive: '#2f6feb'`); IBL procedural con `PMREMGenerator` +
    `RoomEnvironment`; `<OrbitControls>` de drei con damping y límites
    polares.
  - `CameraRig` (interno): encuadre inicial, vistas solicitadas y "encuadrar
    módulo" mediante `useLayoutEffect`.
- `src/lib/panels-to-mesh.ts` — **única** adaptación panel→malla
  (`toRenderablePanel(s)`, `toRenderableRods`, `toRenderableDoors`).
- `src/lib/units.ts` — **única** conversión mm↔m (`mmToM`, `mToMm`,
  `formatMm`).
- `src/lib/materials.ts` — `toRenderMaterial`, `toRenderRodMaterial`.

### 3.2 Selección

- `src/lib/studio/selection.ts` (puro): `resolveSelection(geometry, id)`,
  `moduleContext(geometry, id)`, `moduleBoundsMm(geometry, id, opts)`.
- `src/App.tsx`: estado `selectedModuleId` → `selectionId` memoizado →
  efecto de limpieza si el módulo desaparece.
- La selección es **por módulo del mueble**, no por objeto arbitrario ni por
  cara/vértice.

### 3.3 Cámara

- `src/lib/camera-views.ts` (puro): `CameraView = 'isometric' | 'front' |
  'side'`, `VIEW_DIRECTIONS`, `fitDistance(...)` (cierre analítico sobre 8
  esquinas), `viewPosition`, `reframe`.
- `OrbitControls` de drei (`makeDefault`), con `minDistance`/`maxDistance`
  relativos a la referencia de encuadre.

### 3.4 Historial

- `src/lib/studio/history.ts` (puro): `EditorHistory { past, present,
  future, limit }` con `EDITOR_HISTORY_LIMIT = 50`; guarda **`WardrobeConfig`
  completo** por entrada (referencias, sin clonar); dedupe con `sameConfig`.
- `src/hooks/use-editor-history.ts`: `update()` (edición registra paso),
  `resetTo()` (cambio externo reinicia), atajos Ctrl/Cmd+Z y
  Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y.
- `App.tsx` gestiona `dragPreview` (borrador no confirmado durante el
  arrastre) y confirma **una sola entrada** al soltar.

**Observación para 4.0**: el historial es genérico en lógica pero está
tipado contra `WardrobeConfig`.

### 3.5 Persistencia

- `src/lib/designs/types.ts` — `DESIGN_STORAGE_VERSION = 1`,
  `DESIGN_SESSION_VERSION = 1`, `DesignRecord { id, name, createdAt,
  updatedAt, storageVersion, config }`.
- `src/lib/designs/repository.ts` — interfaces `DesignRepository`,
  `SessionStore`, `DesignStorage`.
- `src/lib/designs/local-storage.ts` — `createLocalStorageDesignStorage`,
  claves `furniconfig.designs` / `furniconfig.session`; versiones
  desconocidas → `DesignStorageError('incompatible-version')` **antes de
  escribir**; registros corruptos en cuarentena.
- `src/lib/designs/validate.ts` — `validateDesignRecord` valida **siempre**
  con `validateWardrobeConfig` del motor.
- `src/lib/designs/transfer.ts` — `DESIGN_EXPORT_FORMAT =
  'furniconfig-design'`, `serializeDesign`, `parseDesignExport` (JSON hostil
  con marcador + versión).
- `src/lib/designs/library.ts` — `class DesignLibrary` con deps
  inyectables; `create/saveActive/rename/duplicate/remove/exportJson/
  importJson`.
- `src/lib/designs/autosave.ts` — `createAutosaveScheduler` con debounce y
  reloj inyectable.
- `src/hooks/use-design-session.ts` — orquestación React de la sesión.

### 3.6 Mutación de configuración

- `src/lib/config.ts` — funciones **puras** que devuelven nueva
  `WardrobeConfig`: `setDimension`, `setModuleCount`, `setModuleKind`,
  `setModuleWidth`, `releaseModuleWidth`, `fixSelectedRedistributeOthers`,
  `setDoorsEnabled`, `setBackPanelEnabled`, materiales, etc.
- `src/lib/derive.ts` — `deriveGeometryState(config)` único puente
  config→geometría (captura `GeometryError`).
- `src/lib/studio/separators.ts` — `computeDragResult` (Fase 3F.2).
- `src/lib/studio/dimensions.ts` — cotas (Fase 3F.1).
- `src/lib/studio/templates.ts`, `src/lib/studio/tabs.ts`.

### 3.7 Herramientas de interacción existentes (reutilizables)

- **Pointer capture + raycasting plano**: `src/components/
  DividerDragHandle.tsx` — `setPointerCapture`, `raycaster.intersectPlane`
  sobre plano dinámico, cancelación con Escape/blur/pointercancel/
  lostpointercapture; helpers exportados y testeados:
  `extractDividers`, `isDragDegenerate`, `dragPlaneNormal`,
  `createOrbitGuard` (`tests/divider-drag-helpers.test.ts`).
- **Teclado accesible**: `src/components/SeparatorKeyboardControls.tsx`
  reutiliza la misma lógica pura.
- **Anti-drag en clic**: `clickGuard` en `WardrobeViewer.tsx`.

## 4. Pruebas existentes

| Suite | Archivos | Casos |
|-------|----------|-------|
| `packages/geometry-core/tests/` | 8 | **179** |
| `apps/web/tests/` (Vitest, node + `renderToString`) | 25 | **343** |
| `apps/web/tests/visual/visual-check.mjs` (Playwright) | 1 | **200 checks** |

Recuento del monorepo: `npm test` → 522 unitarias (179 + 343). Las visuales
son un script Node aparte (`npm run test:visual --workspace @furniconfig/web`).

## 5. Acoplamientos técnicos (inventario)

### Reutilizables sin tocar el dominio

| Elemento | Ruta |
|----------|------|
| Unidades mm↔m | `apps/web/src/lib/units.ts` |
| Encuadre de cámara analítico | `apps/web/src/lib/camera-views.ts` + `CameraRig` |
| Caché de geometrías/materiales y disposal | `apps/web/src/components/WardrobeScene.tsx` |
| clickGuard anti-órbita | `apps/web/src/components/WardrobeViewer.tsx` |
| Pointer capture + plano de arrastre + OrbitGuard | `apps/web/src/components/DividerDragHandle.tsx` |
| Motor de historial (generalizando el tipo) | `apps/web/src/lib/studio/history.ts` |
| Autoscheduler con reloj inyectable | `apps/web/src/lib/designs/autosave.ts` |
| Patrón repository + validate + transfer | `apps/web/src/lib/designs/*` |
| Render de cotas (consumiendo `DimensionSpec[]`) | `apps/web/src/components/WardrobeDimensions.tsx` |
| Navegación por pestañas WAI-ARIA | `apps/web/src/lib/studio/tabs.ts` |

### Ligado a `WardrobeConfig` / dominio del clóset

| Elemento | Ruta |
|----------|------|
| Adaptación panel→malla | `apps/web/src/lib/panels-to-mesh.ts` |
| Selección de módulos | `apps/web/src/lib/studio/selection.ts` |
| Separadores por módulo | `apps/web/src/lib/studio/separators.ts` |
| Cotas del mueble | `apps/web/src/lib/studio/dimensions.ts` |
| Derivación config→geometría | `apps/web/src/lib/derive.ts` |
| Helpers de configuración | `apps/web/src/lib/config.ts` |
| Validación de diseños | `apps/web/src/lib/designs/validate.ts` (`DesignRecord.config: WardrobeConfig`) |
| Toda la escena | `apps/web/src/components/WardrobeScene.tsx` (roles de panel, puertas, barras) |

### Deuda técnica detectada (sin corregir en 4A)

1. `computeSeparatorLimits` (`apps/web/src/lib/studio/separators.ts`)
   devuelve límites ficticios `{-9999, 9999}`; los reales los calcula
   `computeDragResult`.
2. `extractDividers` (`DividerDragHandle.tsx`) convierte mm→m **inline**
   (÷1000/÷2000) en vez de usar `mmToM` de `units.ts`.
3. `DividerDragHandle` crea `THREE.BoxGeometry`/`MeshBasicMaterial` en el
   JSX sin caché ni `dispose` (contradice la política de la propia escena).
4. `apps/web/src/App.tsx` concentra sesión + historial + preview + selección
   (composition root con varios contratos cruzados).

## 6. Conclusión para FASE-4A

- **No existe hoy**: documento de escena genérico, kernel de sólidos,
  extrusión, booleanas, snapping, selección por cara/vértice, herramientas de
  dibujo 2D, transformación de objetos libres.
- **Sí existe y se reutiliza**: convención de coordenadas mm (ADR-003/004),
  validación con errores estables, historial, persistencia versionada,
  patrones de pointer/raycasting, encuadre de cámara, materiales, cotas,
  accesibilidad, y una suite de 522 unitarias + 200 visuales que protege la
  regresión.
- El modelador 4.0 se añade como **capa nueva** junto a (no dentro de)
  `geometry-core`; ver `PROPOSED_ARCHITECTURE.md` y `MIGRATION_STRATEGY.md`.
