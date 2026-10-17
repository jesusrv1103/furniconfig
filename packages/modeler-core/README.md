# @furniconfig/modeler-core

Núcleo puro del modelador libre de FurniConfig (**FASE-4B-A/4B-B/4B-D**):
documentos de escena versionados, validación estricta, selección de
objetos, sistema de comandos con undo/redo (incluida la conversión a
componente paramétrico), serialización en `SceneEnvelope` y registro de
componentes con `build()` (geometría derivada determinista).

Fuente de contratos: `docs/architecture/furniconfig-4/SCENE_DOCUMENT.md`
(complementa `PROPOSED_ARCHITECTURE.md` §3.1–§3.9).

## Alcance de esta fase

- `SceneDocument` v1 (`types/document.ts`): escena con objetos sólidos
  (`SolidObject` = croquis + extrusión) y componentes paramétricos
  (`ComponentInstance` = tipo + versión + parámetros).
- `createEmptySceneDocument()` e `nextSceneId()` (`document.ts`): construcción
  pura con IDs deterministas (`scene-N`, sin UUID).
- `validateSceneDocument(input, options?)` (`validate.ts`): valida `unknown`
  en la frontera de importación/serialización, recopila todos los errores y
  devuelve un documento reconstruido y **congelado**.
- `resolveObjectSelection(document, pick)` (`selection.ts`): selección
  **por objeto completo** (clic en vacío, id inexistente o documento vacío →
  `null`, criterio del `POC_PLAN.md` paso 5).
- **FASE-4B-B** — Command System + Undo/Redo (`command.ts`, `commands.ts`):
  `Command`/`CommandHistory` inmutables, `createCommandHistory`,
  `executeCommand`, `undoCommand`, `redoCommand`, `canUndo`, `canRedo` y las
  8 fábricas de comandos (`add-object`, `remove-object`, `set-sketch`,
  `set-extrusion`, `set-transform`, `set-params`, `rename` y
  `convert-to-component`, añadida en 4B-D).
- **FASE-4B-B** — Serialización (`serialize.ts`): `SceneEnvelope` versionado
  (`SCENE_FORMAT`/`SCENE_FORMAT_VERSION`), `serializeScene` (valida antes de
  escribir) y `parseSceneEnvelope` (parser hostil con resultado
  discriminado, sin migraciones silenciosas).
- **FASE-4B-D** — Componentes paramétricos (`components.ts`,
  `types/component.ts`): `ParametricComponentDef` (extiende
  `ComponentDefRef` con `build()`), `ComponentBuild`/`ComponentPart` (caja y
  cilindro, sin simplificar), `defineComponent`, `createComponentRegistry`
  (un solo `version` por `type`) y `buildComponent` (valida registro,
  versión, params y la forma de las piezas; ids de pieza namespaced
  `objeto::pieza`, estables). La geometría derivada **nunca se almacena** en
  el documento.
- **FASE-4B-D** — `createConvertToComponentCommand` (`commands.ts`): convierte
  un sólido de croquis en componente **solo** con equivalencia demostrable
  (rectángulo axial en `ground` + construcción de una única caja con el
  mismo prisma canónico); conserva id/nombre/transformación/material y
  restaura exactamente el sólido en undo. Ver "Conversión a componente".

**No incluido** (fases posteriores): integración del kernel en la UI del
modelador — la infraestructura quedó lista en `packages/kernel-adapter`
(FASE-4B-C: protocolo, proxy `WorkerGeometryKernel`, watchdog, transfer) y
4B-D implementó el servicio de regeneración sin UI en la capa de
composición de `apps/web` (`SceneGeometryService`), pero el cableado en
pantalla (D4b), la `geometryCache` del sobre, la edición por
caras/aristas/vértices (capacidad futura, RISKS R-05), la persistencia de
documentos (repositorio localStorage) y la GUI siguen **fuera** de este
paquete.

## Invariantes

1. **I1**: unidad interna mm **enteros** en todo el documento.
2. **I2**: origen en la esquina inferior-izquierda-frontal; posiciones = esquina mínima.
3. **I3**: el documento es **inmutable**: la salida del validador se congela en profundidad.
4. **I4**: IDs **deterministas** (sin UUID).
5. **I5**: sin Three.js/DOM/I/O ni dependencias runtime en este paquete.
6. **I6**: toda entrada externa se valida antes de entrar al documento.

## Códigos de error

Catorce códigos estables (`SceneErrorCode`), separados de `GeometryErrorCode`
de `geometry-core` (que este paquete no conoce ni modifica):

