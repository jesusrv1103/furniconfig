# SCENE_DOCUMENT — Modelo del documento de escena (FASE-4A)

> **Estado (FASE-4B-D)**: los contratos de §3, la validación de §4 (salvo lo
> indicado), la selección por objeto, el **Command System con Undo/Redo**
> (§3.4, `command.ts` + `commands.ts`, incluida la conversión a componente
> `convert-to-component`), la **serialización en `SceneEnvelope`**
> (§3.5, `serialize.ts`) y el **registro de componentes completos con
> `build()`** (`components.ts`: `defineComponent`/`buildComponent`) están
> **implementados** en `packages/modeler-core` (paquete puro, sin
> Three.js/DOM). El kernel en Web Worker se implementó en 4B-C y su consumo
> sin UI (servicio de regeneración) en 4B-D (D4a); la integración en UI del
> modelador se **inició en la FASE-4C-B** (modelado libre: croquis →
> extrusión → selección → edición → eliminación; ver `MODELER_4C.md`):
> en ese flujo **I7 está activa** (toda derivación pasa por
> `GeometryKernel` en Worker vía `SceneGeometryService`), mientras que
> **I8** sigue **pendiente en la salida del kernel** (§8.1). El flujo de
> componentes en la UI del modelador sigue **pendiente** (Fase 4D).
> Complementa
> `PROPOSED_ARCHITECTURE.md` §3.1–§3.9.

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
| I7 | Las operaciones geométricas delegan al kernel tras la interfaz `GeometryKernel` | ADR-001 (provisional) | ✅ activa en el flujo de modelado libre (4C-B): `SceneGeometryCoordinator` → `SceneGeometryService` → `GeometryKernel` (Worker); pendiente en componentes hasta 4D |
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
  **Implementado (4B-B) con delta**: `SceneEnvelope` v1 **no** incluye
  `geometryCache` (diferida a 4B-C); el parser de 4B-B ignora claves
  desconocidas del sobre (tolerancia hacia adelante), de modo que un sobre
  futuro con caché se leerá sin romper el formato.

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

### 3.4 Command System + Undo/Redo (implementado, FASE-4B-B)

Contratos en `PROPOSED_ARCHITECTURE.md` §3.7; código en
`packages/modeler-core/src/command.ts` (tipos + historial) y
`src/commands.ts` (las 8 fábricas; la octava, `createConvertToComponentCommand`,
llegó en FASE-4B-D y se describe abajo). Diseño:

- **Comandos, no documentos completos**: cada fábrica captura solo el delta
  para revertir (valor previo; en `remove-object`, el objeto íntegro y su
  índice). `apply`/`revert` son **puros y deterministas** y no mutan la
  entrada (I3).
- `CommandHistory` = `{ past, present, future, limit }` inmutable;
  `present` es **siempre** un documento validado y congelado (toda
  operación que lo produce pasa por `validateSceneDocument`).
- Tres situaciones diferenciadas:
  **(A)** cambio válido → entrada nueva en `past`, `future` descartado,
  `past` recortado al límite (PROVISIONAL, 100);
  **(B)** no-op (el valor ya estaba; detección por referencia e igualdad
  estructural, **sin** `JSON.stringify`) → misma referencia de historial,
  sin entrada nueva;
  **(C)** operación inválida o conflicto → `SceneError` con código estable
  y el historial intacto.
- Mapeo de códigos de (C): objetivo ausente → `ERR_SCENE_OBJECT_NOT_FOUND`;
  `add-object` sobre id ya presente → `ERR_SCENE_DUPLICATE_ID`; estado
  actual ≠ estado capturado al crear el comando →
  `ERR_SCENE_COMMAND_CONFLICT`; resultado que no valida → el código del
  validador.
- IDs de comando **deterministas y únicos por contenido** (sin UUID, I4):
  `cmd:tipo:idObjetivo:hash64`, donde el hash (FNV-1a de 64 bits sobre la
  forma canónica del delta, con claves ordenadas) distingue operaciones
  distintas sobre el mismo objetivo. El historial se direcciona por
  posición, no por id. Las fábricas congelan los insumos nuevos (objeto,
  croquis, posición, parámetros) al capturarlos: los deltas son
  inmutables (I3).
- Historiales **independientes** del configurador de clóset (RISKS R-06):
  este sistema no toca `WardrobeConfig` ni `apps/web`.
- **FASE-4B-D — `convert-to-component`**: convierte un `SolidObject` en un
  `ComponentInstance` **conservando id, nombre, transformación y material**,
  solo cuando la equivalencia geométrica es **demostrable**: el croquis
  debe ser un rectángulo axial exacto en el plano `ground` (prisma
  canónico, mm exactos) y `build(params)` del componente registrado debe
  producir **una única caja** con el mismo prisma canónico. Cualquier caso
  no demostrable (otro plano, otra forma, multi-pieza, geometría de fuente
  kernel, tamaños distintos) se rechaza con
  `ERR_SCENE_CONVERSION_INCOMPATIBLE`: **no** se inventan parámetros ni se
  aproxima geometría. `revert` restaura exactamente el `SolidObject`
  capturado (por referencia, ya congelado).

### 3.5 SceneEnvelope — serialización (implementada, FASE-4B-B)

Contratos en `PROPOSED_ARCHITECTURE.md` §3.8; código en
`packages/modeler-core/src/serialize.ts`:

- `SCENE_FORMAT = 'furniconfig-scene'`, `SCENE_FORMAT_VERSION = 1`.
- `serializeScene(document, options?)` valida antes de escribir (un
  documento inválido no sale del paquete) y empaqueta el documento
  **reconstruido** (sin claves desconocidas).
