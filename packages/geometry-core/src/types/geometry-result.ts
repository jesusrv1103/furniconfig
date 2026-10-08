/**
 * GeometryResult: salida del motor geométrico.
 *
 * `totals.panelVolumeMm3` (mm³) sirve para estimaciones futuras de material
 * y costeo; no tiene efecto sobre la geometría.
 */

import type { Panel } from './panel.js';
import type { Wardrobe } from './wardrobe.js';

export interface GeometryTotals {
  panelCount: number;
  panelVolumeMm3: number;
}

export interface GeometryResult {
  wardrobe: Wardrobe;
  panels: Panel[];
  totals: GeometryTotals;
}