| Código | Significado |
|--------|-------------|
| `ERR_SCENE_INVALID_VERSION` | `documentVersion` distinto de 1 |
| `ERR_SCENE_INVALID_OBJECT` | Forma inválida (documento, objeto, material, croquis) |
| `ERR_SCENE_DUPLICATE_ID` | IDs repetidos en objetos o materiales (y `add-object` sobre un id existente) |
| `ERR_SCENE_DEGENERATE_SKETCH` | Croquis vacío, no cerrado o de área 0 |
| `ERR_SCENE_INVALID_EXTRUSION` | Extrusión fuera de rango |
| `ERR_SCENE_UNKNOWN_MATERIAL` | `materialId` sin resolver |
| `ERR_SCENE_UNKNOWN_COMPONENT` | Tipo/versión de componente no registrado |
| `ERR_SCENE_PARAMS_OUT_OF_RANGE` | Parámetro fuera del esquema o no serializable |
| `ERR_SCENE_TRANSFORM_INVALID` | Transformación/posición no entera o no finita |
| `ERR_SCENE_OBJECT_NOT_FOUND` (4B-B) | El comando apunta a un objeto inexistente |
| `ERR_SCENE_COMMAND_CONFLICT` (4B-B) | Precondición del comando incumplida (estado drift); el historial no se altera |
| `ERR_SCENE_ENVELOPE_INVALID` (4B-B) | Sobre de escena malformado (JSON, marcador o documento ausente) |
| `ERR_SCENE_ENVELOPE_VERSION` (4B-B) | Versión de sobre desconocida (sin migración) |
| `ERR_SCENE_CONVERSION_INCOMPATIBLE` (4B-D) | Conversión sólido → componente no demostrablemente equivalente (nunca se aproxima) |

## Registro de componentes

`validateSceneDocument` acepta opcionalmente `options.components`
(`ComponentRegistry`), el contrato **mínimo** que la validación necesita
(versión + esquema de parámetros escalares). Sin registro, los componentes se
validan solo estructuralmente. Desde la Fase 4B-D existe además el contrato
**completo** (`ParametricComponentDef`, que añade `build()`); un registro de
definiciones completas es asignable estructuralmente a `ComponentRegistry`,
por lo que la validación no cambió.

Los parámetros **no declarados** en el esquema se admiten como JSON
serializable: necesario para parámetros anidados como un `WardrobeConfig`
completo en `params` del componente clóset (§6–§7 del contrato), cuyo rango
valida `geometry-core` al construir el componente.

## Componentes paramétricos (FASE-4B-D)

- `defineComponent(def)`: valida la forma (type, version ≥ 1, `build`
  función, `paramsSchema` con kind/min/max coherentes) y devuelve la
  definición congelada.
- `createComponentRegistry(defs)`: registro congelado; rechaza tipos
  duplicados (un solo `version` por `type`).
- `buildComponent(registry, objectId, type, version, params)`:
  registro → versión → params contra `paramsSchema` → `build()` → validación
  de la forma de las piezas → ids namespaced (`componentPartId`) → salida
  congelada. Determinismo y estabilidad de ids garantizados y probados.
- `ComponentPart` es caja o cilindro (eje, longitud y diámetro exactos:
  nunca se simplifica un cilindro a caja). Admite **campos opcionales de
  asociación** validados: `moduleId` (módulo dueño), `doorId` (tirador →
  hoja), `hingeSide`/`leafIndex`/`leafCount` (puerta → animación de
  apertura) y `assemblyId`/`assemblyIndex` (cajón ↔ paneles), para que la
  interacción futura no dependa de volver al motor. Las medidas son números
  finitos en mm: el motor de clóset emite medio milímetro al centrar barras
  (p. ej. `z: 277.5`) y **preservar el valor exacto** prima sobre redondear;
  I1 sigue rigiendo el documento persistente, y las piezas derivadas no se
  almacenan en él (§6.1 de SCENE_DOCUMENT.md).

## Conversión a componente (FASE-4B-D)

`createConvertToComponentCommand(doc, objectId, type, version, params,
registry)` sustituye un `SolidObject` por un `ComponentInstance`
conservando **id, nombre, transformación y material**, solo si la
equivalencia es demostrable: croquis = rectángulo axial exacto en el plano
`ground` (prisma canónico en mm) y `build(params)` = **una única caja** con
el mismo prisma. Todo lo demás (otros planos, otras formas, multi-pieza,
geometría de fuente kernel, tamaños distintos) →
`ERR_SCENE_CONVERSION_INCOMPATIBLE`: no se inventan parámetros ni se
aproxima. `undo` restaura exactamente el sólido capturado; `redo` reproduce
la conversión.

## Frontera hostil

- Salida **reconstruida campo a campo**: claves desconocidas descartadas.
- Claves de `params` copiadas con `Object.defineProperty`: una clave hostil
  `__proto__` procedente de `JSON.parse` no contamina el prototipo.
- Todo número validado es entero (campos mm) o finito (parámetros): sin
  `NaN`/`Infinity`.
- Cota de profundidad de `params` (`SCENE_LIMITS.paramsMaxDepth`): estructuras
  circulares o hiperprofundas terminan en error, no en desbordamiento.

## Decisiones y límites PROVISIONAL

- `SCENE_LIMITS` (`src/limits.ts`) marca como **PROVISIONAL** todas sus
  cotas (regla 4 de `AGENTS.md`): no son reglas de fabricación confirmadas.
