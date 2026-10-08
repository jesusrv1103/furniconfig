/**
 * Transformación de paneles del motor a datos renderizables.
 *
 * Capa de adaptación entre el motor (mm, esquina mínima) y la
 * escena 3D (metros, centro de la caja). Función pura: no muta
 * el panel de entrada.
 */

import type {
  HangingRod,
  Panel,
  PanelRole,
  RodAxis,
} from '@furniconfig/geometry-core';
import { mmToM } from './units.js';

export interface RenderablePanel {
  id: string;
  role: PanelRole;
  moduleId: string | null;
  materialId: string;
  /** Tamaño en metros (x = ancho, y = alto, z = profundidad). */
  sizeM: [number, number, number];
  /** Esquina mínima en metros (sistema del motor). */
  positionM: [number, number, number];
  /** Centro en metros, calculado para posicionar BoxGeometry. */
  centerM: [number, number, number];
}

/** Convierte un panel del motor (mm) a datos de renderizado (m). */
export function toRenderablePanel(panel: Panel): RenderablePanel {
  const positionM: [number, number, number] = [
    mmToM(panel.positionMm.x),
    mmToM(panel.positionMm.y),
    mmToM(panel.positionMm.z),
  ];
  const sizeM: [number, number, number] = [
    mmToM(panel.sizeMm.x),
    mmToM(panel.sizeMm.y),
    mmToM(panel.sizeMm.z),
  ];
  const centerM: [number, number, number] = [
    positionM[0] + sizeM[0] / 2,
    positionM[1] + sizeM[1] / 2,
    positionM[2] + sizeM[2] / 2,
  ];

  return {
    id: panel.id,
    role: panel.role,
    moduleId: panel.moduleId,
    materialId: panel.materialId,
    sizeM,
    positionM,
    centerM,
  };
}

/** Convierte todos los paneles de un GeometryResult. */
export function toRenderablePanels(
  panels: readonly Panel[],
): RenderablePanel[] {
  return panels.map(toRenderablePanel);
}

/** Envolvente (bbox) de una barra en mm, según su eje. */
export function rodBoundingBox(
  axis: RodAxis,
  lengthMm: number,
  diameterMm: number,
): [number, number, number] {
  switch (axis) {
    case 'x':
      return [lengthMm, diameterMm, diameterMm];
    case 'y':
      return [diameterMm, lengthMm, diameterMm];
    case 'z':
      return [diameterMm, diameterMm, lengthMm];
  }
}

export interface RenderableRod {
  id: string;
  moduleId: string;
  axis: RodAxis;
  /** Longitud en metros, sobre el eje de la barra. */
  lengthM: number;
  /** Diámetro en metros. */
  diameterM: number;
  /** Centro del cilindro en metros. */
  centerM: [number, number, number];
  materialId: string;
}

/** Convierte una barra del motor (mm) a datos de renderizado (m). */
export function toRenderableRod(rod: HangingRod): RenderableRod {
  const boundingBoxMm = rodBoundingBox(
    rod.axis,
    rod.lengthMm,
    rod.diameterMm,
  );
  const positionM: [number, number, number] = [
    mmToM(rod.positionMm.x),
    mmToM(rod.positionMm.y),
    mmToM(rod.positionMm.z),
  ];
  const sizeM: [number, number, number] = [
    mmToM(boundingBoxMm[0]),
    mmToM(boundingBoxMm[1]),
    mmToM(boundingBoxMm[2]),
  ];
  const centerM: [number, number, number] = [
    positionM[0] + sizeM[0] / 2,
    positionM[1] + sizeM[1] / 2,
    positionM[2] + sizeM[2] / 2,
  ];

  return {
    id: rod.id,
    moduleId: rod.moduleId,
    axis: rod.axis,
    lengthM: mmToM(rod.lengthMm),
    diameterM: mmToM(rod.diameterMm),
    centerM,
    materialId: rod.materialId,
  };
}

/** Convierte todas las barras de un GeometryResult. */
export function toRenderableRods(
  rods: readonly HangingRod[],
): RenderableRod[] {
  return rods.map(toRenderableRod);
}