- `parseSceneEnvelope(text, options?)` devuelve un **resultado
  discriminado** (patrón ADR-005, no lanza sobre entrada hostil):
  `ERR_SCENE_ENVELOPE_INVALID` (JSON malformado, sobre no estructural,
  marcador incorrecto, documento ausente/no-objeto),
  `ERR_SCENE_ENVELOPE_VERSION` (versión desconocida, **sin migración
  silenciosa**) y, para el documento, los códigos de
  `validateSceneDocument` reutilizados tal cual.
- El sobre transporta **solo** el documento: sin historial, UI ni
  `geometryCache` (§3.2). Claves extra ignoradas (tolerancia hacia
  adelante) y sin contaminación de prototipos (reconstrucción con
  `Object.defineProperty`).
- Round-trip sin pérdida: `parse(serialize(doc))` = documento
  estructuralmente idéntico y congelado.

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
  completo con `build()` llegó en 4B-D (`components.ts`: un
  `ParametricComponentRegistry` es asignable estructuralmente a
  `ComponentRegistry`, por lo que este contrato no cambió).
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
| `ERR_SCENE_OBJECT_NOT_FOUND` (4B-B) | El comando apunta a un objeto inexistente |
| `ERR_SCENE_COMMAND_CONFLICT` (4B-B) | Precondición de comando incumplida (§3.4); el historial no se altera |
| `ERR_SCENE_ENVELOPE_INVALID` (4B-B) | Sobre malformado: JSON, marcador o documento ausente/no-objeto (§3.5) |
| `ERR_SCENE_ENVELOPE_VERSION` (4B-B) | Versión de sobre desconocida; sin migración silenciosa (§3.5) |
| `ERR_SCENE_CONVERSION_INCOMPATIBLE` (4B-D) | La conversión sólido → componente no es demostrablemente equivalente (§3.4); nunca se aproxima |

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
>
> **Implementado (4B-B)**: el sobre de escena `SceneEnvelope`
> (`format` + `version` + `document`) con `serializeScene` /
> `parseSceneEnvelope` (§3.5). Regla confirmada: versión desconocida del
> sobre → `ERR_SCENE_ENVELOPE_VERSION` **antes** de tocar el documento; sin
> migraciones silenciosas. La persistencia (repositorio localStorage,
> paso 8 completo) sigue pendiente.

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

> **Implementado (4B-D)**: la definición `furniconfig.wardrobe` v1 vive en
> la capa de composición `apps/web/src/lib/modeler/components/wardrobe.ts`
> (`modeler-core` sigue sin dependencias runtime). `build()` encadena
> `validateWardrobeConfig` → `calculateGeometry` → `ComponentPart` 1:1:
> `Panel`/`Door` → `box`; `HangingRod`/`DoorHandle` → `cylinder` (eje,
> longitud y diámetro exactos, sin simplificar a caja); `DrawerAssembly` no
> añade piezas porque sus `partIds` son paneles ya emitidos. Cada pieza
> conserva además sus **asociaciones funcionales** (auditoría 4B-D §2):
> `moduleId` en todas; `hingeSide`/`leafIndex`/`leafCount` en puertas
> (recalculan `doorOpeningTransform(door, ángulo)` para animar sin volver
> al motor); `doorId` en tiradores; `assemblyId`/`assemblyIndex` en paneles
> de cajón. Estos datos existen solo en la salida del motor (no en
> `params`), por lo que se estampan en `ComponentPart`. **Sin
> `paramsSchema` declarado**: los límites siguen viviendo únicamente en
> `WARDROBE_LIMITS` (`geometry-core`); el motor valida al construir.
>
> Decisión de medición: `ComponentPart` admite números finitos en mm, no
> solo enteros, porque el motor emite legítimamente medio milímetro al
> centrar barras (p. ej. `z: 277.5` en un fondo de 600 mm). **Preservar el
> valor exacto** del motor prima sobre redondear (una aproximación rompería
> la equivalencia geométrica); I1 sigue rigiendo el documento persistente,
> y las piezas derivadas nunca se almacenan en él.

### 6.1 Política de precisión (expresa, auditoría 4B-D §5)

1. **`SceneDocument` — mm enteros.** El documento persistente mantiene la
   política vigente I1: todas sus entradas geométricas (`pointsMm`,
   `extrusionMm`, `transform.positionMm`, etc.) son milímetros enteros,
   validados por `validateSceneDocument`.
2. **`ComponentPart` — mm finitos.** La geometría derivada en memoria sí
   admite coordenadas y tamaños finitos fraccionarios generados por
   `geometry-core` (p. ej. `positionMm.z = 277.5` al centrar una barra en
   un fondo de 600 mm); `ComponentPart` los **preserva exactos**.
3. **Sin redondeo silencioso.** La geometría calculada jamás se redondea ni
   aproxima al convertirla a piezas: cualquier redondeo rompería la
   equivalencia geométrica exigida a la conversión (§5) y la fidelidad de
   la escena renderizada. Si una política de cuantización llega a exigirse
   para piezas derivadas, será una decisión explícita y versionada (ver
   también I8, cuantización en la frontera del kernel).
4. **Los derivados no se persisten todavía.** Ni `ComponentBuild`/`ComponentPart`
   ni las mallas del kernel se escriben en `SceneDocument`, `SceneEnvelope`
   ni almacenamiento alguno: se recalculan determinísticamente en cada
   apertura (I2/I3, `SceneGeometryService`). **R-19** (§RISKS.md) mantiene
   documentado el riesgo de que una futura persistencia de derivados deba
   resolver la fracción de milímetro junto con la política de cuantización.

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
