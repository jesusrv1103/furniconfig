/**
 * Selección por objeto del modelador (FASE-4B-A).
 *
 * Capa pura entre el documento y el estado de selección de la interfaz.
 * Alcance del MVP: **objeto completo** (`PROPOSED_ARCHITECTURE.md` §3.4);
 * la selección por cara/arista/vértice es una capacidad futura (RISKS R-05)
 * y no se implementa aquí.
 *
 * Patrón heredado de `apps/web/src/lib/studio/selection.ts`: la
 * correspondencia clic → objeto usa los **ids deterministas** del documento,
 * no índices ni referencias, y la resolución devuelve `null` cuando no hay
 * selección resultante (criterio de aceptación del `POC_PLAN.md` paso 5:
 * "id inexistente → null, documento vacío → null").
 */

import type { SceneDocument } from './types/document.js';
import type { SelectionPick, SelectionState } from './types/selection.js';
import { deepFreeze } from './freeze.js';

/**
 * Resuelve un pick sobre el documento en un estado de selección, o `null`
 * cuando no resulta nada seleccionable:
 *
 * - Clic en el vacío (`objectId: null`) → `null` (deselección).
 * - Objeto existente → selección de un solo objeto, anclada en ese id.
 * - Id inexistente (p. ej. el objeto se borró tras el raycast) → `null`:
 *   nunca se selecciona algo que el documento no contiene.
 * - Documento vacío → `null`.
 *
 * Determinista y sin mutar ni el documento ni el pick. Los estados
 * devueltos están congelados (I3).
 */
export function resolveObjectSelection(
  document: SceneDocument,
  pick: SelectionPick,
): SelectionState | null {
  const id = pick.objectId;
  if (id === null) {
    return null;
  }
  const exists = document.objects.some((object) => object.id === id);
  if (!exists) {
    return null;
  }
  return deepFreeze({ level: 'object', ids: [id], anchor: id });
}

/** ¿Está `objectId` en la selección vigente? `null` → nada seleccionado. */
export function isSelected(
  state: SelectionState | null,
  objectId: string,
): boolean {
  return state !== null && state.ids.includes(objectId);
}
