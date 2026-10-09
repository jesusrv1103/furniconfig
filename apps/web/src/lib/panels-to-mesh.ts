/**
 * Transformación de paneles del motor a datos renderizables.
 *
 * Capa de adaptación entre el motor (mm, esquina mínima) y la
 * escena 3D (metros, centro de la caja). Función pura: no muta
 * el panel de entrada.
 */

import type {
  Door,
  DoorHandle,
  DoorHingeSide,
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

export interface RenderableDoor {
  id: string;
  moduleId: string;
  /** Orden de la hoja dentro del módulo (1-based). */
  leafIndex: number;
  /** Cantidad de hojas del módulo (1 o 2). */
  leafCount: number;
  /** Lado de la bisagra (eje de apertura). */
  hingeSide: DoorHingeSide;
  /** Tamaño en metros (x = ancho, y = alto, z = espesor). */
  sizeM: [number, number, number];
  /** Esquina mínima en metros (posición CERRADA). */
  positionM: [number, number, number];
  /** Centro en metros (posición CERRADA). */
  centerM: [number, number, number];
  materialId: string;
}

/** Convierte una puerta del motor (mm) a datos de renderizado (m). */
export function toRenderableDoor(door: Door): RenderableDoor {
  const positionM: [number, number, number] = [
    mmToM(door.positionMm.x),
    mmToM(door.positionMm.y),
    mmToM(door.positionMm.z),
  ];
  const sizeM: [number, number, number] = [
    mmToM(door.widthMm),
    mmToM(door.heightMm),
    mmToM(door.thicknessMm),
  ];
  const centerM: [number, number, number] = [
    positionM[0] + sizeM[0] / 2,
    positionM[1] + sizeM[1] / 2,
    positionM[2] + sizeM[2] / 2,
  ];

  return {
    id: door.id,
    moduleId: door.moduleId,
    leafIndex: door.leafIndex,
    leafCount: door.leafCount,
    hingeSide: door.hingeSide,
    sizeM,
    positionM,
    centerM,
    materialId: door.materialId,
  };
}

/** Convierte todas las puertas de un GeometryResult. */
export function toRenderableDoors(
  doors: readonly Door[],
): RenderableDoor[] {
  return doors.map(toRenderableDoor);
}

export interface RenderableHandle {
  id: string;
  /** Puerta a la que pertenece el tirador. */
  doorId: string;
  moduleId: string;
  axis: RodAxis;
  /** Longitud en metros, sobre el eje del tirador. */
  lengthM: number;
  /** Diámetro en metros. */
  diameterM: number;
  /** Centro del cilindro en metros (posición CERRADA). */
  centerM: [number, number, number];
  materialId: string;
}

/** Convierte un tirador del motor (mm) a datos de renderizado (m). */
export function toRenderableHandle(
  handle: DoorHandle,
): RenderableHandle {
  const centerM: [number, number, number] = [
    mmToM(handle.positionMm.x + handle.lengthMm / 2),
    mmToM(handle.positionMm.y + handle.diameterMm / 2),
    mmToM(handle.positionMm.z + handle.diameterMm / 2),
  ];

  return {
    id: handle.id,
    doorId: handle.doorId,
    moduleId: handle.moduleId,
    axis: handle.axis,
    lengthM: mmToM(handle.lengthMm),
    diameterM: mmToM(handle.diameterMm),
    centerM,
    materialId: handle.materialId,
  };
}

/** Convierte todos los tiradores de un GeometryResult. */
export function toRenderableHandles(
  handles: readonly DoorHandle[],
): RenderableHandle[] {
  return handles.map(toRenderableHandle);
}
