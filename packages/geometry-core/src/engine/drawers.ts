/**
 * Generación de cajoneras (ensamblajes de cajones).
 *
 * Un módulo "drawers" genera entre 1 y 8 cajones
 * (PROVISIONAL, default 3). Cada cajón es un
 * ensamblaje de cuatro piezas de tablero:
 *
 * - Frente: panel vertical que cierra el cajón
 *   por delante, con holguras laterales y
 *   superior.
 * - Laterales (2): paneles verticales detrás
 *   del frente, apoyados sobre el fondo.
 * - Trasera: panel vertical contra el fondo
 *   del módulo.
 * - Fondo: panel horizontal en la base del
 *   cajón.
 *
 * Las piezas se generan como `Panel` con roles
 * "drawer-*" (se incluyen en `GeometryResult.panels`
 * para que la presentación las renderice como
 * cualquier otro tablero) y el `DrawerAssembly`
 * las relaciona por `partIds`.
 *
 * Reglas PROVISIONALES (docs/product-rules.md §3,
 * pendientes de validar con carpintería):
 * - El alto interior se reparte en bandas; el
 *   residuo (mm) se distribuye de abajo hacia
 *   arriba (distributeDrawerBands).
 * - Holgura vertical de 3 mm arriba de cada
 *   cajón; holgura lateral de 3 mm por lado
 *   del frente.
 * - El cajón ocupa toda la profundidad interior
 *   del módulo (las guías comerciales restarán
 *   espacio cuando se implementen).
 * - El frente cubre toda la altura de la caja.
 *
 * Compatibilidad: la caja del cajón (ancho
 * entre laterales y profundidad entre frente y
 * trasera) debe caber en el módulo; si no,
 * lanza ERR_DRAWER_DIMENSIONS.
 *
 * Función pura y determinista.
 */

import { WARDROBE_LIMITS } from '../contract/limits.js';
import { GeometryError } from '../errors.js';
import { distributeDrawerBands } from './distribute.js';
import { DEFAULT_DRAWER_COUNT } from '../types/drawer.js';
import type { DrawerAssembly } from '../types/drawer.js';
import type { Panel } from '../types/panel.js';
import type { Wardrobe } from '../types/wardrobe.js';

export interface DrawerPanelsResult {
  /** Paneles de piezas de cajón (roles "drawer-*"). */
  panels: Panel[];
  /** Ensamblajes que relacionan las piezas por cajón. */
  assemblies: DrawerAssembly[];
}

