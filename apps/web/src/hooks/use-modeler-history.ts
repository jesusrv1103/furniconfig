/**
 * FASE-4C-C, C1 — historial visual del modelador.
 *
 * Integra EXCLUSIVAMENTE el `CommandHistory` existente de
 * `@furniconfig/modeler-core` (`createCommandHistory`,
 * `executeCommand`, `undoCommand`, `redoCommand`, `canUndo`,
 * `canRedo`) sin reimplementar pila alguna. Reglas:
 *
 * - **Fuente única de verdad**: el documento visible es
 *   `history.present`; no existe un `SceneDocument` paralelo.
 * - **Límite PROVISIONAL** de 100 operaciones
 *   (`DEFAULT_COMMAND_HISTORY_LIMIT`) conservado.
 * - **No-op** → `executeCommand` devuelve la MISMA referencia: sin
 *   entrada nueva ni tocar el futuro (una edición confirmada sin
 *   cambio no ensucia el historial).
 * - **Conflicto** (`SceneError` de precondición: comando capturado
 *   sobre un documento que ya no coincide) → se captura y el
 *   historial queda intacto: nunca un estado a medias.
 * - El historial es INDEPENDIENTE por pantalla: este hook vive en
 *   `ModelerApp`; el configurador usa `use-editor-history`
 *   (módulo, estado y líneas separados; jamás se comparten).
 *
 * Las funciones puras (`dispatchHistoryCommand`, `undoHistory`,
 * `redoHistory`, `historyLabels`) se exportan para poder probar la
 * semántica en node (el entorno de tests unitarios no tiene DOM ni
 * renderizador React).
 */

import { useCallback, useMemo, useState } from 'react';

import {
  DEFAULT_COMMAND_HISTORY_LIMIT,
  canRedo,
  canUndo,
  createCommandHistory,
  executeCommand,
  redoCommand,
  undoCommand,
  type Command,
  type CommandHistory,
  type SceneDocument,
} from '@furniconfig/modeler-core';

/** Resultado de una operación de historial que sí cambió el documento. */
export interface HistoryChange {
  /** Documento resultante (`history.present` tras la operación). */
  readonly document: SceneDocument;
  /** Etiqueta del comando deshecho/rehecho/ejecutado (para feedback). */
  readonly label: string;
}

/**
 * Ejecuta `command` sobre `history`. Devuelve el historial nuevo, o
 * `null` si no hubo cambio (no-op) o el comando falló
 * (precondición/validación → historial intacto).
 */
export function dispatchHistoryCommand(
  history: CommandHistory,
  command: Command,
): CommandHistory | null {
  try {
    const next = executeCommand(history, command);
    return next === history ? null : next;
  } catch {
    // SceneError (situación C): la UI lo trata como no-op.
    return null;
  }
}

/** Deshace; `null` si no había nada o `revert` falló (intacto). */
export function undoHistory(history: CommandHistory): CommandHistory | null {
  try {
    const next = undoCommand(history);
    return next === history ? null : next;
  } catch {
    return null;
  }
}

/** Rehace; `null` si no había futuro o `apply` falló (intacto). */
export function redoHistory(history: CommandHistory): CommandHistory | null {
  try {
    const next = redoCommand(history);
    return next === history ? null : next;
  } catch {
    return null;
  }
}

/**
 * WAVE-01 BLOQUE 3 — historial NUEVO para un documento ajeno al flujo
 * actual (apertura o creación de diseño): pilas vacías, para que
 * «Deshacer» jamás pueda volver al documento anterior.
 */
export function resetHistory(document: SceneDocument): CommandHistory {
  return createCommandHistory(document, DEFAULT_COMMAND_HISTORY_LIMIT);
}

/** Etiquetas de lo que harán Deshacer/Rehacer (o `null`). */
export function historyLabels(history: CommandHistory): {
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
} {
  const pastLast = history.past[history.past.length - 1];
  const futureFirst = history.future[0];
  return {
    undoLabel: canUndo(history) && pastLast !== undefined ? pastLast.label : null,
    redoLabel: canRedo(history) && futureFirst !== undefined ? futureFirst.label : null,
  };
}

/** API del historial para la pantalla. */
export interface ModelerHistory {
  /** Documento visible: FUENTE ÚNICA DE VERDAD (`history.present`). */
  readonly document: SceneDocument;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Qué haría Deshacer/Rehacer (etiquetas en español). */
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  /** Niveles de las pilas (para depuración/verificación visual). */
  readonly pastLength: number;
  readonly futureLength: number;
  /** Ejecuta un comando nuevo; `null` = no-op/conflicto (intacto). */
  dispatch(command: Command): HistoryChange | null;
  /** Deshace; `null` = nada que deshacer/fallo (intacto). */
  undo(): HistoryChange | null;
  /** Rehace; `null` = nada que rehacer/fallo (intacto). */
  redo(): HistoryChange | null;
  /**
   * WAVE-01 BLOQUE 3 — instala un documento nuevo (apertura/nuevo
   * diseño) con historial VACÍO (sin deshacer al documento previo).
   */
  reset(document: SceneDocument): void;
}

/**
 * Historial visual del modelador: `CommandHistory` en `useState`.
 *
 * Los callbacks leen el historial vigente del cierre del render
 * actual (cada evento discreto de React ve el estado ya
 * comprometido); si dos operaciones llegaran sin render intermedio,
 * la segunda vería un documento desactualizado → `SceneError` de
 * precondición → `null` con el historial intacto (nunca un estado
 * corrupto).
 */
export function useModelerHistory(initial: SceneDocument): ModelerHistory {
  const [history, setHistory] = useState(() =>
    createCommandHistory(initial, DEFAULT_COMMAND_HISTORY_LIMIT),
  );

  const dispatch = useCallback(
    (command: Command): HistoryChange | null => {
      const next = dispatchHistoryCommand(history, command);
      if (next === null) return null;
      setHistory(next);
      return { document: next.present, label: command.label };
    },
    [history],
  );

  const undo = useCallback((): HistoryChange | null => {
    const label = history.past[history.past.length - 1]?.label;
    const next = undoHistory(history);
    if (next === null || label === undefined) return null;
    setHistory(next);
    return { document: next.present, label };
  }, [history]);

  const redo = useCallback((): HistoryChange | null => {
    const label = history.future[0]?.label;
    const next = redoHistory(history);
    if (next === null || label === undefined) return null;
    setHistory(next);
    return { document: next.present, label };
  }, [history]);

  const reset = useCallback((document: SceneDocument): void => {
    setHistory(resetHistory(document));
  }, []);

  const labels = useMemo(() => historyLabels(history), [history]);

  return {
    document: history.present,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    undoLabel: labels.undoLabel,
    redoLabel: labels.redoLabel,
    pastLength: history.past.length,
    futureLength: history.future.length,
    dispatch,
    undo,
    redo,
    reset,
  };
}
