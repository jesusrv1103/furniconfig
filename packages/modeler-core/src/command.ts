/**
 * Command System + Undo/Redo del núcleo del modelador (FASE-4B-B).
 *
 * Fuente de verdad: `PROPOSED_ARCHITECTURE.md` §3.7 y
 * `SCENE_DOCUMENT.md` §3.7. Generaliza el patrón de
 * `apps/web/src/lib/studio/history.ts` (historial acotado, hoy tipado contra
 * `WardrobeConfig`) a comandos puros sobre `SceneDocument`.
 *
 * Diseño:
 *
 * - El historial guarda **comandos**, no documentos completos: cada comando
 *   retiene solo el delta necesario para revertir (§3.7).
 * - `apply`/`revert` son **puros y deterministas**: no mutan el documento de
 *   entrada (invariante I3) y producen siempre la misma salida dada la misma
 *   entrada.
 * - Tres situaciones diferenciadas (FASE-4B-B):
 *   (A) cambio válido aplicado → nueva entrada en `past`;
 *   (B) no-op (el valor pedido ya estaba en el documento) → el historial
 *       **no cambia**: se devuelve la misma referencia, sin entrada nueva;
 *   (C) operación inválida o precondición incumplida → `SceneError` con
 *       código estable y el historial **intacto** (el estado nuevo solo se
 *       construye si todo lo anterior ha ido bien).
 * - La detección de no-op es por **referencia primero e igualdad estructural
 *   después** (`deepEqual`): nunca `JSON.stringify` de documentos completos.
 * - Toda operación que produce un documento lo **valida** con
 *   `validateSceneDocument` antes de instalarlo, de modo que `present` es
 *   siempre válido y congelado (I3).
 *
 * Invariante de linealidad: `executeCommand`/`undoCommand`/`redoCommand`
 * recorren el historial en un único hilo; por eso un comando guardado se
 * aplica y revierte exactamente sobre el estado que él mismo produjo. Los
 * chequeos de precondiciones (`ERR_SCENE_COMMAND_CONFLICT`,
 * `ERR_SCENE_OBJECT_NOT_FOUND`, `ERR_SCENE_DUPLICATE_ID`) protegen el
 * historial ante comandos aplicados a un documento que no es el esperado
 * (uso indebido de la API o edición concurrente futura).
 */

import { SceneError } from './errors.js';
import { deepFreeze } from './freeze.js';
import {
  validateSceneDocument,
  type SceneValidationOptions,
} from './validate.js';
import type { SceneDocument } from './types/document.js';

/** Tipos de comando del MVP (§3.7). Identificador de código en inglés. */
export type CommandKind =
  | 'add-object'
  | 'remove-object'
  | 'set-sketch'
  | 'set-extrusion'
  | 'set-transform'
  | 'set-params'
  | 'rename';

/**
 * Operación reversible sobre el documento de escena.
 *
 * Las fábricas de `commands.ts` capturan al crear el comando el delta
 * (estado previo) necesario para revertir; `apply`/`revert` comprueban
 * además que el documento actual coincide con lo capturado y lanzan
 * `SceneError` si no (precondición incumplida = situación C).
 */
export interface Command {
  /** ID determinista (sin UUID): derivado del tipo y del objetivo. */
  readonly id: string;
  readonly kind: CommandKind;
  /** Etiqueta legible para la UI de historial (en español). */
  readonly label: string;
  /** Produce el documento siguiente. Puro: no muta `doc`. @throws SceneError */
  apply(doc: SceneDocument): SceneDocument;
  /** Restaura el estado previo. Puro: no muta `doc`. @throws SceneError */
  revert(doc: SceneDocument): SceneDocument;
}

/**
 * Historial inmutable de comandos: `present` es el documento actual
 * (siempre válido y congelado); `past` y `future` contienen los comandos
 * pendientes de rehacer/deshacer, en orden cronológico.
 */
export interface CommandHistory {
  /** Comandos ya ejecutados (el último es el más reciente). */
  readonly past: readonly Command[];
  readonly present: SceneDocument;
  /** Comandos deshechos (el primero es el siguiente en rehacerse). */
  readonly future: readonly Command[];
  /** Tamaño máximo de `past`. */
  readonly limit: number;
}

/**
 * Límite por defecto de entradas del historial. **PROVISIONAL**
 * (hipótesis de trabajo, misma cota que `history.ts` y el paso 9.4 del
 * `POC_PLAN`): no es una regla de fabricación.
 */
export const DEFAULT_COMMAND_HISTORY_LIMIT = 100;

/**
 * Igualdad estructural para JSON (documentos, croquises, `params`).
 *
 * `Object.is` en primitivas, comparación elemento a elemento en arrays y
 * por claves propias en registros. Se usa para detectar no-op **sin**
 * serializar documentos completos con `JSON.stringify` (regla de
 * FASE-4B-B) y trata `NaN` como igual a `NaN` (útil antes de validar).
 *
 * Seguridad: la recursión desciende por el árbol del segundo argumento, de
 * modo que termina siempre que ese lado sea finito y acíclico — lo que
 * garantiza todo documento validado (`params` se sanea con cota de
 * profundidad). No está pensado para dos estructuras cíclicas a la vez.
 *
 * Función interna del paquete: se exporta del módulo para `commands.ts`
 * pero **no** desde `index.ts`.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const recordA = a as Record<string, unknown>;
  const recordB = b as Record<string, unknown>;
  const keysA = Object.keys(recordA);
  const keysB = Object.keys(recordB);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.hasOwn(recordB, key)) return false;
    if (!deepEqual(recordA[key], recordB[key])) return false;
  }
  return true;
}

/**
 * Crea un historial vacío con `present = initial`.
 *
 * @throws SceneError si `initial` no es un documento válido (código del
 * primer hallazgo de validación) o si `limit` no es un entero ≥ 1
 * (`ERR_SCENE_INVALID_OBJECT`). Son errores de programación: el historial
 * nunca debe nacer corrupto.
 */
