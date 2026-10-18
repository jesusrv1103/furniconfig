/**
 * @furniconfig/modeler-core — núcleo puro del modelador libre (FASE-4B-A/4B-B/4B-D).
 *
 * Contiene el Scene Document v1 (fuente única de verdad, inmutable y
 * serializable), su validación estricta, la selección por objeto, el
 * sistema de comandos con undo/redo (FASE-4B-B; la conversión a
 * componente paramétrico llegó en 4B-D), la serialización versionada en
 * `SceneEnvelope` y el registro de componentes paramétricos con `build()`
 * (FASE-4B-D: geometría derivada, determinista y nunca almacenada).
 *
 * Paquete **puro**: sin React, Three.js, DOM, WebAssembly ni dependencias
 * runtime (invariante I5). La escena 3D se deriva del documento; este
 * paquete no renderiza ni muta estado externo.
 */

export {
  SCENE_DOCUMENT_VERSION,
  type MmPoint2,
  type MmPoint3,
  type SketchPlane,
  type Transform3,
  type Sketch2D,
  type SceneGeometryRef,
  type SceneMaterial,
  type SceneParamValue,
  type SceneParams,
  type SolidObject,
  type ComponentInstance,
  type SceneObject,
  type SceneDocument,
} from './types/document.js';

export type {
  ComponentParamSpec,
  ComponentDefRef,
  ComponentRegistry,
  ComponentPart,
  ComponentBuild,
  ParametricComponentDef,
  ParametricComponentRegistry,
} from './types/component.js';

export type {
  SelectionLevel,
  SelectionState,
  SelectionPick,
} from './types/selection.js';

export {
  SceneError,
  type SceneErrorCode,
  type SceneIssue,
} from './errors.js';

export { SCENE_LIMITS } from './limits.js';

export {
  createEmptySceneDocument,
  nextSceneId,
  DEFAULT_SCENE_NAME,
  DEFAULT_GRID_STEP_MM,
} from './document.js';

export {
  validateSceneDocument,
  type SceneValidationOptions,
  type SceneValidationResult,
} from './validate.js';

export { resolveObjectSelection, isSelected } from './selection.js';

export {
  createCommandHistory,
  executeCommand,
  undoCommand,
  redoCommand,
  canUndo,
  canRedo,
  DEFAULT_COMMAND_HISTORY_LIMIT,
  type Command,
  type CommandKind,
  type CommandHistory,
} from './command.js';

export {
  defineComponent,
  createComponentRegistry,
  buildComponent,
  componentPartId,
} from './components.js';

export {
  createAddObjectCommand,
  createRemoveObjectCommand,
  createSetSketchCommand,
  createSetExtrusionCommand,
  createSetTransformCommand,
  createSetParamsCommand,
  createRenameCommand,
  createConvertToComponentCommand,
} from './commands.js';

export {
  setSketchDimension,
  sketchDimensionMm,
  type SketchDimension,
} from './sketch-dimension.js';

export {
  SCENE_FORMAT,
  SCENE_FORMAT_VERSION,
  serializeScene,
  parseSceneEnvelope,
  type SceneEnvelope,
  type ParseSceneEnvelopeResult,
} from './serialize.js';
