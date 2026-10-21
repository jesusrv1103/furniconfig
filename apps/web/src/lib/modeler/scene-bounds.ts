/**
 * WAVE-02 BLOQUE 1 — caja de encuadre de la escena (metros).
 *
 * `ModelerCameraRig` enmarcaba SIEMPRE una caja de trabajo fija
 * (`WORKSPACE_BOX`): en una escena con muebles el encuadre inicial
 * no los centraba ni los mostraba a buen tamaño (hallazgo P-01 de
 * la auditoría WAVE-02).
 *
 * Esta función pura calcula la caja real a partir del documento:
 *
 * - **Clósets** (`component` del registro `wardrobe`): AABB de la
 *   posición del transform + dimensiones del `WardrobeConfig`
 *   parseado de los params (mismos orígenes que la escena).
 * - **Sólidos de croquis**: AABB de los puntos del croquis en X/Z y
 *   altura = extrusión (igual que picking/arrastre en `transform.ts`).
 * - Escena vacía u objetos no representables → caja por defecto
 *   EXACTAMENTE igual a la anterior (`DEFAULT_SCENE_BOUNDS`), para
 *   no alterar el encuadre de la escena vacía ya verificado.
 *
 * El resultado incluye un margen del 10 % por lado (mínimo 200 mm)
 * para que el mueble no pegue a los bordes del encuadre.
 *
 * Regla de uso (mandato BLOQUE 1): recalcular SOLO al crear el
 * primer mueble y cuando el usuario lo pide («Encuadrar»); nunca
 * durante ediciones (evita reencuadres inesperados).
 */

import type { Aabb } from '../camera-views.js';

import type { SceneDocument } from '@furniconfig/modeler-core';

import { mmToM } from '../units.js';
import {
  WARDROBE_COMPONENT_TYPE,
  parseWardrobeParams,
} from './components/wardrobe.js';

/**
 * Caja por defecto de escena vacía: IDÉNTICA a la `WORKSPACE_BOX`
 * original del rig (paridad visual de las 92 comprobaciones).
 */
export const DEFAULT_SCENE_BOUNDS: Aabb = {
  min: [-2, 0, -2],
  max: [2, 2.4, 2],
};

/** Margen de encuadre: 10 % por lado, con mínimo 200 mm. */
const BOUNDS_PAD_RATIO = 0.1;
const BOUNDS_PAD_MIN_MM = 200;

/**
 * Caja AABB (metros) que contiene TODOS los objetos del documento.
 * Si no hay objetos representables, devuelve `DEFAULT_SCENE_BOUNDS`.
 */
export function computeSceneBounds(document: SceneDocument): Aabb {
  let minXmm = Number.POSITIVE_INFINITY;
  let minYmm = Number.POSITIVE_INFINITY;
  let minZmm = Number.POSITIVE_INFINITY;
  let maxXmm = Number.NEGATIVE_INFINITY;
  let maxYmm = Number.NEGATIVE_INFINITY;
  let maxZmm = Number.NEGATIVE_INFINITY;
  let found = false;

  const grow = (
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ): void => {
    found = true;
    minXmm = Math.min(minXmm, x0);
    minYmm = Math.min(minYmm, y0);
    minZmm = Math.min(minZmm, z0);
    maxXmm = Math.max(maxXmm, x1);
    maxYmm = Math.max(maxYmm, y1);
    maxZmm = Math.max(maxZmm, z1);
  };

  for (const object of document.objects) {
    if (object.kind === 'component') {
      if (object.type !== WARDROBE_COMPONENT_TYPE) {
        continue;
      }
      const config = parseWardrobeParams(object.params);
      if (config === null) {
        continue;
      }
      const [x, y, z] = object.transform.positionMm;
      grow(
        x,
        y,
        z,
        x + config.dimensions.widthMm,
        y + config.dimensions.heightMm,
        z + config.dimensions.depthMm,
      );
      continue;
    }

    // Sólido de croquis en suelo: posición autoritativa = esquina
    // mínima del croquis (misma regla que `transform.ts`).
    if (object.geometry.source !== 'sketch') {
      continue;
    }
    const { pointsMm, plane } = object.geometry.sketch;
    if (plane !== 'ground' || pointsMm.length === 0) {
      continue;
    }
    let minPX = Number.POSITIVE_INFINITY;
    let maxPX = Number.NEGATIVE_INFINITY;
    let minPZ = Number.POSITIVE_INFINITY;
    let maxPZ = Number.NEGATIVE_INFINITY;
    for (const [px, pz] of pointsMm) {
      minPX = Math.min(minPX, px);
      maxPX = Math.max(maxPX, px);
      minPZ = Math.min(minPZ, pz);
      maxPZ = Math.max(maxPZ, pz);
    }
    grow(minPX, 0, minPZ, maxPX, object.geometry.extrusionMm, maxPZ);
  }

  if (!found) {
    return DEFAULT_SCENE_BOUNDS;
  }

  const pad = (sizeMm: number): number =>
    Math.max(BOUNDS_PAD_MIN_MM, Math.round(sizeMm * BOUNDS_PAD_RATIO));

  const padX = pad(maxXmm - minXmm);
  const padY = pad(maxYmm - minYmm);
  const padZ = pad(maxZmm - minZmm);

  return {
    min: [
      mmToM(minXmm - padX),
      Math.max(0, mmToM(minYmm - padY)),
      mmToM(minZmm - padZ),
    ],
    max: [mmToM(maxXmm + padX), mmToM(maxYmm + padY), mmToM(maxZmm + padZ)],
  };
}
