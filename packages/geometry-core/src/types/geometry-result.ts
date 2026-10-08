/**
 * GeometryResult: salida del motor geométrico.
 *
 * `totals.panelVolumeMm3` (mm³) sirve para estimaciones futuras de material
 * y costeo; no tiene efecto sobre la geometría.
 */

import type { Panel } from './panel.js';
import type { DrawerAssembly } from './drawer.js';
import type { HangingRod } from './rod.js';
import type { Wardrobe } from './wardrobe.js';

export interface GeometryTotals {
  panelCount: number;
  panelVolumeMm3: number;
  /** Cantidad de barras de colgado. */
  rodCount: number;
  /** Longitud total de barras de colgado (mm); base futura de costeo. */
  rodLengthMm: number;
  /** Cantidad de cajones (ensamblajes). */
  drawerCount: number;
  /** Cantidad de piezas de cajón (frentes, laterales, traseras, fondos). */
  drawerPartCount: number;
}

export interface GeometryResult {
  wardrobe: Wardrobe;
  panels: Panel[];
  rods: HangingRod[];
  /** Cajoneras: ensamblajes que relacionan los paneles de cada cajón. */
  drawers: DrawerAssembly[];
  totals: GeometryTotals;
}
