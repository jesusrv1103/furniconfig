# SCENE_DOCUMENT — Modelo del documento de escena (FASE-4A)

> **Estado (FASE-4B-A)**: los contratos de §3, la validación de §4 (salvo lo
> indicado) y la selección por objeto están **implementados** en
> `packages/modeler-core` (paquete puro, sin Three.js/DOM). **No** está
> completada la arquitectura total de 4B: faltan herramientas de dibujo
> (4B-B), el kernel en Web Worker (4B-C) y el registro completo de
> componentes con `build()` (4B-D). Las invariantes **I7 e I8** requieren
> la integración del kernel y siguen **pendientes**. Complementa
> `PROPOSED_ARCHITECTURE.md` §3.1 y §3.8.

## 1. Propósito

El **Scene Document** es la fuente única de verdad del modelador: un árbol
de datos inmutable, serializable y versionado, del cual la escena 3D se
**deriva** (igual que hoy `WardrobeConfig` → `GeometryResult` → mallas).

Diferencia clave con el estado actual: el documento actual
(`WardrobeConfig`) describe **un mueble**; el Scene Document describe
**cualquier escena** (muebles, componentes y sólidos libres).

## 2. Invariantes

| # | Invariant | Origen | Estado |
|---|-----------|--------|--------|
| I1 | Unidad interna **mm enteros** en todo el documento | Regla 1, ADR-003 | ✅ activa: validada en `validateSceneDocument` |
| I2 | Origen en la esquina **inferior-izquierda-frontal**; posiciones = esquina mínima | ADR-004 | ✅ activa: documentada en el contrato; el render la respeta vía `units.ts` |
| I3 | El documento es **inmutable**: toda edición produce una nueva instancia | Patrón `config.ts` | ✅ activa: salida del validador congelada en profundidad |
| I4 | IDs **deterministas** (sin UUID): `object-1`, `sketch-2`, `component-3` | Convención del repo | ✅ activa: `createEmptySceneDocument`/`nextSceneId` (comparación `BigInt`) |
| I5 | Nada de Three.js ni I/O en `modeler-core` | Regla 2, ADR-002 | ✅ activa: `@furniconfig/modeler-core` sin dependencias runtime |
| I6 | Toda entrada externa se **valida antes** de entrar al documento | Regla 3 | ✅ activa: `validateSceneDocument(input: unknown)` |
| I7 | Las operaciones geométricas delegan al kernel tras la interfaz `GeometryKernel` | ADR-001 (provisional) | ⏳ **pendiente de integración**: llega con 4B-C (kernel en Worker); `modeler-core` aún no ejecuta operaciones geométricas |
| I8 | La cuantización mm ocurre **en la frontera del kernel** (al entrar y al salir) | Regla 1 + ADR-003 | ⏳ **pendiente de integración**: ver §8.1; el validador ya exige mm enteros en el lado del documento |

## 3. Estructura

```ts
interface SceneDocument {
  documentVersion: 1;
  id: string;                    // determinista
  name: string;
  gridStepMm: number;            // paso de rejilla (p. ej. 10)
  originMm: Point3;              // por defecto [0, 0, 0]
  objects: readonly SceneObject[];
  materials: readonly SceneMaterial[];
}
```

### 3.1 Objetos

```ts
type SceneObject =
  | SolidObject        // modelado libre (croquis + extrusión)
  | ComponentInstance; // componente paramétrico (incluye el clóset)
```

| Campo | SolidObject | ComponentInstance |
|-------|-------------|-------------------|
| `id` | `object-N` | `component-N` |
| `geometry` | `SceneGeometryRef` (sketch + extrusión o referencia de caché) | `type` + `params` + `version` |
| `transform` | sí (mm enteros) | sí |
| `materialId` | sí | sí (o materiales por rol internos) |
| `params` | no | sí (JSON serializable: escalares **y anidado**, ver nota) |

> **Implementado** (`packages/modeler-core/src/types/document.ts`): `params`
> acepta `SceneParamValue` = número finito | cadena | booleano | listas y
> objetos anidados. Delta justificado sobre este contrato: §6–§7 almacena un
> `WardrobeConfig` **completo** en `params` del clóset, que es una estructura
> anidada. Lo no declarado en el `paramsSchema` del registro se admite si es
> JSON serializable; el rango de `WardrobeConfig` lo valida `geometry-core`
> al construir el componente.

### 3.2 Referencia de geometría (cacheada)

La geometría derivada del kernel **no se guarda siempre dentro del
documento** (crecería demasiado). Se guarda una referencia:

```ts
type SceneGeometryRef =
  | { source: 'sketch'; sketch: Sketch2D; extrusionMm: number }  // regenerable
  | { source: 'kernel'; key: string };                            // hash/clave de caché
```

- **Fuente de verdad = parámetros** (croquis + extrusión): la malla es
  derivada y **regenerable**.
- La caché (`MeshData`) es **descartable**: si se pierde, se recalcula.
- El envelope de guardado puede incluir `geometryCache` opcional para
  acelerar la apertura (patrón: `transfer.ts` con marcador + versión).

### 3.3 Croquis

```ts
interface Sketch2D {
  plane: 'ground' | 'front' | 'side' | 'custom';
  planeOriginMm: Point3;
  pointsMm: readonly Point2[];   // mm enteros, ordenados
  closed: boolean;
}
```

- El croquis se dibuja sobre un **plano de trabajo**; el MVP usa los tres
  planos canónicos (mismo repertorio que las vistas
  `isometric|front|side` de `camera-views.ts`).
- Restricción MVP: **polígonos cerrados simples** (el rectángulo primero).
  Sin auto-intersección (validación I6).
- `extrusionMm` es un entero ≥ 1; la dirección es la normal del plano.

**Validación estructural ≠ validación geométrica (declaración explícita):**

- `validateSceneDocument` (`modeler-core`) hace solo validación
  **estructural** del croquis: ≥3 vértices, `closed: true`, vértices en mm
  enteros, primer vértice no repetido al final y área shoelace ≠ 0 (cubriendo
  así el caso *bowtie*). **No** es una validación geométrica completa: no
  comprueba auto-intersecciones no triviales entre aristas no adyacentes.
- Las auto-intersecciones **no** se duplican en `modeler-core`: la autoridad
  es `assertSimplePolygon` de `packages/kernel-adapter/src/polygon.ts` (coste
  O(n²), una sola copia — RISKS R-18).
- **Dónde se comprueban, antes de construir geometría**: en la frontera del
  kernel, en `ManifoldKernel.fromSketch()`
  (`packages/kernel-adapter/src/manifold-kernel.ts`), que invoca
  `assertSimplePolygon(polygon)` **antes** de `Manifold.extrude(...)`,
  siguiendo la regla 3 (validar antes de calcular). Cualquier camino que
  convierta un `Sketch2D` de un `SceneDocument` en geometría debe pasar por
  ese kernel, de modo que el chequeo queda garantizado en el único punto de
  construcción.

## 4. Validación

`validateSceneDocument(input: unknown): SceneValidationResult`, análoga a
`validateWardrobeConfig`:

- Recopila **todos** los errores, no para en el primero.
- Devuelve `{ ok: true, document } | { ok: false; errors: SceneIssue[] }`.
- **Implementado**: no lanza sobre entrada hostil; devuelve siempre el
  resultado discriminado. La clase `SceneError` (clase con `code` propio,
  siguiendo el patrón de `GeometryError`, pero en un **union nuevo y
  separado** para no tocar el contrato del motor del clóset) se lanza en los
  constructores de programación (`createEmptySceneDocument` con argumentos
  inválidos).
- **Implementado**: acepta `options.components`, un `ComponentRegistry`
  **opcional** con la identidad mínima (`version` + `paramsSchema`). Con
  registro se valida tipo/versión/rango (`ERR_SCENE_UNKNOWN_COMPONENT`,
  `ERR_SCENE_PARAMS_OUT_OF_RANGE`); sin él, solo estructura. El registro
  completo con `build()` llega en 4B-D.
- **Implementado**: la salida se reconstruye campo a campo (claves
  desconocidas descartadas), las claves de `params` se copian con
  `Object.defineProperty` (sin contaminación de prototipos) y el documento
  se congela en profundidad (I3).

Códigos propuestos (union propio, mínimo para el MVP):

| Código | Significado |
|--------|-------------|
| `ERR_SCENE_INVALID_VERSION` | `documentVersion` desconocido |
| `ERR_SCENE_INVALID_OBJECT` | Objeto con forma inválida |
| `ERR_SCENE_DUPLICATE_ID` | IDs repetidos |
| `ERR_SCENE_DEGENERATE_SKETCH` | Croquis vacío, no cerrado o de área 0 |
| `ERR_SCENE_INVALID_EXTRUSION` | Extrusión fuera de rango |
| `ERR_SCENE_UNKNOWN_MATERIAL` | `materialId` inexistente |
| `ERR_SCENE_UNKNOWN_COMPONENT` | `type` de componente no registrado |
| `ERR_SCENE_PARAMS_OUT_OF_RANGE` | Parámetro fuera del `paramsSchema` |
| `ERR_SCENE_TRANSFORM_INVALID` | Transformación no entera / no finita |

