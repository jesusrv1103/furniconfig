/**
 * Transformación de paneles del motor a datos renderizables.
 *
 * Capa de adaptación entre el motor (mm, esquina mínima) y la
 * escena 3D (metros, centro de la caja). Función pura: no muta
 * el panel de entrada.
 */

import type { Panel, PanelRole } from '@furniconfig/geometry-core';
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