export function createCommandHistory(
  initial: SceneDocument,
  limit: number = DEFAULT_COMMAND_HISTORY_LIMIT,
): CommandHistory {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'El límite del historial debe ser un entero ≥ 1.',
      { limit: String(limit) },
    );
  }
  const validated = validateSceneDocument(initial);
  if (!validated.ok) {
    const first = validated.errors[0];
    throw new SceneError(
      first?.code ?? 'ERR_SCENE_INVALID_OBJECT',
      `El documento inicial del historial no es válido (${validated.errors.length} error(s); primer campo: ${first?.field ?? 'desconocido'}).`,
      { field: first?.field ?? 'root' },
    );
  }
  return deepFreeze({
    past: [] as Command[],
    present: validated.document,
    future: [] as Command[],
    limit,
  });
}

/**
 * Valida el documento producido por `apply`/`revert` y lo devuelve
 * reconstruido y congelado. Lanza `SceneError` con el código del primer
 * hallazgo si el resultado fuera inválido: así una operación inválida
 * (situación C) jamás instala un documento corrupto en el historial.
 */
function assertValidDocument(
  doc: SceneDocument,
  options: SceneValidationOptions,
  phase: 'apply' | 'revert',
): SceneDocument {
  const validated = validateSceneDocument(doc, options);
  if (validated.ok) return validated.document;
  const first = validated.errors[0];
  throw new SceneError(
    first?.code ?? 'ERR_SCENE_INVALID_OBJECT',
    `El documento resultante de ${phase} no es válido (${validated.errors.length} error(s); primer campo: ${first?.field ?? 'desconocido'}).`,
    { field: first?.field ?? 'root', phase },
  );
}

/** Recorta `past` al límite descartando las entradas más antiguas. */
function trimPast(past: readonly Command[], limit: number): Command[] {
  return past.length > limit ? [...past.slice(past.length - limit)] : [...past];
}

/**
 * Ejecuta `command` sobre `history.present` y empuja una nueva entrada.
 *
 * - (A) cambio válido → `past + [command]`, `future = []` (una operación
 *   nueva tras undo descarta el futuro, criterio 9.3 del `POC_PLAN`) y
 *   `past` recortado a `limit`.
 * - (B) no-op → se devuelve **la misma referencia** de historial: sin
 *   entrada nueva y sin tocar `future`.
 * - (C) `command.apply` lanza `SceneError` o el resultado no valida → el
 *   error se propaga y el historial de entrada queda intacto.
 *
 * @param options validación del documento resultante (p. ej. registro de
 * componentes para comprobar `params` contra su esquema).
 * @throws SceneError si el comando o el documento resultante son inválidos.
 */
export function executeCommand(
  history: CommandHistory,
  command: Command,
  options: SceneValidationOptions = {},
): CommandHistory {
  const result = command.apply(history.present);

  // (B) no-op: mismo contenido ya presente → sin cambios (sin JSON.stringify).
  if (result === history.present || deepEqual(result, history.present)) {
    return history;
  }

  const present = assertValidDocument(result, options, 'apply');
  return deepFreeze({
    past: trimPast([...history.past, command], history.limit),
    present,
    future: [] as Command[],
    limit: history.limit,
  });
}

/**
 * Deshace el último comando: `revert` sobre `present` y el comando pasa a
 * `future`. Devuelve la **misma referencia** si `past` está vacío (la UI
 * debe consultar `canUndo`; navegar una pila vacía no es un error).
 *
 * @throws SceneError si `revert` falla (precondición) o el documento
 * resultante no valida: el historial queda intacto.
 */
export function undoCommand(
  history: CommandHistory,
  options: SceneValidationOptions = {},
): CommandHistory {
  const last = history.past[history.past.length - 1];
  if (last === undefined) return history;

  const present = assertValidDocument(last.revert(history.present), options, 'revert');
  return deepFreeze({
    past: [...history.past.slice(0, -1)],
    present,
    future: [last, ...history.future],
    limit: history.limit,
  });
}

/**
 * Rehace el primer comando de `future`: `apply` sobre `present` y el
 * comando pasa a `past` (recortado al límite). Devuelve la **misma
 * referencia** si `future` está vacío (consultar `canRedo`).
 *
 * @throws SceneError si `apply` falla o el resultado no valida.
 */
export function redoCommand(
  history: CommandHistory,
  options: SceneValidationOptions = {},
): CommandHistory {
  const next = history.future[0];
  if (next === undefined) return history;

  const present = assertValidDocument(next.apply(history.present), options, 'apply');
  return deepFreeze({
    past: trimPast([...history.past, next], history.limit),
    present,
    future: [...history.future.slice(1)],
    limit: history.limit,
  });
}

/** ¿Hay algún comando pendiente de deshacer? */
export function canUndo(history: CommandHistory): boolean {
  return history.past.length > 0;
}

/** ¿Hay algún comando pendiente de rehacer? */
export function canRedo(history: CommandHistory): boolean {
  return history.future.length > 0;
}
