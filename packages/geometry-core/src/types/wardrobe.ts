/**
 * Wardrobe resuelta: el clóset con dimensiones externas, módulos con anchos
 * útiles ya distribuidos y materiales con ids deterministas.
 */

import type { Material } from './material.js';
import type { Module } from './module.js';
import type { RodMaterial } from './rod.js';
import type {
  DoorHingeSide,
  DoorLeafCount,
} from './door.js';

export interface WardrobeDimensions {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export interface WardrobeMaterials {
  /** Laterales, superior, inferior y divisiones. */
  structure: Material;
  /** Entrepaños. */
  interior: Material;
  /** Barras de colgado; presente solo con módulos "hanging". */
  rod?: RodMaterial;
  /** Piezas de cajón (frentes, laterales, traseras, fondos);
   * presente solo con módulos "drawers". */
  drawer?: Material;
  /** Hojas de puerta; presente solo con puertas activadas. */
  door?: Material;
  /** Tiradores de puerta; presente solo con puertas activadas. */
  handle?: RodMaterial;
  /** Panel trasero; presente solo con panel trasero activado. */
  back?: Material;
}

export interface Wardrobe extends WardrobeDimensions {
  modules: Module[];
  materials: WardrobeMaterials;
  /** Diámetro resuelto de las barras; presente con módulos "hanging". */
  hangingRodDiameterMm?: number;
  /**
   * Configuración de puertas resuelta
   * (defaults aplicados); presente con
   * puertas activadas.
   */
  doorsConfig?: {
    leaves: DoorLeafCount;
    hingeSide: DoorHingeSide;
    clearanceMm: number;
  };
  /**
   * Panel trasero resuelto (montaje por
   * encaje); presente solo con panel
   * trasero activado. El material se
   * resuelve en `materials.back`.
   */
  backPanel?: { thicknessMm: number };
}
