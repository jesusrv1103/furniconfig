/**
 * Historial de deshacer/rehacer del editor (Fase 3C).
 *
 * Modelo de estado del editor:
 *
 * - `present` es la `WardrobeConfig` vigente (única fuente
 *   de verdad; el motor la deriva y valida por separado).
 * - `past`/`future` contienen SOLO configuraciones: nunca
 *   geometría derivada, movimientos de cámara, selección ni
 *   recursos de Three.js (se guardan referencias a datos
 *   JSON ya existentes, sin clonar: las funciones de
 *   configuración son inmutables por contrato).
 * - El historial está ACOTADO (`limit` pasos hacia atrás);
 *   los estados futuros también quedan acotados porque cada
 *   entrada de `future` proviene de un paso previo.
 * - Editar desde un estado intermedio descarta `future`
 *   (comportamiento estándar de undo/redo).
 *
 * Funciones puras e inmutables: entrada → salida, sin
 * mutar el historial recibido ni las configuraciones.
 */

import type { WardrobeConfig } from '@furniconfig/geometry-core';

/** Pasos de deshacer retenidos por defecto. */
export const EDITOR_HISTORY_LIMIT = 50;

export interface EditorHistory {
  /** Estados anteriores; el último es el paso inmediato. */
  readonly past: readonly WardrobeConfig[];
  /** Estado vigente del editor. */
  readonly present: WardrobeConfig;
  /** Estados descartados por deshacer; el primero es el siguiente a rehacer. */
  readonly future: readonly WardrobeConfig[];
  /** Máximo de pasos de deshacer retenidos. */
  readonly limit: number;
}

/**
 * Crea un historial nuevo con `config` como estado presente.
 * Es también el reinicio al cambiar de proyecto: cada diseño
 * tiene historial propio (nunca se comparte entre diseños).
 */
export function createEditorHistory(
  config: WardrobeConfig,
  limit: number = EDITOR_HISTORY_LIMIT,
): EditorHistory {
  return { past: [], present: config, future: [], limit };
}

/**
 * Igualdad económica de configuraciones: identidad de
 * referencia o JSON equivalente. Evita registrar pasos de
 * historial para ediciones sin efecto real (p. ej. fijar el
 * mismo valor). Las diferencias de orden de claves solo
 * producirían un paso redundante, nunca uno incorrecto.
 */
function sameConfig(a: WardrobeConfig, b: WardrobeConfig): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Registra un nuevo estado: `present` pasa a `past`, se
 * descartan los estados futuros y `next` queda presente.
 * Sin cambios reales devuelve el mismo historial.
 */
export function commitEditorHistory(
  history: EditorHistory,
  next: WardrobeConfig,
): EditorHistory {
  if (sameConfig(history.present, next)) {
    return history;
  }
  const appended = [...history.past, history.present];
  const past =
    appended.length > history.limit
      ? appended.slice(appended.length - history.limit)
      : appended;
  return { ...history, past, present: next, future: [] };
}

/** Paso hacia atrás; sin pasado no hace nada. */
export function undoEditorHistory(history: EditorHistory): EditorHistory {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) {
    return history;
  }
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** Paso hacia adelante; sin futuro no hace nada. */
export function redoEditorHistory(history: EditorHistory): EditorHistory {
  const next = history.future[0];
  if (next === undefined) {
    return history;
  }
  return {
    ...history,
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function canUndo(history: EditorHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: EditorHistory): boolean {
  return history.future.length > 0;
}
