/**
 * Generación de barras de colgado (componentes cilíndricos).
 *
 * Una barra por cada módulo "hanging". Reglas PROVISIONALES
 * (docs/product-rules.md §3, pendientes de validar con
 * carpintería):
 * - Eje X (horizontal, a lo ancho del módulo).
 * - Longitud = ancho interior útil del módulo (sin holguras:
 *   las holguras de montaje están por confirmar).
 * - Centro a `mountDistanceMm` por debajo de la cara inferior
 *   del tablero superior.
 * - Centrada en la profundidad (Z).
 *
 * Compatibilidad: la barra debe caber entre los tableros
 * superior e inferior; si no, lanza ERR_HANGING_ROD_HEIGHT.
 *
 * Función pura y determinista.
 */

import { WARDROBE_LIMITS } from '../contract/limits.js';
import { GeometryError } from '../errors.js';
import type { HangingRod } from '../types/rod.js';
import type { Wardrobe } from '../types/wardrobe.js';

export function buildRods(wardrobe: Wardrobe): HangingRod[] {
  const rodMaterial = wardrobe.materials.rod;
  const diameterMm = wardrobe.hangingRodDiameterMm;
  // Sin módulos "hanging" no hay barras ni material de barra.
  if (!rodMaterial || diameterMm === undefined) {
    return [];
  }

  const { heightMm, depthMm } = wardrobe;
  const structureThicknessMm = wardrobe.materials.structure.thicknessMm;
  const innerHeightMm = heightMm - 2 * structureThicknessMm;
  const { mountDistanceMm } = WARDROBE_LIMITS.hangingRod;

  // La barra (radio incluido) debe caber bajo el tablero superior.
  if (innerHeightMm < mountDistanceMm + diameterMm / 2) {
    throw new GeometryError(
      'ERR_HANGING_ROD_HEIGHT',
      `La altura interior (${innerHeightMm} mm) no admite una barra de ${diameterMm} mm de diámetro a ${mountDistanceMm} mm del superior.`,
      { innerHeightMm, diameterMm, mountDistanceMm },
    );
  }

  const centerYMm = heightMm - structureThicknessMm - mountDistanceMm;
  const centerZMm = depthMm / 2;
  const radiusMm = diameterMm / 2;

  const rods: HangingRod[] = [];
  let cursorXMm = structureThicknessMm;

  wardrobe.modules.forEach((module, index) => {
    if (module.kind === 'hanging') {
      const lengthMm = module.widthMm;
      const centerXMm = cursorXMm + lengthMm / 2;
      rods.push({
        id: `rod-module-${index + 1}`,
        moduleId: module.id,
        axis: 'x',
        lengthMm,
        diameterMm,
        positionMm: {
          x: cursorXMm,
          y: centerYMm - radiusMm,
          z: centerZMm - radiusMm,
        },
        materialId: rodMaterial.id,
      });
    }

    // Avance del cursor: igual que en buildPanels (división
    // de espesor completo entre módulos consecutivos).
    if (index < wardrobe.modules.length - 1) {
      cursorXMm += module.widthMm + structureThicknessMm;
    } else {
      cursorXMm += module.widthMm;
    }
  });

  return rods;
}
