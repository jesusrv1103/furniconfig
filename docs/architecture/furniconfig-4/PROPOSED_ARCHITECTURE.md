# PROPOSED_ARCHITECTURE — Arquitectura propuesta del modelador (FASE-4A)

> Diseño **propuesto, no implementado**. Sin dependencias nuevas, sin cambios
> de contrato. La fase de implementación abrirá por separado (no es 3F.3 ni
> está autorizada).

## 1. Principios

1. **Sin sobredimensionar**: solo los módulos necesarios para el MVP de
   `POC_PLAN.md`; los demás se declaran como interfaz y se dejan sin
   implementar.
2. **`geometry-core` intacto**: el modelador es una capa **nueva y paralela**,
   no una extensión del motor del clóset.
3. **Puro en el centro, impuro en los bordes**: lógica de documento/comandos
   sin I/O ni Three.js; la carga del WASM, el almacenamiento y el render viven
   en adaptadores.
4. **Unidad mm enteros en el documento** (regla 1 de `AGENTS.md`); la
   conversión a unidades del kernel ocurre solo en el adaptador.
5. **Renderer desechable**: la escena se deriva del documento; Three.js no
   aparece en el modelador salvo en el adaptador de render.

## 2. Paquetes propuestos

```
packages/
├── geometry-core/          (existente, SIN cambios)
├── modeler-core/           (NUEVO, puro: documento, comandos, snapping, serialización)
└── kernel-adapter/         (NUEVO, con runtime: interfaz GeometryKernel + ManifoldKernel)
apps/web/
└── src/lib/modeler/        (NUEVO, adaptadores de la app: tools, selection, render, persistence)
```

| Paquete | Pureza | Dependencias |
|---------|--------|--------------|
| `modeler-core` | **Pura** (misma regla que `geometry-core`) | ninguna runtime |
| `kernel-adapter` | Adaptador (carga WASM async) | `manifold-3d` *(pendiente de aprobación e instalación)* |
| `apps/web/src/lib/modeler` | Adaptadores de app | React/R3F, `modeler-core`, `kernel-adapter` |

> `modeler-core` no depende de `kernel-adapter`: conoce solo el **tipo**
> `MeshData`. Así se puede probar sin WASM.

## 3. Módulos, responsabilidades e interfaces

Todas las interfaces son **propuestas** (todavía no existen en el código).

### 3.1 Scene Document — `modeler-core/src/document.ts`

Responsabilidad: fuente única de verdad del documento, inmutable.

```ts
type SceneDocumentId = string;

interface SceneDocument {
  readonly documentVersion: 1;          // versionado propio (ver MIGRATION_STRATEGY)
  readonly id: SceneDocumentId;
  readonly name: string;
  readonly gridStepMm: number;          // p. ej. 10 (rejilla base)
  readonly objects: readonly SceneObject[];
  readonly materials: readonly SceneMaterial[];
}

interface SceneObject {
  readonly id: string;                  // determinista: 'object-1', ...
  readonly kind: 'solid' | 'component'; // 'component' = componente paramétrico
  readonly name: string;
  readonly transform: Transform3;       // mm enteros, origen = esquina inf-izq-frontal
  readonly geometry: SceneGeometryRef;  // qué sólido es y con qué parámetros
  readonly materialId: string;
  readonly params?: Readonly<Record<string, number | string | boolean>>;
}

type SceneGeometryRef =
  | { readonly source: 'sketch'; readonly sketch: Sketch2D; readonly extrusionMm: number }
  | { readonly source: 'kernel'; readonly key: string };  // caché: ver 3.2

interface Sketch2D {                    // croquis sobre un plano
  readonly plane: PlaneId;              // 'ground' | 'front' | 'custom'
  readonly pointsMm: readonly Point2[]; // mm enteros
  readonly closed: boolean;
}
```

### 3.2 Geometry Kernel — `kernel-adapter/src/kernel.ts`

Responsabilidad: operaciones de sólidos. Interfaz **pequeña** para poder
sustituir el motor (Manifold → three-bvh-csg → otro) sin tocar la UI.

