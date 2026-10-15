/**
 * Creación del documento de escena (FASE-4B-A).
 *
 * Funciones **puras**: sin estado global, sin contadores mutables, sin
 * UUID. Los IDs son deterministas por convención del repo (`scene-N`);
 * la no-colisión entre documentos la resuelve el llamante con
 * `nextSceneId`, que es una función pura de los documentos existentes.
 */

import { SceneError } from './errors.js';
import { deepFreeze } from './freeze.js';
import {
  SCENE_DOCUMENT_VERSION,
  type SceneDocument,
} from './types/document.js';

/** Nombre por defecto de un documento nuevo. */
export const DEFAULT_SCENE_NAME = 'Escena sin título';

/** Paso de rejilla por defecto del documento (mm). */
export const DEFAULT_GRID_STEP_MM = 10;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Crea un documento vacío **válido y congelado** (I3): sin objetos y sin
 * materiales, con origen en `[0, 0, 0]` (I2) y `documentVersion: 1`.
 *
 * @throws SceneError `ERR_SCENE_INVALID_OBJECT` si `id` o `name` no son
 * cadenas no vacías (error de programación, no de entrada externa).
 */
export function createEmptySceneDocument(
  id: string = 'scene-1',
  name: string = DEFAULT_SCENE_NAME,
): SceneDocument {
  if (!isNonEmptyString(id)) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'El id del documento debe ser una cadena no vacía.',
      { id: String(id) },
    );
  }
  if (!isNonEmptyString(name)) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'El nombre del documento debe ser una cadena no vacía.',
      { name: String(name) },
    );
  }
  return deepFreeze({
    documentVersion: SCENE_DOCUMENT_VERSION,
    id,
    name,
    gridStepMm: DEFAULT_GRID_STEP_MM,
    originMm: [0, 0, 0] as const,
    objects: [],
    materials: [],
  });
}

const SCENE_ID_PATTERN = /^scene-(\d+)$/;

/**
 * Siguiente id determinista `scene-N` libre dado el conjunto de documentos
 * existentes (I4, sin UUID): devuelve `scene-(máxN + 1)`, o `scene-1` si
 * aún no hay documentos de escena. Los ids que no siguen el patrón se
 * ignoran.
 *
 * Pura: mismo conjunto de entrada → mismo id de salida. **Garantiza además
 * que el resultado nunca esté en la colección de entrada**: la comparación
 * se hace con `BigInt` porque los ids procedentes de importaciones JSON
 * pueden superar 2⁵³, donde `Number` pierde exactitud (`max + 1` se
 * redondeaba al propio id existente, provocando una colisión) y la
 * conversión a cadena producía notación científica (`scene-1e+24`) fuera
 * del patrón `scene-N`.
 */
export function nextSceneId(
  existing: readonly { readonly id: string }[],
): string {
  let max = 0n;
  for (const doc of existing) {
    const match = SCENE_ID_PATTERN.exec(doc.id);
    if (match === null) continue;
    const digits = match[1];
    if (digits === undefined) continue; // imposible con \d+, por noUncheckedIndexedAccess
    const n = BigInt(digits); // exacto sin importar la cantidad de dígitos
    if (n > max) max = n;
  }
  return `scene-${max + 1n}`;
}
