/**
 * Edición numérica de cotas de un rectángulo (FASE-4C-B, B2).
 *
 * Módulo **aditivo**: no modifica `SceneDocument` v1 ni
 * `CommandHistory`; aporta la operación pura que el plan del MVP
 * (POC_PLAN paso3) llamaba `setSketchDimension` y que los
 * contratos existentes no ofrecían.
 *
 * Semántica (§4 de la preparación de 4C-B):
 *
 * - Las cotas se expresan en **mm enteros** (I1) y se validan
 *   contra `SCENE_LIMITS.coordinateMm`.
 * - El ancla es la **esquina mínima** del rectángulo (I2):
 *   cambiar el ancho o la profundidad conserva la esquina mínima
 *   y mueve la opuesta, igual que al dibujar.
 * - El resultado vuelve a la normalización canónica (winding
 *   fijo, cierre implícito), de modo que `setSketchDimension`
 *   sobre un rectángulo ya normalizado no cambia el orden.
 * - Solo se admiten rectángulos **axialmente alineados** de4
 *   vértices (el único tipo que produce la herramienta de
 *   dibujo); croquis no alineados rechazan con
 *   `ERR_SCENE_INVALID_OBJECT` en lugar de aproximar.
 *
 * La extrusión NO se edita aquí: es una cota del objeto sólido y
 * ya tiene su comando (`createSetExtrusionCommand`) con sus
 * propios límites (`SCENE_LIMITS.extrusionMm`).
 */

import { SceneError } from './errors.js';
import { SCENE_LIMITS } from './limits.js';
import type { MmPoint2, Sketch2D } from './types/document.js';

/** Cotas editables de un rectángulo (en el espacio del croquis). */
export type SketchDimension = 'widthMm' | 'depthMm';

/** Extent de un rectángulo axial; null si el croquis no lo es. */
function axialExtent(
  sketch: Sketch2D,
): { minU: number; maxU: number; minV: number; maxV: number } | null {
  const points = sketch.pointsMm;
  if (!Array.isArray(points) || points.length !== 4) return null;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const point of points as readonly MmPoint2[]) {
    if (!Array.isArray(point) || point.length !== 2) return null;
    const [u, v] = point;
    if (!Number.isInteger(u) || !Number.isInteger(v)) return null;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  if (maxU === minU || maxV === minV) return null;
  // Rectángulo axial: los4 vértices deben ser exactamente las4
  // esquinas del extent (sin puntos intermedios ni diagonales).
  const corners = new Set(
    points.map(([u, v]) => `${u}:${v}` as string),
  );
  if (corners.size !== 4) return null;
  for (const [u, v] of points as readonly MmPoint2[]) {
    const uOk = u === minU || u === maxU;
    const vOk = v === minV || v === maxV;
    if (!uOk || !vOk) return null;
  }
  return { minU, maxU, minV, maxV };
}

function requireAxialRect(sketch: Sketch2D): {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
} {
  const extent = axialExtent(sketch);
  if (extent === null) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'setSketchDimension solo admite rectángulos axialmente alineados de4 vértices.',
      { points: String(sketch.pointsMm?.length ?? 0) },
    );
  }
  return extent;
}

/**
 * Cota vigente de un rectángulo (ancho = extent de la primera
 * coordenada del croquis; profundidad = de la segunda).
 *
 * @throws SceneError `ERR_SCENE_INVALID_OBJECT` si el croquis no
 * es un rectángulo axial.
 */
export function sketchDimensionMm(
  sketch: Sketch2D,
  dimension: SketchDimension,
): number {
  const { minU, maxU, minV, maxV } = requireAxialRect(sketch);
  return dimension === 'widthMm' ? maxU - minU : maxV - minV;
}

/**
 * Devuelve un NUEVO croquis con la cota indicada (mm enteros),
 * anclado en la esquina mínima. Puro: nunca muta el croquis
 * recibido.
 *
 * @throws SceneError `ERR_SCENE_INVALID_OBJECT` si `valueMm` no
 * es un entero ≥ 1, si la cota resultante sale de la cota
 * `SCENE_LIMITS.coordinateMm` o si el croquis no es un
 * rectángulo axial.
 */
export function setSketchDimension(
  sketch: Sketch2D,
  dimension: SketchDimension,
  valueMm: number,
): Sketch2D {
  if (!Number.isInteger(valueMm) || valueMm < 1) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'La cota debe ser un entero mm ≥ 1.',
      { dimension, value: String(valueMm) },
    );
  }
  const { minU, maxU, minV, maxV } = requireAxialRect(sketch);
  const limit = SCENE_LIMITS.coordinateMm.max;

  let nextMinU = minU;
  let nextMaxU = maxU;
  let nextMinV = minV;
  let nextMaxV = maxV;
  if (dimension === 'widthMm') {
    nextMaxU = minU + valueMm;
  } else {
    nextMaxV = minV + valueMm;
  }

  const outOfBounds =
    Math.abs(nextMinU) > limit ||
    Math.abs(nextMaxU) > limit ||
    Math.abs(nextMinV) > limit ||
    Math.abs(nextMaxV) > limit;
  if (outOfBounds) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `La cota dejaría el rectángulo fuera de ±${limit} mm.`,
      { dimension, value: String(valueMm) },
    );
  }

  return {
    plane: sketch.plane,
    planeOriginMm: sketch.planeOriginMm,
    pointsMm: [
      [nextMinU, nextMinV],
      [nextMaxU, nextMinV],
      [nextMaxU, nextMaxV],
      [nextMinU, nextMaxV],
    ],
    closed: true,
  };
}
