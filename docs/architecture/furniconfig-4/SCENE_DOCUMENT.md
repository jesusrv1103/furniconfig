# SCENE_DOCUMENT — Modelo del documento de escena (FASE-4A)

> Diseño propuesto, no implementado. Complementa
> `PROPOSED_ARCHITECTURE.md` §3.1 y §3.8.

## 1. Propósito

El **Scene Document** es la fuente única de verdad del modelador: un árbol
de datos inmutable, serializable y versionado, del cual la escena 3D se
**deriva** (igual que hoy `WardrobeConfig` → `GeometryResult` → mallas).

Diferencia clave con el estado actual: el documento actual
(`WardrobeConfig`) describe **un mueble**; el Scene Document describe
**cualquier escena** (muebles, componentes y sólidos libres).

## 2. Invariantes

| # | Invariant | Origen |
|---|-----------|--------|
| I1 | Unidad interna **mm enteros** en todo el documento | Regla 1, ADR-003 |
| I2 | Origen en la esquina **inferior-izquierda-frontal**; posiciones = esquina mínima | ADR-004 |
| I3 | El documento es **inmutable**: toda edición produce una nueva instancia | Patrón `config.ts` |
| I4 | IDs **deterministas** (sin UUID): `object-1`, `sketch-2`, `component-3` | Convención del repo |
| I5 | Nada de Three.js ni I/O en `modeler-core` | Regla 2, ADR-002 |
| I6 | Toda entrada externa se **valida antes** de entrar al documento | Regla 3 |
| I7 | Las operaciones geométricas delegan al kernel tras la interfaz `GeometryKernel` | ADR-001 (provisional) |
| I8 | La cuantización mm ocurre **en la frontera del kernel** (al entrar y al salir) | Regla 1 + ADR-003 |

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
| `params` | no | sí (`Record<string, number \| string \| boolean>`) |

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

## 4. Validación

`validateSceneDocument(input: unknown): SceneValidationResult`, análoga a
`validateWardrobeConfig`:

- Recopila **todos** los errores, no para en el primero.
- Devuelve `{ ok: true, document } | { ok: false, errors: SceneIssue[] }`.
- Lanza `SceneError` (clase con `code` propio, siguiendo el patrón de
  `GeometryError`, pero en un **union nuevo y separado** para no tocar el
  contrato del motor del clóset).

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