```ts
interface MeshData {                    // salida normalizada, sin three.js
  readonly positions: Float32Array;     // metros en la frontera de render
  readonly indices: Uint32Array;
  readonly bounds: { min: [number, number, number]; max: [number, number, number] };
}

interface GeometryKernel {
  readonly name: string;                // 'manifold' | 'three-bvh-csg' | ...
  readonly ready: Promise<void>;        // init async (WASM)

  fromSketch(pointsMm: readonly Point2[], extrusionMm: number): MeshData;
  box(sizeMm: Size3): MeshData;
  union(a: KernelRef, b: KernelRef): KernelRef;
  difference(a: KernelRef, b: KernelRef): KernelRef;
  intersect(a: KernelRef, b: KernelRef): KernelRef;
  measure(ref: KernelRef): { volumeMm3: number; boundsMm: Box3 };
  dispose(ref: KernelRef): void;
}
```

**HIPÓTESIS**: `Manifold.Extrude` + `Cube` cubren los pasos 2–7 del MVP;
confirmar en `POC_PLAN.md` etapa 0.

> **Actualización (FASE-4B-C)**: el contrato anterior se implementó en
> `packages/kernel-adapter` (deltas documentados en su README) y, desde 4B-C,
> **todas las operaciones del editor se ejecutarán en un Web Worker dedicado**
> mediante `AsyncGeometryKernel` (reflejo asíncrono con `Promise` + cancelación
> lógica por clave): el WASM es monohilo y síncrono, y medir en Chromium real
> confirmó que el hilo principal se congelaba hasta 1 699,9 ms con booleanas
> densas frente a **16,8 ms** con worker. Manejo de referencias por epoch
> (`unknown-ref` tras reinicio ⇒ reconstruir sólidos desde `SceneDocument`),
> watchdog con reinicio controlado (sin reintento de operaciones) y `MeshData`
> transferible. Sin `geometryCache` ni persistencia aún (4B-D).

### 3.3 Tool System — `apps/web/src/lib/modeler/tools.ts`

Responsabilidad: traducir gestos del usuario en comandos. Un tool activo a
la vez (modelo clásico de editor).

```ts
interface ToolContext {
  readonly document: SceneDocument;
  readonly camera: CameraLike;          // estructural (ya existe patrón en CameraRig)
  readonly pointer: PointerState;       // posición NDC, botones, modifiers
  readonly snapping: SnappingEngine;
  dispatch(command: Command): void;
  setCursor(c: CursorKind): void;
}

interface Tool {
  readonly id: ToolId;                  // 'select' | 'rectangle' | 'pushPull' | 'move'
  onPointerDown(ctx: ToolContext, e: PointerState): void;
  onPointerMove(ctx: ToolContext, e: PointerState): void;
  onPointerUp(ctx: ToolContext, e: PointerState): void;
  onKeyDown?(ctx: ToolContext, e: KeyboardState): void;
  commit(ctx: ToolContext): void;       // emite UN comando → una entrada de historial
  cancel(ctx: ToolContext): void;
}
```

Reutiliza del repo actual: `clickGuard` (anti-órbita), `setPointerCapture`,
`dragPlaneNormal`/`isDragDegenerate` y `createOrbitGuard`
(`apps/web/src/components/DividerDragHandle.tsx`, ver `CURRENT_ARCHITECTURE.md`
§3.7).

### 3.4 Selection Manager — `apps/web/src/lib/modeler/selection.ts`

Responsabilidad: qué está seleccionado, con niveles (el MVP solo usa
`object`).

```ts
type SelectionLevel = 'object';   // futuro: 'face' | 'edge' | 'vertex'
interface SelectionState {
  readonly level: SelectionLevel;
  readonly ids: readonly string[];       // ids de SceneObject
  readonly anchor: string | null;
}
```

