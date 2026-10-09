/**
 * Generación de paneles a partir de un clóset resuelto.
 *
 * Paneles globales: laterales (a toda altura), superior e
 * inferior (entre los laterales). Por módulo: entrepaños
 * (solo `kind: 'shelves'`, distribuidos uniformemente) y
 * divisiones entre módulos consecutivos.
 *
 * Panel trasero (Fase 2C, opcional): montaje por encaje
 * PROVISIONAL — ocupa el plano posterior entre laterales y
 * entre superior e inferior; con panel trasero activado,
 * los paneles interiores (entrepaños y divisiones) se
 * acortan a `profundidad − espesor trasero` para evitar
 * intersecciones.
 *
 * Supuestos PROVISIONAL (docs/product-rules.md §3): sin
 * herrajes; puertas y cajones se generan en sus propios
 * constructores.
 *
 * Función pura y determinista.
 */

import { GeometryError } from '../errors.js';
import type { Panel } from '../types/panel.js';
import type { Wardrobe } from '../types/wardrobe.js';

export function buildPanels(wardrobe: Wardrobe): Panel[] {
  const panels: Panel[] = [];
  const { widthMm, heightMm, depthMm } = wardrobe;
  const { structure, interior } = wardrobe.materials;
  const t = structure.thicknessMm;
  // Panel trasero (encaje): los
  // paneles interiores no penetran
  // el plano posterior.
  const backThicknessMm =
    wardrobe.backPanel?.thicknessMm ?? 0;
  const backMaterial = wardrobe.materials.back;
  if (backThicknessMm > 0 && !backMaterial) {
    // Inalcanzable por construcción:
    // el trasero se resuelve con su
    // material en resolveWardrobe.
    throw new GeometryError(
      'ERR_INVALID_MATERIAL',
      'El panel trasero requiere un material resuelto.',
      {},
    );
  }
  const innerDepthMm = depthMm - backThicknessMm;
  if (backThicknessMm > 0 && innerDepthMm <= 2 * t) {
    throw new GeometryError(
      'ERR_BACK_PANEL_DEPTH',
      `La profundidad (${depthMm} mm) no admite un panel trasero de ${backThicknessMm} mm con laterales de ${t} mm.`,
      { depthMm, backThicknessMm, structureThicknessMm: t },
    );
  }

  // Laterales: a toda altura, en los extremos del ancho.
  panels.push({
    id: 'panel-side-left',
    role: 'side',
    moduleId: null,
    materialId: structure.id,
    sizeMm: { x: t, y: heightMm, z: depthMm },
    positionMm: { x: 0, y: 0, z: 0 },
  });
  panels.push({
    id: 'panel-side-right',
    role: 'side',
    moduleId: null,
    materialId: structure.id,
    sizeMm: { x: t, y: heightMm, z: depthMm },
    positionMm: { x: widthMm - t, y: 0, z: 0 },
  });

  // Inferior y superior: entre los laterales.
  const innerWidthMm = widthMm - 2 * t;
  panels.push({
    id: 'panel-bottom',
    role: 'bottom',
    moduleId: null,
    materialId: structure.id,
    sizeMm: { x: innerWidthMm, y: t, z: depthMm },
    positionMm: { x: t, y: 0, z: 0 },
  });
  panels.push({
    id: 'panel-top',
    role: 'top',
    moduleId: null,
    materialId: structure.id,
    sizeMm: { x: innerWidthMm, y: t, z: depthMm },
    positionMm: { x: t, y: heightMm - t, z: 0 },
  });

  // Interior de módulos.
  const innerHeightMm = heightMm - 2 * t;
  let cursorX = t;
  wardrobe.modules.forEach((module, index) => {
    if (module.kind === 'shelves' && typeof module.shelves === 'number') {
      const shelfCount = module.shelves;
      // Huecos iguales arriba y abajo: (shelfCount + 1) huecos.
      const gapMm = innerHeightMm / (shelfCount + 1);
      for (let i = 1; i <= shelfCount; i++) {
        const centerYmm = t + gapMm * i;
        panels.push({
          id: `panel-shelf-m${index + 1}-${i}`,
          role: 'shelf',
          moduleId: module.id,
          materialId: interior.id,
          // Con panel trasero, el entrepaño
          // llega hasta la cara frontal del
          // trasero (encaje).
          sizeMm: { x: module.widthMm, y: interior.thicknessMm, z: innerDepthMm },
          positionMm: {
            x: cursorX,
            y: Math.round(centerYmm - interior.thicknessMm / 2),
            z: 0,
          },
        });
      }
    }

    // División entre módulos consecutivos (no después del último).
    if (index < wardrobe.modules.length - 1) {
      panels.push({
        id: `panel-divider-${index + 1}`,
        role: 'divider',
        moduleId: null,
        materialId: structure.id,
        sizeMm: { x: t, y: innerHeightMm, z: innerDepthMm },
        positionMm: { x: cursorX + module.widthMm, y: t, z: 0 },
      });
      cursorX += module.widthMm + t;
    } else {
      cursorX += module.widthMm;
    }
  });

  // Panel trasero: entre laterales y entre
  // superior e inferior, contra la cara
  // posterior del mueble.
  if (backThicknessMm > 0 && backMaterial) {
    panels.push({
      id: 'panel-back',
      role: 'back',
      moduleId: null,
      materialId: backMaterial.id,
      sizeMm: { x: innerWidthMm, y: innerHeightMm, z: backThicknessMm },
      positionMm: { x: t, y: t, z: depthMm - backThicknessMm },
    });
  }

  return panels;
}
