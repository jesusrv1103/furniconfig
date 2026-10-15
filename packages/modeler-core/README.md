# @furniconfig/modeler-core

Núcleo puro del modelador libre de FurniConfig (**FASE-4B-A**): documentos de
escena versionados, validación estricta y selección de objetos.

Fuente de contratos: `docs/architecture/furniconfig-4/SCENE_DOCUMENT.md`
(complementa `PROPOSED_ARCHITECTURE.md` §3.1–§3.4).

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

**No incluido** (fases posteriores): herramientas de dibujo (4B-B), kernel en
Web Worker (4B-C), registro completo de componentes con `build()` (4B-D),
edición por caras/aristas/vértices (capacidad futura, RISKS R-05).

## Invariantes

1. **I1**: unidad interna mm **enteros** en todo el documento.
2. **I2**: origen en la esquina inferior-izquierda-frontal; posiciones = esquina mínima.
3. **I3**: el documento es **inmutable**: la salida del validador se congela en profundidad.
4. **I4**: IDs **deterministas** (sin UUID).
5. **I5**: sin Three.js/DOM/I/O ni dependencias runtime en este paquete.
6. **I6**: toda entrada externa se valida antes de entrar al documento.

## Códigos de error

Nueve códigos estables (`SceneErrorCode`), separados de `GeometryErrorCode`
de `geometry-core` (que este paquete no conoce ni modifica):

| Código | Significado |
|--------|-------------|
| `ERR_SCENE_INVALID_VERSION` | `documentVersion` distinto de 1 |
| `ERR_SCENE_INVALID_OBJECT` | Forma inválida (documento, objeto, material, croquis) |
| `ERR_SCENE_DUPLICATE_ID` | IDs repetidos en objetos o materiales |
| `ERR_SCENE_DEGENERATE_SKETCH` | Croquis vacío, no cerrado o de área 0 |
| `ERR_SCENE_INVALID_EXTRUSION` | Extrusión fuera de rango |
| `ERR_SCENE_UNKNOWN_MATERIAL` | `materialId` sin resolver |
| `ERR_SCENE_UNKNOWN_COMPONENT` | Tipo/versión de componente no registrado |
| `ERR_SCENE_PARAMS_OUT_OF_RANGE` | Parámetro fuera del esquema o no serializable |
| `ERR_SCENE_TRANSFORM_INVALID` | Transformación/posición no entera o no finita |

## Registro de componentes

`validateSceneDocument` acepta opcionalmente `options.components`
(`ComponentRegistry`), el contrato **mínimo** que la validación necesita
(versión + esquema de parámetros escalares). Sin registro, los componentes se
validan solo estructuralmente. La definición completa con `build()`
(regeneración de geometría) llega en la Fase 4B-D y se apoya en este contrato.

Los parámetros **no declarados** en el esquema se admiten como JSON
serializable: necesario para parámetros anidados como un `WardrobeConfig`
completo en `params` del componente clóset (§6–§7 del contrato), cuyo rango
valida `geometry-core` al construir el componente.

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

## Comandos

```bash
npm run typecheck --workspace @furniconfig/modeler-core
npm test --workspace @furniconfig/modeler-core
npm run build --workspace @furniconfig/modeler-core   # dist/ + .d.ts
```