**Alcance aprobado**: durante el MVP la selección y la modificación son
**por objeto**. Los niveles `'face' | 'edge' | 'vertex'` son una
**capacidad futura** (fase posterior al MVP): su implementación exige
estructura topológica propia y queda condicionada a una revisión de alcance
(`RISKS.md` R-05). El tipo ya contempla el nivel para no romper contratos
después.

**HIPÓTESIS**: reutilizar `moduleBoundsMm` como molde de cálculo de envolvente
(`apps/web/src/lib/studio/selection.ts`) traslada el patrón a objetos.

### 3.5 Snapping Engine — `modeler-core/src/snapping.ts` (puro)

Responsabilidad: resolver el imán de un punto candidato. **Pura**: recibe
puntos y devuelve el punto imantado; el raycasting es de la capa de app.

```ts
type SnapKind = 'grid' | 'vertex' | 'edge' | 'face' | 'axis' | 'endpoint';

interface SnapCandidate {
  readonly pointMm: Point3;
  readonly kind: SnapKind;
  readonly priority: number;
}

interface SnappingEngine {
  snap(candidates: readonly SnapCandidate[], input: SnapInput): SnapCandidate | null;
}

interface SnapInput {
  readonly rawPointMm: Point3;
  readonly stepMm: number;              // gridStepMm del documento
  readonly enabled: ReadonlySet<SnapKind>;
  readonly toleranceMm: number;         // umbral de atracción (p. ej. 25)
}
```

### 3.6 Transform Gizmos — `apps/web/src/lib/modeler/gizmos.tsx`

Responsabilidad: gizmos de mover/escalar; **MVP**: solo "editores de
dimensión" (campos numéricos) y más adelante gizmo de traslación. No se
implementa rotación en el MVP.

### 3.7 Command System + Undo/Redo — `modeler-core/src/command.ts` (puro)

Responsabilidad: cada operación es un comando reversible. Se generaliza el
patrón de `apps/web/src/lib/studio/history.ts` (que hoy está tipado contra
`WardrobeConfig`).

```ts
interface Command {
  readonly id: string;                  // determinista por contenido (ver nota)
  readonly label: string;               // para UI de historial
  readonly kind: 'add-object' | 'remove-object' | 'set-sketch' | 'set-extrusion'
               | 'set-transform' | 'set-params' | 'rename';
  apply(doc: SceneDocument): SceneDocument;      // puro, inmutable
  revert(doc: SceneDocument): SceneDocument;     // puro, inmutable
}
interface CommandHistory {
  readonly past: readonly Command[];
  readonly present: SceneDocument;
  readonly future: readonly Command[];
  readonly limit: number;               // p. ej. 100
}
```

**Decisión de diseño**: el historial guarda **comandos**, no documentos
completos (el documento crecerá con sólidos). `apply`/`revert` deben ser
**puros y deterministas** (misma entrada → misma salida), lo que permite
serializar el historial en el futuro.

> **Implementado (4B-B)** en `command.ts` (`createCommandHistory`,
> `executeCommand`, `undoCommand`, `redoCommand`, `canUndo`, `canRedo`) y
> `commands.ts` (las 7 fábricas). Delta de contrato sobre este esquema:
> las fábricas reciben además el **documento actual** para capturar el
> delta de reversión (valor previo; en `remove-object`, objeto + índice) y
> validan sus entradas estáticas con `SceneError`. Semántica de resultado
> (FASE-4B-B): (A) cambio válido → entrada nueva; (B) **no-op** (el valor
> ya estaba, detectado por referencia e igualdad estructural, sin
> `JSON.stringify`) → misma referencia de historial; (C) operación
> inválida o conflicto de precondiciones → `SceneError`
> (`ERR_SCENE_OBJECT_NOT_FOUND` / `ERR_SCENE_DUPLICATE_ID` /
> `ERR_SCENE_COMMAND_CONFLICT` / código del validador) con el historial
> intacto. `present` se revalida en cada transición (validación con
> `SceneValidationOptions`, p. ej. registro de componentes). Los ids de
> comando son **deterministas y únicos por contenido**:
> `cmd:tipo:idObjetivo:hash64` (FNV-1a sobre la forma canónica del delta),
> de modo que dos operaciones distintas nunca comparten id; el
> direccionamiento del historial es posicional. Las fábricas congelan los
> insumos nuevos al capturarlos (deltas inmutables, I3).