export function buildDrawers(
  wardrobe: Wardrobe,
): DrawerPanelsResult {
  const drawerMaterial = wardrobe.materials.drawer;
  // Sin material de cajón resuelto: no hay
  // módulos "drawers" en el clóset.
  if (!drawerMaterial) {
    return { panels: [], assemblies: [] };
  }

  const structureThicknessMm = wardrobe.materials.structure
    .thicknessMm;
  const drawerThicknessMm = drawerMaterial.thicknessMm;
  const {
    vertical: clearanceVerticalMm,
    lateral: clearanceLateralMm,
  } = WARDROBE_LIMITS.drawerClearanceMm;

  const { depthMm } = wardrobe;
  // Con panel trasero, el cajón vive
  // entre el frente y la cara frontal
  // del trasero (encaje).
  const innerDepthMm =
    depthMm -
    2 * structureThicknessMm -
    (wardrobe.backPanel?.thicknessMm ?? 0);
  // La caja vive entre el frente y la trasera.
  const boxDepthMm = innerDepthMm - 2 * drawerThicknessMm;
  if (boxDepthMm <= 0) {
    throw new GeometryError(
      'ERR_DRAWER_DIMENSIONS',
      `La profundidad interior (${innerDepthMm} mm) no admite cajones de espesor ${drawerThicknessMm} mm.`,
      { innerDepthMm, drawerThicknessMm },
    );
  }

  const panels: Panel[] = [];
  const assemblies: DrawerAssembly[] = [];
  let cursorXMm = structureThicknessMm;

  wardrobe.modules.forEach((module, moduleIndex) => {
    const moduleNumber = moduleIndex + 1;
    const drawerCount =
      module.kind === 'drawers'
        ? (module.drawers ?? DEFAULT_DRAWER_COUNT)
        : 0;

    if (module.kind === 'drawers') {
      const innerWidthMm = module.widthMm;
      const innerHeightMm = module.heightMm;

      // Anchos: el frente lleva holguras laterales;
      // la caja va entre los laterales.
      const frontWidthMm =
        innerWidthMm - 2 * clearanceLateralMm;
      const boxWidthMm = frontWidthMm - 2 * drawerThicknessMm;
      if (frontWidthMm <= 0 || boxWidthMm <= 0) {
        throw new GeometryError(
          'ERR_DRAWER_DIMENSIONS',
          `El ancho interior (${innerWidthMm} mm) no admite cajones de espesor ${drawerThicknessMm} mm con holguras de ${clearanceLateralMm} mm.`,
          {
            innerWidthMm,
            frontWidthMm,
            boxWidthMm,
            drawerThicknessMm,
          },
        );
      }

      // Alturas: bandas con residuo de abajo
      // hacia arriba; el cajón ocupa su banda
      // menos la holgura superior.
      const bandsMm = distributeDrawerBands(
        innerHeightMm,
        drawerCount,
      );

      let cursorYMm = structureThicknessMm;
      for (let index = 0; index < drawerCount; index++) {
        const bandMm = bandsMm[index];
        if (bandMm === undefined) {
          // Inalcanzable por construcción:
          // bandsMm tiene drawerCount elementos.
          throw new GeometryError(
            'ERR_INVALID_DRAWER_COUNT',
            'Falta la banda de altura de un cajón.',
            { index },
          );
        }
        const drawerHeightMm = bandMm - clearanceVerticalMm;
        // La caja (laterales sobre el fondo) debe
        // caber en la altura del cajón.
        if (drawerHeightMm <= drawerThicknessMm) {
          throw new GeometryError(
            'ERR_DRAWER_DIMENSIONS',
            `La altura de banda (${bandMm} mm) no admite un cajón de espesor ${drawerThicknessMm} mm con holgura de ${clearanceVerticalMm} mm.`,
            { bandMm, drawerHeightMm, drawerThicknessMm },
          );
        }

        const assemblyId = `drawer-module-${moduleNumber}-${index + 1}`;
        const partIds: string[] = [];
        const sideHeightMm = drawerHeightMm - drawerThicknessMm;
        const boxZMm = structureThicknessMm + drawerThicknessMm;
        const backZMm = boxZMm + boxDepthMm;

        // Frente (a la altura del cajón, con
        // holguras laterales).
        const frontId = `panel-drawer-front-m${moduleNumber}-${index + 1}`;
        panels.push({
          id: frontId,
          role: 'drawer-front',
          moduleId: module.id,
          materialId: drawerMaterial.id,
          sizeMm: {
            x: frontWidthMm,
            y: drawerHeightMm,
            z: drawerThicknessMm,
          },
          positionMm: {
            x: cursorXMm + clearanceLateralMm,
            y: cursorYMm,
            z: structureThicknessMm,
          },
        });
        partIds.push(frontId);

        // Fondo (en la base del cajón).
        const bottomId = `panel-drawer-bottom-m${moduleNumber}-${index + 1}`;
        panels.push({
          id: bottomId,
          role: 'drawer-bottom',
          moduleId: module.id,
          materialId: drawerMaterial.id,
          sizeMm: {
            x: boxWidthMm,
            y: drawerThicknessMm,
            z: boxDepthMm,
          },
          positionMm: {
            x: cursorXMm + clearanceLateralMm + drawerThicknessMm,
            y: cursorYMm,
            z: boxZMm,
          },
        });
        partIds.push(bottomId);

        // Laterales (sobre el fondo, detrás
        // del frente).
        const sideSizeMm = {
          x: drawerThicknessMm,
          y: sideHeightMm,
          z: boxDepthMm,
        };
        const sideLeftId = `panel-drawer-side-l-m${moduleNumber}-${index + 1}`;
        panels.push({
          id: sideLeftId,
          role: 'drawer-side',
          moduleId: module.id,
          materialId: drawerMaterial.id,
          sizeMm: sideSizeMm,
          positionMm: {
            x: cursorXMm + clearanceLateralMm,
            y: cursorYMm + drawerThicknessMm,
            z: boxZMm,
          },
        });
        partIds.push(sideLeftId);

        const sideRightId = `panel-drawer-side-r-m${moduleNumber}-${index + 1}`;
        panels.push({
          id: sideRightId,
          role: 'drawer-side',
          moduleId: module.id,
          materialId: drawerMaterial.id,
          sizeMm: sideSizeMm,
          positionMm: {
            x: cursorXMm + clearanceLateralMm + boxWidthMm,
            y: cursorYMm + drawerThicknessMm,
            z: boxZMm,
          },
        });
        partIds.push(sideRightId);

        // Trasera (a toda altura del cajón,
        // contra el fondo del módulo).
        const backId = `panel-drawer-back-m${moduleNumber}-${index + 1}`;
        panels.push({
          id: backId,
          role: 'drawer-back',
          moduleId: module.id,
          materialId: drawerMaterial.id,
          sizeMm: {
            x: frontWidthMm,
            y: drawerHeightMm,
            z: drawerThicknessMm,
          },
          positionMm: {
            x: cursorXMm + clearanceLateralMm,
            y: cursorYMm,
            z: backZMm,
          },
        });
        partIds.push(backId);

        assemblies.push({
          id: assemblyId,
          moduleId: module.id,
          index: index + 1,
          partIds,
        });

        cursorYMm += bandMm;
      }
    }

    // Avance del cursor: igual que en buildPanels
    // (división de espesor completo entre módulos
    // consecutivos).
    if (moduleIndex < wardrobe.modules.length - 1) {
      cursorXMm += module.widthMm + structureThicknessMm;
    } else {
      cursorXMm += module.widthMm;
    }
  });

  return { panels, assemblies };
}
