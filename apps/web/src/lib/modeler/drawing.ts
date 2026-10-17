/**
 * FASE-4C-B, B1 — lógica pura de dibujo del modelador.
 *
 * Módulo SIN React ni Three.js (testeable en node): todo el
 * gesto de rectángulo se reduce a milímetros enteros antes de
 * tocar el documento (I1).
 *
 * Decisiones contractuales (§4 de la preparación de 4C-B):
 *
 * - **Proyección**: la escena entrega el punto de intersección
 *   rayo↔plano ground en METROS (world); aquí se convierte a mm
 *   (`worldToGroundMm`) y se cuantiza UNA sola vez con el snap
 *   (`snapMm`). La geometría que produzca el kernel después se
 *   usa tal cual, sin redondeos adicionales.
 * - **Snap simétrico**: `Math.round` de JS es asimétrico en .5
 *   (`Math.round(-1.5) === -1`), lo que haría que −15 mm y +15 mm
 *   cayeran a cuadrículas distintas. El snap redondea por
 *   magnitud y reaplica el signo: −15 → −20 con paso 10, igual
 *   que +15 → +20.
 * - **Cuatro sentidos de arrastre**: las esquinas se normalizan
 *   a la esquina mínima (I2) con winding fijo, de modo que
 *   arrastrar en cualquier dirección produce EXACTAMENTE el mismo
 *   `Sketch2D`.
 * - **Degenerados**: un arrastre sin extensión (tras snap, igual
 *   coordenada en X o Z) no genera croquis (null) — nunca se lanza.
 * - **Clics accidentales**: `isClick` implementa el clickGuard
 *   (deriva en píxeles ≤ `CLICK_GUARD_PX`).
 * - **Escape**: `cancelDrawGesture` devuelve el gesto vacío; la
 *   pantalla lo aplica al detectar la tecla (sin estado parcial).
 */

import { SCENE_LIMITS, type MmPoint2, type Sketch2D } from '@furniconfig/modeler-core';

import { mToMm } from '../units.js';

/** Deriva máxima (px) que sigue contando como clic (clickGuard). */
export const CLICK_GUARD_PX = 5;

/** Herramientas explícitas del modelador (nunca se infiere intención). */
export type ModelerTool = 'select' | 'rectangle';

/** ¿Un recorrido de puntero cuenta como clic (y no como arrastre)? */
export function isClick(driftPx: number): boolean {
  return Number.isFinite(driftPx) && driftPx >= 0 && driftPx <= CLICK_GUARD_PX;
}

/**
 * Snap simétrico a la cuadrícula más cercana (mm enteros).
 *
 * @throws RangeError si `stepMm` no es un entero ≥ 1 o `valueMm`
 * no es finito (error de programación, no de entrada de usuario).
 */
export function snapMm(valueMm: number, stepMm: number): number {
  if (!Number.isFinite(valueMm)) {
    throw new RangeError(`snapMm: valor no finito (${valueMm}).`);
  }
  if (!Number.isInteger(stepMm) || stepMm < 1) {
    throw new RangeError(`snapMm: paso de rejilla inválido (${stepMm}).`);
  }
  const sign = valueMm < 0 ? -1 : 1;
  // `+ 0` normaliza el −0 cuando la magnitud redondea a cero.
  return sign * Math.round(Math.abs(valueMm) / stepMm) * stepMm + 0;
}

/** Snap simétrico de un punto 2D (ambas coordenadas enteras). */
export function snapPointMm(
  point: readonly [number, number],
  stepMm: number,
): MmPoint2 {
  return [snapMm(point[0], stepMm), snapMm(point[1], stepMm)];
}

/**
 * Punto ground en metros (mundo) → coordenadas planas en mm
 * (X, Z) SIN cuantizar: el snap se aplica aparte, una sola vez.
 */
export function worldToGroundMm(
  worldM: readonly [number, number, number],
): readonly [number, number] {
  return [mToMm(worldM[0]), mToMm(worldM[2])];
}

/** Estado puro del gesto de dibujo (esquina actual ya en mm). */
export interface DrawGesture {
  /** Esquina de inicio (snapeada); `null` = sin gesto. */
  readonly originMm: MmPoint2 | null;
  /** Esquina actual (snapeada) mientras se arrastra. */
  readonly currentMm: MmPoint2 | null;
}

/** Gesto vacío (también el resultado de cancelar con Escape). */
export function createDrawGesture(): DrawGesture {
  return { originMm: null, currentMm: null };
}

/** Inicia un gesto en el punto (en metros, mundo) con el snap dado. */
export function beginDrawGesture(
  worldM: readonly [number, number, number],
  stepMm: number,
): DrawGesture {
  const origin = snapPointMm(worldToGroundMm(worldM), stepMm);
  return { originMm: origin, currentMm: origin };
}

/** Actualiza la esquina actual del gesto (punto en metros, mundo). */
export function updateDrawGesture(
  gesture: DrawGesture,
  worldM: readonly [number, number, number],
  stepMm: number,
): DrawGesture {
  if (gesture.originMm === null) return gesture;
  return {
    originMm: gesture.originMm,
    currentMm: snapPointMm(worldToGroundMm(worldM), stepMm),
  };
}

/** Cancelación (Escape): vuelve al gesto vacío sin estados parciales. */
export function cancelDrawGesture(): DrawGesture {
  return createDrawGesture();
}

/** Dimensiones snapeadas del gesto (ancho × profundidad, mm). */
export function drawDimensionsMm(
  gesture: DrawGesture,
): { readonly widthMm: number; readonly depthMm: number } | null {
  if (gesture.originMm === null || gesture.currentMm === null) return null;
  return {
    widthMm: Math.abs(gesture.currentMm[0] - gesture.originMm[0]),
    depthMm: Math.abs(gesture.currentMm[1] - gesture.originMm[1]),
  };
}

/**
 * Rectángulo axial a partir de dos esquinas (mm enteros):
 * esquinas normalizadas a la mínima (I2), winding fijo y cierre
 * implícito (el primero no se repite). Devuelve `null` si:
 *
 * - tras normalizar, el rectángulo es degenerado (ancho o
 *   profundidad 0 → área 0), o
 * - alguna coordenada queda fuera de la cota provisional
 *   `SCENE_LIMITS.coordinateMm.max`.
 */
export function rectangleSketchFromCorners(
  cornerA: MmPoint2,
  cornerB: MmPoint2,
): Sketch2D | null {
  const minX = Math.min(cornerA[0], cornerB[0]);
  const maxX = Math.max(cornerA[0], cornerB[0]);
  const minZ = Math.min(cornerA[1], cornerB[1]);
  const maxZ = Math.max(cornerA[1], cornerB[1]);
  if (maxX === minX || maxZ === minZ) return null;
  const limit = SCENE_LIMITS.coordinateMm.max;
  if (
    Math.abs(minX) > limit ||
    Math.abs(maxX) > limit ||
    Math.abs(minZ) > limit ||
    Math.abs(maxZ) > limit
  ) {
    return null;
  }
  return {
    plane: 'ground',
    planeOriginMm: [0, 0, 0],
    pointsMm: [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ],
    closed: true,
  };
}

/**
 * Cierra el gesto: devuelve el `Sketch2D` válido o `null` si el
 * arrastre fue degenerado (clic, línea) o quedó fuera de cota.
 */
export function finishDrawGesture(gesture: DrawGesture): Sketch2D | null {
  if (gesture.originMm === null || gesture.currentMm === null) return null;
  return rectangleSketchFromCorners(gesture.originMm, gesture.currentMm);
}
