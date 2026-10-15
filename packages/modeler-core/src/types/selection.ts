/**
 * Contratos de selección del modelador (FASE-4B-A).
 *
 * Alcance del MVP (`PROPOSED_ARCHITECTURE.md` §3.4): selección y modificación
 * **por objeto**. Los niveles `'face' | 'edge' | 'vertex'` son una capacidad
 * futura (RISKS R-05) — el tipo del nivel ya contempla la evolución para no
 * romper contratos después, pero no se implementan.
 */

/** Nivel de selección. El MVP solo usa `'object'`. */
export type SelectionLevel = 'object';

/**
 * Estado de selección, serializable (lista de ids deterministas de
 * `SceneObject`). Estado vacío = nada seleccionado.
 */
export interface SelectionState {
  readonly level: SelectionLevel;
  readonly ids: readonly string[];
  /** Id del objeto ancla de la selección (el primero seleccionado), o null. */
  readonly anchor: string | null;
}

/**
 * Resultado de un pick sobre la escena: el id del objeto golpeado, o `null`
 * cuando el clic cayó en el vacío.
 */
export interface SelectionPick {
  readonly objectId: string | null;
}
