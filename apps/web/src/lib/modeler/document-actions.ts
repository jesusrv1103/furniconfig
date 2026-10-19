/**
 * FASE-4C-B — acciones de documento del modelador sobre los
 * COMANDOS EXISTENTES de `@furniconfig/modeler-core`.
 *
 * La pantalla nunca muta un `SceneDocument`: cada edición es una
 * acción pura que construye el comando correspondiente
 * (`add-object`, `set-sketch`, `set-extrusion`,
 * `remove-object`), aplica su `apply` (puro, devuelve un nuevo
 * documento) y verifica el resultado con
 * `validateSceneDocument` antes de instalarlo. Si la fábrica del
 * comando lanza `SceneError` o el validador rechaza, la acción
 * devuelve `null` y la UI conserva el documento vigente (nunca un
 * estado a medias).
 *
 * `set-grid-step` es la única acción SIN comando: el paso de
 * rejilla es un campo del documento, no de un objeto, y el
 * repertorio de comandos v1 no lo cubre. Se valida igualmente con
 * el validador del documento.
 *
 * Seam para 4C-C (CommandHistory): al llegar el undo/redo visual,
 * esta capa sustituye `command.apply(document)` por
 * `executeCommand(history, command)` conservando las mismas
 * acciones de UI — la pantalla no cambia.
 */

import {
  createAddObjectCommand,
  createRemoveObjectCommand,
  createSetExtrusionCommand,
  createSetSketchCommand,
  validateSceneDocument,
  type Command,
  type SceneDocument,
  type SceneMaterial,
  type SceneObject,
  type Sketch2D,
} from '@furniconfig/modeler-core';

/**
 * Material por defecto de los sólidos dibujados.
 *
 * PROVISIONAL (§4 regla4): no es una regla de carpintería, es el
 * material genérico que el validador exige para poder referenciar
 * `materialId` (el documento vacío v1 nace sin materiales).
 */
export const DEFAULT_SCENE_MATERIAL: SceneMaterial = {
  id: 'material-1',
  name: 'Tablero estándar',
  finish: 'Melamina blanca',
  thicknessMm: 18,
};

/** Acciones de documento del modelador (todas puras). */
export type SceneDocumentAction =
  | {
      readonly type: 'add-solid';
      readonly sketch: Sketch2D;
      readonly extrusionMm: number;
    }
  | { readonly type: 'set-sketch'; readonly objectId: string; readonly sketch: Sketch2D }
  | {
      readonly type: 'set-extrusion';
      readonly objectId: string;
      readonly extrusionMm: number;
    }
  | { readonly type: 'remove-object'; readonly objectId: string }
  | { readonly type: 'set-grid-step'; readonly gridStepMm: number };

const SOLID_ID_PATTERN = /^solid-(\d+)$/;

/**
 * Siguiente id determinista `solid-N` (I4, sin UUID): máximo
 * existente + 1; los ids que no siguen el patrón se ignoran.
 */
export function nextSolidId(document: SceneDocument): string {
  let max = 0n;
  for (const object of document.objects) {
    const match = SOLID_ID_PATTERN.exec(object.id);
    if (match === null) continue;
    const digits = match[1];
    if (digits === undefined) continue;
    const n = BigInt(digits);
    if (n > max) max = n;
  }
  return `solid-${max + 1n}`;
}

/** ¿El documento ya contiene el material por defecto? */
function withDefaultMaterial(document: SceneDocument): SceneDocument {
  if (document.materials.some((material) => material.id === DEFAULT_SCENE_MATERIAL.id)) {
    return document;
  }
  return {
    ...document,
    materials: [...document.materials, DEFAULT_SCENE_MATERIAL],
  };
}

/**
 * FASE-4C-C — objeto sólido nuevo con IDs deterministas (I4).
 *
 * Compartido por `applySceneAction('add-solid')` y por el flujo de
 * comandos de la pantalla (`buildSolidAddCommand`): id
 * `solid-N` siguiente, nombre `Sólido N`, origen en el suelo,
 * material por defecto.
 */
export function buildSolidObject(
  document: SceneDocument,
  sketch: Sketch2D,
  extrusionMm: number,
): SceneObject {
  const id = nextSolidId(document);
  const number = id.slice('solid-'.length);
  return {
    id,
    kind: 'solid',
    name: `Sólido ${number}`,
    transform: { positionMm: [0, 0, 0] },
    geometry: {
      source: 'sketch',
      sketch,
      extrusionMm,
    },
    materialId: DEFAULT_SCENE_MATERIAL.id,
  };
}

/**
 * FASE-4C-C — comando `add-object` para un nuevo sólido del
 * croquis pendiente (ruta del historial visual).
 *
 * El comando se construye sobre `history.present` (precondiciones
 * del comando contra el documento vigente); la ejecución pertenece
 * a `use-modeler-history.dispatch`. NOTA: el documento debe
 * contener ya `DEFAULT_SCENE_MATERIAL` (la semilla de la pantalla
 * lo incluye); si faltara, la validación posterior rechaza y la UI
 * conserva el historial intacto (nunca un documento a medias).
 *
 * @throws SceneError si la fábrica rechaza el objeto.
 */
export function buildSolidAddCommand(
  document: SceneDocument,
  sketch: Sketch2D,
  extrusionMm: number,
): Command {
  return createAddObjectCommand(
    document,
    buildSolidObject(document, sketch, extrusionMm),
  );
}

/**
 * Aplica una acción sobre el documento y devuelve el NUEVO
 * documento validado (congelado), o `null` si la acción es
 * inválida (precondiciones del comando o validación final).
 * Nunca muta la entrada.
 */
export function applySceneAction(
  document: SceneDocument,
  action: SceneDocumentAction,
): SceneDocument | null {
  try {
    let next: SceneDocument;
    switch (action.type) {
      case 'add-solid': {
        const base = withDefaultMaterial(document);
        next = createAddObjectCommand(
          base,
          buildSolidObject(base, action.sketch, action.extrusionMm),
        ).apply(base);
        break;
      }
      case 'set-sketch':
        next = createSetSketchCommand(
          document,
          action.objectId,
          action.sketch,
        ).apply(document);
        break;
      case 'set-extrusion':
        next = createSetExtrusionCommand(
          document,
          action.objectId,
          action.extrusionMm,
        ).apply(document);
        break;
      case 'remove-object':
        next = createRemoveObjectCommand(document, action.objectId).apply(document);
        break;
      case 'set-grid-step':
        next = { ...document, gridStepMm: action.gridStepMm };
        break;
    }
    const result = validateSceneDocument(next);
    return result.ok ? result.document : null;
  } catch {
    // SceneError de la fábrica del comando (precondición violada,
    // objetivo inexistente, entrada malformada): la UI lo trata
    // como no-op, nunca como documento parcial.
    return null;
  }
}
