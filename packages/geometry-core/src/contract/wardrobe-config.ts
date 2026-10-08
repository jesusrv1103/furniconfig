/**
 * Contrato de configuración del clóset, versión 1.
 *
 * El contrato es JSON-serializable y versionado (ADR-007): toda entrada debe
 * declarar `schemaVersion`; el validador rechaza versiones desconocidas para
 * permitir evolucionar el formato sin romper el motor.
 */

import type { MaterialSpec } from '../types/material.js';
import type { ModuleConfig } from '../types/module.js';

export const WARDROBE_CONFIG_SCHEMA_VERSION = 1;

export interface WardrobeConfig {
  schemaVersion: typeof WARDROBE_CONFIG_SCHEMA_VERSION;
  /** Dimensiones externas del clóset, en milímetros enteros. */
  dimensions: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
  };
  /** Entre 1 y 4 módulos verticales (regla confirmada del producto). */
  modules: ModuleConfig[];
  materials: {
    structure: MaterialSpec;
    interior: MaterialSpec;
  };
}