### 3.8 Serialization — `modeler-core/src/serialize.ts` (puro)

Responsabilidad: formato propio versionado (paso 8 del MVP).

```ts
const SCENE_FORMAT = 'furniconfig-scene';   // análogo a 'furniconfig-design'
const SCENE_FORMAT_VERSION = 1;

interface SceneEnvelope {
  format: typeof SCENE_FORMAT;
  version: typeof SCENE_FORMAT_VERSION;
  document: SceneDocument;
  geometryCache?: Readonly<Record<string, MeshData | SerializedMesh>>; // opcional
}
```

Reglas heredadas del patrón existente (`apps/web/src/lib/designs/transfer.ts`):
marcador + versión + validación completa del JSON hostil; versiones
desconocidas → error **antes de escribir**.

> **Implementado (4B-B)**: `serializeScene(document, options?)` y
> `parseSceneEnvelope(text, options?)`. Delta de contrato sobre este
> esquema: (1) `geometryCache` **no** existe en `SceneEnvelope` v1
> (diferida a 4B-C; el parser ignora claves desconocidas del sobre por
> tolerancia hacia adelante); (2) el parser devuelve un **resultado
> discriminado** `{ ok: true; document } | { ok: false; code; message;
> issues }` en lugar de lanzar (patrón ADR-005 del validador), con códigos
> propios `ERR_SCENE_ENVELOPE_INVALID` / `ERR_SCENE_ENVELOPE_VERSION` y los
> de `validateSceneDocument` reutilizados para el documento; (3)
> `serializeScene` valida antes de escribir y lanza `SceneError` con el
> código del primer hallazgo.

### 3.9 Parametric Components — `modeler-core/src/components.ts`

Responsabilidad: objeto con parámetros que **regenera** su geometría
(paso 10 del MVP).

> **Implementado (FASE-4B-D)**: el contrato real difiere del bosquejo
> original y vive en `types/component.ts` + `components.ts`
> (`defineComponent`/`createComponentRegistry`/`buildComponent`):
>
> ```ts
> interface ParametricComponentDef extends ComponentDefRef {
>   readonly type: string;                // p.ej. 'furniconfig.wardrobe'
>   readonly version: number;             // ≥ 1; un solo version por type
>   readonly paramsSchema?: Readonly<Record<string, ComponentParamSpec>>;
>   build(params: Readonly<Record<string, unknown>>): ComponentBuild;
> }
> ```
>
> `build()` devuelve `ComponentBuild { parts: ComponentPart[] }` con
> **cajas y cilindros** paramétricos (no un `SceneGeometryRef`, que sigue
> reservado a la caché de kernel, aún no autorizada). Los ids de pieza se
> namespaced con el id del objeto (`objeto::pieza`), estables entre
> regeneraciones. `paramsSchema` es opcional: los componentes que delegan
> límites en otro contrato (p. ej. `WARDROBE_LIMITS`) no duplican rangos.
> La geometría derivada **nunca se almacena** en `SceneDocument`.

**Puente con el mueble existente**: un componente paramétrico puede
**delegar** a `geometry-core` (ver `furniconfig.wardrobe` en
`apps/web/src/lib/modeler/components/wardrobe.ts`, FASE-4B-D: envuelve
`WardrobeConfig` íntegro y emite sus piezas 1:1 como `ComponentPart`). Así
el clóset vive dentro del modelador sin modificar su motor (ver
`MIGRATION_STRATEGY.md`).

### 3.10 Renderer Adapter — `apps/web/src/lib/modeler/renderer-adapter.ts`

Responsabilidad: `SceneDocument` + `MeshData` → objetos R3F. Mantiene la
**regla 10** (la conversión mm→m ocurre en `units.ts`, aquí reutilizado).

