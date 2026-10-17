/**
 * Apertura no destructiva de un diseño existente en un documento de escena
 * (FASE-4B-D, D2/§4).
 *
 * `DesignRecord` (`furniconfig-design` v1, `apps/web/src/lib/designs`) →
 * `SceneDocument` (`furniconfig-scene` v1) con **un** `ComponentInstance`
 * de tipo `furniconfig.wardrobe` cuyo `params` es el `WardrobeConfig` v1
 * **íntegro e intacto**.
 *
 * Reglas cumplidas (MIGRATION_STRATEGY.md §5 y mandato 4B-D):
 *
 * - Función **pura**: no muta el registro de entrada ni escribe en
 *   `localStorage` ni en ninguna parte; el diseño original queda intacto.
 * - Sin migración automática: la transformación es **explícita** (solo
 *   ocurre cuando el llamante invoca esta función).
 * - El documento nuevo usa `furniconfig-scene` v1 y material propio
 *   (`material-1`), sin colisionar con los ids del motor del clóset.
 * - Historiales independientes: esta función no toca `EditorHistory` del
 *   configurador; el `CommandHistory` del modelador nace aparte, del
 *   documento devuelto.
 */

import {
  SceneError,
  createEmptySceneDocument,
  validateSceneDocument,
  type ComponentInstance,
  type SceneDocument,
  type SceneParams,
} from '@furniconfig/modeler-core';
import { validateWardrobeConfig } from '@furniconfig/geometry-core';

import type { DesignRecord } from '../designs/types.js';
import {
  WARDROBE_COMPONENT_TYPE,
  WARDROBE_COMPONENT_VERSION,
  wardrobeComponent,
} from './components/wardrobe.js';

/** Registro mínimo con el que se valida el documento abierto. */
export const wardrobeSceneRegistry = {
  [WARDROBE_COMPONENT_TYPE]: wardrobeComponent,
} as const;

export interface OpenDesignOptions {
  /** Id determinista del documento nuevo (por defecto `scene-1`). */
  readonly documentId?: string;
  /** Nombre del objeto componente (por defecto, el nombre del diseño). */
  readonly objectName?: string;
}

/**
 * Transforma explícitamente un diseño guardado en un documento de escena
 * nuevo con el clóset como componente paramétrico.
 *
 * @throws SceneError `ERR_SCENE_PARAMS_OUT_OF_RANGE` si la configuración
 * del registro no pasa la validación del motor (registro corrupto o
 * construido a mano).
 */
export function openDesignAsSceneDocument(
  record: DesignRecord,
  options: OpenDesignOptions = {},
): SceneDocument {
  const validation = validateWardrobeConfig(record.config);
  if (!validation.ok) {
    const first = validation.errors[0];
    throw new SceneError(
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
      `El diseño "${record.id}" tiene una configuración inválida: ${first?.message ?? 'error desconocido'} (${first?.field ?? 'config'})`,
      { designId: record.id, field: first?.field ?? 'config' },
    );
  }

  const base = createEmptySceneDocument(
    options.documentId ?? 'scene-1',
    record.name.trim() === '' ? 'Diseño sin nombre' : record.name,
  );

  const fallbackName = record.name.trim() === '' ? 'Clóset' : record.name;
  const objectName =
    options.objectName !== undefined && options.objectName.trim() !== ''
      ? options.objectName
      : fallbackName;

  const instance: ComponentInstance = {
    id: 'component-1',
    kind: 'component',
    name: objectName,
    type: WARDROBE_COMPONENT_TYPE,
    version: WARDROBE_COMPONENT_VERSION,
    transform: { positionMm: [0, 0, 0] },
    materialId: 'material-1',
    params: validation.config as unknown as SceneParams,
  };

  const result = validateSceneDocument(
    {
      ...base,
      materials: [
        {
          id: 'material-1',
          name: 'Material del clóset',
          finish: 'multiuso',
          thicknessMm: validation.config.materials.structure.thicknessMm,
        },
      ],
      objects: [instance],
    },
    { components: wardrobeSceneRegistry },
  );
  if (!result.ok) {
    const first = result.errors[0];
    throw new SceneError(
      first?.code ?? 'ERR_SCENE_INVALID_OBJECT',
      `El documento derivado del diseño "${record.id}" no es válido: ${first?.message ?? 'error desconocido'}`,
      { designId: record.id, field: first?.field ?? 'root' },
    );
  }
  return result.document;
}