> Los valores de rango (máximos, holguras) **no se inventan**: los que
> dependan de carpintería se marcan PROVISIONAL en `docs/product-rules.md`
> (regla 4).
>
> **Implementado**: las cotas de sanidad del documento viven en
> `packages/modeler-core/src/limits.ts` (`SCENE_LIMITS`), **todas**
> marcadas PROVISIONAL: `gridStepMm` [1, 1000], `extrusionMm`
> [1, 1 000 000], `coordinateMm` ±100 000 (exactitud del área del croquis
> en `double`) y `paramsMaxDepth` 32 (contra JSON hostil). Son cotas de
> sanidad con justificación anotada, **no** reglas de fabricación; el
> catálogo de espesores de tablero [15, 18] sigue siendo responsabilidad de
> `geometry-core`, no de este documento.

## 5. Versionado y migración

| Nivel | Constante | Valor inicial |
|-------|-----------|---------------|
| Formato de archivo | `SCENE_FORMAT = 'furniconfig-scene'` | — |
| Versión de formato | `SCENE_FORMAT_VERSION` | `1` |
| Versión de documento | `documentVersion` | `1` |
| Componente paramétrico | `ParametricComponentDef.version` | `1` |

Regla (heredada de `designs/local-storage.ts`): **versión desconocida →
error antes de escribir; sin migraciones silenciosas**. La migración es un
paso explícito y versionado (ver `MIGRATION_STRATEGY.md`).

> **Implementado (4B-A)**: solo `documentVersion` (controlado por
> `SCENE_DOCUMENT_VERSION` en `modeler-core`). El sobre `format` +
> `formatVersion` de §7 corresponde al almacén/exportación, **fuera del
> alcance de 4B-A** (llega con la persistencia de fases posteriores).

## 6. Relación con `WardrobeConfig`

```
Diseño actual:    WardrobeConfig ──validateWardrobeConfig──▶ calculateGeometry ─▶ Panel[] ─▶ mallas
Nuevo documento:  SceneDocument ──validateSceneDocument───▶ SceneObject[] ─┬─ componente paramétrico
                                                                          │   └─ delega en geometry-core
                                                                          └─ sólido libre
                                                                              └─ GeometryKernel (WASM)
```

- `WardrobeConfig` **no cambia**: se guarda como `params` de un
  `ComponentInstance` de tipo `furniconfig.wardrobe`.
- Sus `Panel[]` se convierten en objetos de escena por el mismo molde de
  `panels-to-mesh.ts` (sin geometría inventada, regla 10).
- Un documento puede contener **0..n** clósets además de sólidos libres.

## 7. Ejemplo ilustrativo (no es una prueba)

```jsonc
{
  "format": "furniconfig-scene",
  "version": 1,
  "document": {
    "documentVersion": 1,
    "id": "scene-1",
    "name": "Dormitorio",
    "gridStepMm": 10,
    "originMm": [0, 0, 0],
    "objects": [
      {
        "id": "object-1",
        "kind": "solid",
        "name": "Tablero base",
        "transform": { "positionMm": [0, 0, 0] },
        "geometry": {
          "source": "sketch",
          "sketch": { "plane": "ground", "planeOriginMm": [0,0,0],
                      "pointsMm": [[0,0],[1200,0],[1200,600],[0,600]], "closed": true },
          "extrusionMm": 18
        },
        "materialId": "material-structure"
      },
      {
        "id": "component-1",
        "kind": "component",
        "name": "Clóset 2400",
        "type": "furniconfig.wardrobe",
        "version": 1,
        "transform": { "positionMm": [1500, 0, 0] },
        "materialId": "material-structure",
        "params": { /* WardrobeConfig v1 completo, sin cambios */ }
      }
    ],
    "materials": [ /* MaterialSpec con ids deterministas */ ]
  }
}
```

## 8. Preguntas abiertas

1. **Cuantización de la salida del kernel** (I8): ¿redondeo half-away-from-zero
   a mm (como `quantizeDelta` de `separators.ts`) o al paso del croquis?
   → Definir en la implementación del adaptador; afecta a `RISKS.md` R-04.
2. **Convivencia de unidades en render**: el documento vive en mm y la escena
   en metros; se mantiene `units.ts` como única puerta (ADR-004).
3. **Límite de objetos del documento**: sin límite en diseño; el MVP no
   impone cuota (la persistencia ya degrada con `storage-full`).