```ts
interface RendererAdapter {
  toRenderable(doc: SceneDocument, cache: MeshCache): RenderableSceneObject[];
}
```

Reutiliza: caché de geometrías con `dispose()` y materiales por id tal como
hoy hacen `WardrobeScene.tsx` y `materials.ts`.

### 3.11 Persistence Adapter — `apps/web/src/lib/modeler/persistence.ts`

Responsabilidad: guardar/cargar el documento. Patrón `DesignRepository`
existente (`apps/web/src/lib/designs/repository.ts`): interfaz async con
implementación `localStorage` + cuarentena de datos corruptos.

## 4. Flujos de datos

### 4.1 Dibujar un rectángulo y extruir (MVP)

```
pointer (WardrobeViewer-like clickGuard)
   → Tool 'rectangle' onPointerMove  ── lee SnapEngine (puro) ── previsualiza
   → Tool onPointerUp                ── emite Command('set-sketch')
        → CommandHistory.apply        (documento inmutable, NUEVO estado)
        → kernel.fromSketch(...)      (adaptador, async, resultados cacheados)
        → Tool 'pushPull' emite Command('set-extrusion')
        → kernel regenera MeshData
        → RendererAdapter → R3F <mesh>
        → UI de cotas muestra dimensiones (patrón de dimensions.ts)
```

### 4.2 Guardar/restaurar (MVP pasos 7–8)

```
Documento → serialize (puro, mm enteros) → envelope con marcador+versión
         → PersistenceAdapter.put (async, valida antes de escribir)
         ← load: valida versión y forma; desconocida → error, sin migración silenciosa
```

### 4.3 Deshacer/rehacer (MVP paso 9)

```
CommandHistory: past/present/future sobre comandos
Ctrl/Cmd+Z → revert(present) → mismo patrón de atajos que use-editor-history.ts
```

## 5. Decisiones de diseño explícitas

| Decisión | Motivo |
|----------|--------|
| Documento inmutable + comandos con `apply`/`revert` | Pura, testeable, serializable |
| `MeshData` sin dependencia de three.js | `modeler-core` sigue siendo puro |
| Kernel tras interfaz pequeña | Reversible (Manifold ↔ three-bvh-csg ↔ otro) |
| Snapping en capa propia | No depende del kernel; reutiliza raycasting existente |
| Selección por objeto primero | Evita el coste de topología de caras en el MVP |
| Componentes paramétricos como delegadores a `geometry-core` | Reutiliza el motor del clóset sin tocarlo |
| Historial por comandos, límite 100 | El documento crecerá; copiar documentos completos no escala |
| Carga WASM diferida | No penaliza al configurador actual |

## 6. Qué NO se diseña todavía (evitar sobredimensionamiento)

- **Edición directa de caras/aristas/vértices — CAPACIDAD FUTURA**: decidido
  explícitamente en Fase 4A: queda **fuera del MVP**; el modelador selecciona
  y modifica **por objeto**. Requiere estructura topológica propia (ver
  `RISKS.md` R-05) y será objeto de revisión de alcance en una fase
  posterior, sin compromiso de fecha.
- Historial de características tipo CAD (feature history).
- Colaboración multiusuario y CRDT.
- Importación/exportación STEP/OBJ/glTF (solo se deja la puerta en
  `GeometryKernel`).
- Texturas UV y materiales por cara.
- Editor de reglas paramétricas visuales.

## 7. Relación con lo existente

| Existente | Papel en 4.0 |
|-----------|--------------|
| `geometry-core` | Intacto; consumido por el componente paramétrico del clóset |
| `WardrobeConfig` v1 | Intacto; contenido dentro de un `SceneObject` de tipo componente |
| Diseños locales (`furniconfig.designs`) | Siguen funcionando sin migración (ver `MIGRATION_STRATEGY.md`) |
| `units.ts`, `camera-views.ts`, `history.ts`, `designs/*` | Reutilizados o generalizados |
| Suite 522 unitarias + 200 visuales | Red de seguridad: debe seguir en verde |