- La auto-intersección no trivial del croquis **no** se valida aquí: la
  autoridad es la frontera del kernel (`kernel-adapter`), que ejecuta el
  chequeo O(n²) una sola vez (RISKS R-18). Este validador cubre la
  degeneración barata (≥3 vértices, cerrado, área ≠ 0, sin repetir el
  primero), que ya captura el caso *bowtie*.
- `SceneMaterial.thicknessMm` es un entero ≥ 1 sin catálogo: los materiales
  de escena son genéricos y este paquete no depende de `geometry-core`. El
  catálogo de espesores de tablero [15, 18] sigue siendo responsabilidad del
  motor del clóset.

## Command System + Undo/Redo (FASE-4B-B)

Cada operación reversible es un `Command` (`command.ts` + `commands.ts`):
`id` determinista **por contenido** (`cmd:tipo:idObjetivo:hash64`, FNV-1a
sobre la representación canónica del delta: mismo insumo → mismo id;
operaciones distintas → ids distintos), `kind`, `label` legible en español
y `apply`/`revert` **puros y deterministas** que no mutan el documento de
entrada. El historial guarda **comandos, no documentos completos**: cada
fábrica captura solo el delta (el valor sustituido y, en `remove-object`,
el objeto retirado con su índice) y congela los insumos nuevos que el
comando introduce (I3), de modo que los deltas son inmutables.

```ts
const history0 = createCommandHistory(document, 100); // límite PROVISIONAL
const history1 = executeCommand(history0, createRenameCommand(document, 'object-1', 'Mesa'));
const history2 = undoCommand(history1);   // revert exacto
const history3 = redoCommand(history2);   // re-aplica el mismo comando
```

Tres situaciones diferenciadas (explícitas, nunca un no-op silencioso):

- **(A) cambio válido**: nueva entrada en `past`, `future` descartado,
  `past` recortado al límite, `present` validado y congelado.
- **(B) no-op**: el valor pedido ya estaba (comparado por referencia y luego
  por igualdad estructural, **sin** `JSON.stringify`); se devuelve la misma
  referencia de historial, sin entrada nueva y sin tocar `future`.
- **(C) operación inválida o conflicto**: `SceneError` con código estable y
  el historial **intacto**. Mapeo: objetivo ausente →
  `ERR_SCENE_OBJECT_NOT_FOUND`; `add-object` sobre id existente →
  `ERR_SCENE_DUPLICATE_ID`; estado actual ≠ estado capturado en la creación →
  `ERR_SCENE_COMMAND_CONFLICT`; documento resultante inválido → el código del
  validador (`ERR_SCENE_UNKNOWN_MATERIAL`, `ERR_SCENE_PARAMS_OUT_OF_RANGE`…).

Notas de contrato:

- `undoCommand`/`redoCommand` sobre pila vacía devuelven la misma
  referencia (la UI consulta `canUndo`/`canRedo`; navegar vacío no es error).
- `executeCommand`/`undo`/`redo` aceptan `options` (`SceneValidationOptions`)
  para validar el documento resultante contra el registro de componentes.
- `set-params` **reemplaza** el mapa completo de parámetros; para editar una
  sola clave el llamante combina: `{ ...obj.params, ancho: 600 }`.
- Los ids de comando son etiquetas deterministas: el direccionamiento del
  historial es **posicional** (`past`/`future` son arrays), por lo que
  incluso ids repetidos (entradas manipuladas a mano) no pueden confundir
  operaciones.
- Los historiales del modelador y del configurador (clóset) son
  **independientes** (RISKS R-06): este paquete no toca `WardrobeConfig` ni
  el historial de `apps/web`.
- El límite por defecto (`DEFAULT_COMMAND_HISTORY_LIMIT = 100`) es
  **PROVISIONAL** (hipótesis de trabajo, patrón de `studio/history.ts`).

## Serialización (FASE-4B-B, paso 8 del MVP)

Formato propio versionado, molde de `designs/transfer.ts`:

```ts
const text = serializeScene(document);        // valida antes de escribir
const result = parseSceneEnvelope(text);      // resultado discriminado, nunca lanza
```

- `SCENE_FORMAT = 'furniconfig-scene'`, `SCENE_FORMAT_VERSION = 1`.
- El sobre transporta **solo** el documento validado (sin historial, UI ni
  `geometryCache` — esta última, diferida a 4B-C, se ignora al parsear:
  tolerancia hacia adelante).
- `parseSceneEnvelope` trata todo el texto como hostil: JSON malformado,
  sobre no estructural o marcador incorrecto → `ERR_SCENE_ENVELOPE_INVALID`;
  versión desconocida → `ERR_SCENE_ENVELOPE_VERSION` (sin migración
  silenciosa); el documento se revalida con `validateSceneDocument` y sus
  códigos se reutilizan tal cual (ids duplicados, materiales, croquis…).
- Round-trip sin pérdida: `parseSceneEnvelope(serializeScene(doc))`
  devuelve un documento estructuralmente idéntico y congelado.

## Comandos

```bash
npm run typecheck --workspace @furniconfig/modeler-core
npm test --workspace @furniconfig/modeler-core
npm run build --workspace @furniconfig/modeler-core   # dist/ + .d.ts
```
