/**
 * Wardrobe resuelta: el clóset con dimensiones externas, módulos con anchos
 * útiles ya distribuidos y materiales con ids deterministas.
 */

import type { Material } from './material.js';
import type { Module } from './module.js';

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
}

export interface Wardrobe extends WardrobeDimensions {
  modules: Module[];
  materials: WardrobeMaterials;
}
